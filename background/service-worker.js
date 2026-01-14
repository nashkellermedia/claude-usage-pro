/**
 * Claude Usage Pro - Background Service Worker
 */

const DEFAULT_QUOTA = 45000000;

const STORAGE_KEYS = {
  USAGE_DATA: 'usageData',
  SETTINGS: 'settings'
};

async function initializeUsageData() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.USAGE_DATA);
  
  if (!data[STORAGE_KEYS.USAGE_DATA]) {
    const defaultData = {
      tokensUsed: 0,
      usageCap: DEFAULT_QUOTA,
      resetTimestamp: getNextResetTimestamp(),
      messagesCount: 0,
      lastUpdated: Date.now(),
      lastSynced: null,
      syncedUsagePercent: null,
      modelUsage: {
        'claude-sonnet-4': 0,
        'claude-haiku-4': 0,
        'claude-opus-4': 0
      }
    };
    
    await chrome.storage.local.set({ [STORAGE_KEYS.USAGE_DATA]: defaultData });
    console.log('[CUP] Initialized default usage data');
    return defaultData;
  }
  
  return data[STORAGE_KEYS.USAGE_DATA];
}

function getNextResetTimestamp() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

async function getUsageData() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.USAGE_DATA);
  return data[STORAGE_KEYS.USAGE_DATA] || await initializeUsageData();
}

async function saveUsageData(usageData) {
  await chrome.storage.local.set({ [STORAGE_KEYS.USAGE_DATA]: usageData });
}

function normalizeModel(model) {
  if (!model || typeof model !== 'string') return 'claude-sonnet-4';
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'claude-opus-4';
  if (lower.includes('haiku')) return 'claude-haiku-4';
  return 'claude-sonnet-4';
}

async function addUsage(tokens, model) {
  const usageData = await getUsageData();
  const normalizedModel = normalizeModel(model);
  
  if (!usageData.modelUsage) {
    usageData.modelUsage = {
      'claude-sonnet-4': 0,
      'claude-haiku-4': 0,
      'claude-opus-4': 0
    };
  }
  
  usageData.modelUsage[normalizedModel] = (usageData.modelUsage[normalizedModel] || 0) + tokens;
  usageData.tokensUsed += tokens;
  usageData.messagesCount++;
  usageData.lastUpdated = Date.now();
  
  await saveUsageData(usageData);
  await updateBadge(usageData);
  notifyAllTabs(usageData); // Don't await - fire and forget
  
  console.log(`[CUP] Added ${tokens} tokens for ${normalizedModel}`);
  return usageData;
}

async function syncWithScrapedData(scrapedData) {
  const usageData = await getUsageData();
  
  if (scrapedData && scrapedData.usagePercent !== undefined) {
    usageData.syncedUsagePercent = scrapedData.usagePercent;
    usageData.lastSynced = Date.now();
    
    const actualTokens = Math.round((scrapedData.usagePercent / 100) * usageData.usageCap);
    usageData.tokensUsed = actualTokens;
    
    console.log('[CUP] Synced:', scrapedData.usagePercent + '%');
  }
  
  if (scrapedData && scrapedData.resetTime) {
    usageData.resetTimestamp = scrapedData.resetTime;
  }
  
  await saveUsageData(usageData);
  await updateBadge(usageData);
  notifyAllTabs(usageData);
  
  return usageData;
}

async function checkAndReset() {
  const usageData = await getUsageData();
  
  if (Date.now() >= usageData.resetTimestamp) {
    console.log('[CUP] Resetting usage...');
    
    const newData = {
      tokensUsed: 0,
      usageCap: usageData.usageCap,
      resetTimestamp: getNextResetTimestamp(),
      messagesCount: 0,
      lastUpdated: Date.now(),
      lastSynced: null,
      syncedUsagePercent: 0,
      modelUsage: {
        'claude-sonnet-4': 0,
        'claude-haiku-4': 0,
        'claude-opus-4': 0
      }
    };
    
    await saveUsageData(newData);
    await updateBadge(newData);
    notifyAllTabs(newData);
    return newData;
  }
  
  return usageData;
}

