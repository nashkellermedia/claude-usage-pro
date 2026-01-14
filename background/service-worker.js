/**
 * Claude Usage Pro - Background Service Worker
 * Handles storage, sync, and cross-tab communication
 */

// Default usage data structure
const DEFAULT_USAGE = {
  modelUsage: {
    'claude-sonnet-4': 0,
    'claude-opus-4': 0,
    'claude-haiku-4': 0
  },
  messagesCount: 0,
  usageCap: 45000000,
  resetTimestamp: getNextResetTime(),
  lastSynced: null
};

// Firebase config (user can set this in settings)
let firebaseConfig = null;

/**
 * Get next reset time (midnight UTC)
 */
function getNextResetTime() {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  return tomorrow.getTime();
}

/**
 * Normalize model name
 */
function normalizeModel(model) {
  if (!model) return 'claude-sonnet-4';
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'claude-opus-4';
  if (lower.includes('haiku')) return 'claude-haiku-4';
  return 'claude-sonnet-4';
}

/**
 * Get stored usage data
 */
async function getUsageData() {
  try {
    const result = await chrome.storage.local.get(['usageData', 'settings']);
    let data = result.usageData || { ...DEFAULT_USAGE };
    
    // Check if we need to reset (new day)
    if (data.resetTimestamp && Date.now() >= data.resetTimestamp) {
      console.log('[CUP BG] Resetting usage for new day');
      data = {
        ...DEFAULT_USAGE,
        resetTimestamp: getNextResetTime()
      };
      await chrome.storage.local.set({ usageData: data });
    }
    
    // Apply settings cap if set
    if (result.settings?.quota) {
      data.usageCap = result.settings.quota;
    }
    
    return data;
  } catch (e) {
    console.error('[CUP BG] Get usage error:', e);
    return { ...DEFAULT_USAGE };
  }
}

/**
 * Save usage data
 */
async function saveUsageData(data) {
  try {
    data.lastSynced = Date.now();
    await chrome.storage.local.set({ usageData: data });
    
    // Update badge
    updateBadge(data);
    
    return data;
  } catch (e) {
    console.error('[CUP BG] Save usage error:', e);
    return data;
  }
}

/**
 * Update extension badge
 */
async function updateBadge(usageData) {
  try {
    const settings = (await chrome.storage.local.get('settings')).settings || {};
    if (settings.showBadge === false) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    
    const modelUsage = usageData.modelUsage || {};
    let weightedTotal = 0;
    weightedTotal += (modelUsage['claude-sonnet-4'] || 0) * 1.0;
    weightedTotal += (modelUsage['claude-opus-4'] || 0) * 5.0;
    weightedTotal += (modelUsage['claude-haiku-4'] || 0) * 0.2;
    
    const cap = usageData.usageCap || 45000000;
    const percent = (weightedTotal / cap) * 100;
    
    // Show percentage on badge
    const text = percent >= 100 ? '!' : Math.round(percent) + '%';
    
    chrome.action.setBadgeText({ text });
    
    // Color based on usage
    let color = '#22c55e'; // green
    if (percent >= 90) color = '#ef4444'; // red
    else if (percent >= 70) color = '#f59e0b'; // yellow
    
    chrome.action.setBadgeBackgroundColor({ color });
    
  } catch (e) {
    // Badge update failed, ignore
  }
}

/**
 * Notify all Claude tabs of update
 */
function notifyAllTabs(usageData) {
  chrome.tabs.query({ url: 'https://claude.ai/*' }).then(tabs => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'USAGE_UPDATED', usageData }).catch(() => {});
    }
  }).catch(() => {});
}

/**
 * Message handler
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  const { type } = message;
  
  switch (type) {
    case 'GET_USAGE_DATA': {
      const usageData = await getUsageData();
      return { usageData };
    }
    
    case 'MESSAGE_SENT': {
      const data = await getUsageData();
      const model = normalizeModel(message.model);
      const tokens = message.tokens || 0;
      
      data.modelUsage = data.modelUsage || {};
      data.modelUsage[model] = (data.modelUsage[model] || 0) + tokens;
      data.messagesCount = (data.messagesCount || 0) + 1;
      
      await saveUsageData(data);
      notifyAllTabs(data);
      return { usageData: data };
    }
    
    case 'MESSAGE_RECEIVED': {
      const data = await getUsageData();
      const model = normalizeModel(message.model);
      const tokens = message.tokens || 0;
      
      data.modelUsage = data.modelUsage || {};
      data.modelUsage[model] = (data.modelUsage[model] || 0) + tokens;
      
      await saveUsageData(data);
      notifyAllTabs(data);
      return { usageData: data };
    }
    
    case 'SYNC_SCRAPED_DATA': {
      const data = await getUsageData();
      const scraped = message.data;
      
      if (scraped) {
        // Merge scraped data
        if (scraped.totalTokens) {
          // If we have total, distribute to default model
          data.modelUsage = data.modelUsage || {};
          data.modelUsage['claude-sonnet-4'] = scraped.totalTokens;
        }
        if (scraped.modelUsage) {
          data.modelUsage = { ...data.modelUsage, ...scraped.modelUsage };
        }
        if (scraped.messagesCount) {
          data.messagesCount = scraped.messagesCount;
        }
        if (scraped.usageCap) {
          data.usageCap = scraped.usageCap;
        }
        if (scraped.resetTimestamp) {
          data.resetTimestamp = scraped.resetTimestamp;
        }
      }
      
      await saveUsageData(data);
      notifyAllTabs(data);
      return { usageData: data };
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
    
    case 'GET_SETTINGS': {
      const result = await chrome.storage.local.get('settings');
      return { settings: result.settings || {} };
    }
    
    case 'SAVE_SETTINGS': {
      await chrome.storage.local.set({ settings: message.settings });
      
      // Update usage cap if changed
      if (message.settings.quota) {
        const data = await getUsageData();
        data.usageCap = message.settings.quota;
        await saveUsageData(data);
      }
      
      return { success: true };
    }
    
    case 'RESET_USAGE': {
      const freshData = {
        ...DEFAULT_USAGE,
        resetTimestamp: getNextResetTime(),
        lastSynced: Date.now()
      };
      await saveUsageData(freshData);
      notifyAllTabs(freshData);
      return { usageData: freshData };
    }
    
    case 'SET_FIREBASE_CONFIG': {
      firebaseConfig = message.config;
      await chrome.storage.local.set({ firebaseConfig: message.config });
      return { success: true };
    }
    
    default:
      return { error: 'Unknown message type' };
  }
}

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[CUP BG] Extension installed/updated');
  
  // Initialize with default data
  const existing = await chrome.storage.local.get('usageData');
  if (!existing.usageData) {
    await chrome.storage.local.set({
      usageData: { ...DEFAULT_USAGE, resetTimestamp: getNextResetTime() }
    });
  }
  
  // Load Firebase config
  const config = await chrome.storage.local.get('firebaseConfig');
  if (config.firebaseConfig) {
    firebaseConfig = config.firebaseConfig;
  }
});

// Periodic sync alarm
chrome.alarms.create('syncUsage', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncUsage') {
    // Trigger scrape on active Claude tabs
    try {
      const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRAPE_USAGE' }).catch(() => {});
      }
    } catch (e) {}
  }
});

console.log('[CUP BG] Service worker loaded');
