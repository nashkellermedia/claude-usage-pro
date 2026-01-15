/**
 * Claude Usage Pro - Background Service Worker
 */

const DEFAULT_USAGE = {
  currentSession: { percent: 0, resetsIn: '--' },
  weeklyAllModels: { percent: 0, resetsAt: '--' },
  weeklySonnet: { percent: 0, resetsIn: '--' },
  currentModel: 'sonnet',
  lastSynced: null
};

const DEFAULT_SETTINGS = {
  badgeDisplay: 'session',
  showSidebar: true,
  showChatOverlay: true,
  showTopBar: true,
  enableVoice: false
};

async function getUsageData() {
  try {
    const result = await chrome.storage.local.get('usageData');
    return result.usageData || { ...DEFAULT_USAGE };
  } catch (e) {
    console.error('[CUP BG] Get usage error:', e);
    return { ...DEFAULT_USAGE };
  }
}

async function getSettings() {
  try {
    const result = await chrome.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...result.settings };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveUsageData(data) {
  try {
    data.lastSynced = Date.now();
    await chrome.storage.local.set({ usageData: data });
    await updateBadge(data);
    return data;
  } catch (e) {
    console.error('[CUP BG] Save error:', e);
    return data;
  }
}

async function updateBadge(usageData) {
  try {
    const settings = await getSettings();
    const display = settings.badgeDisplay || 'session';
    
    if (display === 'none') {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    
    let percent = 0;
    
    switch (display) {
      case 'session':
        percent = usageData.currentSession?.percent || 0;
        break;
      case 'weekly-all':
        percent = usageData.weeklyAllModels?.percent || 0;
        break;
      case 'weekly-sonnet':
        percent = usageData.weeklySonnet?.percent || 0;
        break;
    }
    
    const text = percent >= 100 ? '!' : percent + '%';
    chrome.action.setBadgeText({ text });
    
    let color = '#22c55e'; // green
    if (percent >= 90) color = '#ef4444'; // red
    else if (percent >= 70) color = '#f59e0b'; // yellow
    
    chrome.action.setBadgeBackgroundColor({ color });
    
  } catch (e) {
    // Badge update failed
  }
}

function notifyAllTabs(usageData) {
  chrome.tabs.query({ url: 'https://claude.ai/*' }).then(tabs => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'USAGE_UPDATED', usageData }).catch(() => {});
    }
  }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(message, sender) {
  const { type } = message;
  
  switch (type) {
    case 'GET_USAGE_DATA': {
      const usageData = await getUsageData();
      return { usageData };
    }
    
    case 'SYNC_SCRAPED_DATA': {
      console.log('[CUP BG] Received scraped data:', message.data);
      
      const scraped = message.data;
      if (!scraped) {
        return { usageData: await getUsageData() };
      }
      
      const usageData = {
        currentSession: scraped.currentSession || { percent: 0, resetsIn: '--' },
        weeklyAllModels: scraped.weeklyAllModels || { percent: 0, resetsAt: '--' },
        weeklySonnet: scraped.weeklySonnet || { percent: 0, resetsIn: '--' },
        currentModel: scraped.currentModel || 'sonnet',
        source: scraped.source,
        scrapedAt: scraped.scrapedAt,
        lastSynced: Date.now()
      };
      
      await saveUsageData(usageData);
      notifyAllTabs(usageData);
      return { usageData };
    }
    
    case 'UPDATE_MODEL': {
      // Update just the current model
      const usageData = await getUsageData();
      usageData.currentModel = message.model || 'sonnet';
      await saveUsageData(usageData);
      notifyAllTabs(usageData);
      return { usageData };
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
      const settings = await getSettings();
      return { settings };
    }
    
    case 'SAVE_SETTINGS': {
      const current = await getSettings();
      const updated = { ...current, ...message.settings };
      await chrome.storage.local.set({ settings: updated });
      
      // Update badge if display setting changed
      const usageData = await getUsageData();
      await updateBadge(usageData);
      
      return { success: true };
    }
    
    case 'RESET_USAGE': {
      const freshData = { ...DEFAULT_USAGE, lastSynced: Date.now() };
      await saveUsageData(freshData);
      notifyAllTabs(freshData);
      return { usageData: freshData };
    }
    
    default:
      return { error: 'Unknown message type' };
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[CUP BG] Extension installed/updated');
  
  const existing = await chrome.storage.local.get(['usageData', 'settings']);
  if (!existing.usageData) {
    await chrome.storage.local.set({ usageData: { ...DEFAULT_USAGE } });
  }
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS } });
  }
});

chrome.alarms.create('syncUsage', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncUsage') {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRAPE_USAGE' }).catch(() => {});
      }
    } catch (e) {}
  }
});

console.log('[CUP BG] Service worker loaded');