async function updateBadge(usageData) {
  let weightedTotal = 0;
  const multipliers = {
    'claude-sonnet-4': 1.0,
    'claude-haiku-4': 0.2,
    'claude-opus-4': 5.0
  };
  
  for (const [model, tokens] of Object.entries(usageData.modelUsage || {})) {
    weightedTotal += tokens * (multipliers[model] || 1.0);
  }
  
  let percentage;
  if (usageData.syncedUsagePercent !== null && usageData.lastSynced && 
      (Date.now() - usageData.lastSynced) < 30 * 60 * 1000) {
    percentage = usageData.syncedUsagePercent;
  } else {
    percentage = (weightedTotal / usageData.usageCap) * 100;
  }
  
  const badgeText = percentage >= 100 ? '!' : Math.round(percentage) + '%';
  await chrome.action.setBadgeText({ text: badgeText });
  
  let color = '#2c84db';
  if (percentage >= 95) color = '#de2929';
  else if (percentage >= 80) color = '#f59e0b';
  
  await chrome.action.setBadgeBackgroundColor({ color });
}

// Fire and forget - don't throw errors for unreachable tabs
function notifyAllTabs(usageData) {
  chrome.tabs.query({ url: 'https://claude.ai/*' }).then(tabs => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'USAGE_UPDATED', usageData }).catch(() => {
        // Tab might not have content script - ignore
      });
    }
  }).catch(() => {});
}

async function getSettings() {
  const data = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  return data[STORAGE_KEYS.SETTINGS] || {
    notifications: true,
    showBadge: true,
    quota: DEFAULT_QUOTA,
    syncInterval: 5
  };
}

async function saveSettings(settings) {
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    console.error('[CUP] Message error:', err);
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  console.log('[CUP] Message:', message.type);
  
  switch (message.type) {
    case 'GET_USAGE_DATA': {
      const usageData = await getUsageData();
      return { usageData };
    }
    
    case 'MESSAGE_SENT':
    case 'MESSAGE_RECEIVED': {
      const tokens = message.tokens || 0;
      const model = message.model || 'claude-sonnet-4';
      const usageData = await addUsage(tokens, model);
      return { usageData };
    }
    
    case 'SYNC_SCRAPED_DATA': {
      const usageData = await syncWithScrapedData(message.data);
      return { usageData };
    }
    
    case 'CHECK_RESET': {
      const usageData = await checkAndReset();
      return { usageData };
    }
    
    case 'GET_SETTINGS': {
      const settings = await getSettings();
      return { settings };
    }
    
    case 'SAVE_SETTINGS': {
      await saveSettings(message.settings);
      if (message.settings.quota) {
        const usageData = await getUsageData();
        usageData.usageCap = message.settings.quota;
        await saveUsageData(usageData);
        await updateBadge(usageData);
      }
      return { success: true };
    }
    
    case 'RESET_USAGE': {
      const settings = await getSettings();
      const newData = {
        tokensUsed: 0,
        usageCap: settings.quota || DEFAULT_QUOTA,
        resetTimestamp: getNextResetTimestamp(),
        messagesCount: 0,
        lastUpdated: Date.now(),
        lastSynced: null,
        syncedUsagePercent: null,
        modelUsage: {
          'claude-sonnet-4': 0,
          'claude-haiku-4': 0,
          'claude-opus-4': 0
        }
      };
      await saveUsageData(newData);
      await updateBadge(newData);
      notifyAllTabs(newData);
      return { usageData: newData };
    }
    
    case 'TRIGGER_SYNC': {
      try {
        const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*', active: true });
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRAPE_USAGE' }).catch(() => {});
        }
      } catch (e) {}
      return { success: true };
    }
    
    default:
      return { error: 'Unknown message type' };
  }
}

// Alarms
chrome.alarms.create('checkReset', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkReset') {
    await checkAndReset();
  }
});

// Initialize
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[CUP] Extension installed');
  const usageData = await initializeUsageData();
  await updateBadge(usageData);
});

(async () => {
  console.log('[CUP] Service worker starting...');
  const usageData = await initializeUsageData();
  await updateBadge(usageData);
  console.log('[CUP] Service worker ready');
})();
