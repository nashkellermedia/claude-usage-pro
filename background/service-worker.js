/**
 * Claude Usage Pro - Background Service Worker
 * Handles storage and sync of percentage-based usage data
 */

// Default usage data - now percentage based
const DEFAULT_USAGE = {
  currentSession: { percent: 0, resetsIn: '--' },
  weeklyAllModels: { percent: 0, resetsAt: '--' },
  weeklySonnet: { percent: 0, resetsIn: '--' },
  currentModel: 'sonnet',
  lastSynced: null
};

/**
 * Get stored usage data
 */
async function getUsageData() {
  try {
    const result = await chrome.storage.local.get('usageData');
    return result.usageData || { ...DEFAULT_USAGE };
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
    updateBadge(data);
    return data;
  } catch (e) {
    console.error('[CUP BG] Save error:', e);
    return data;
  }
}

/**
 * Update extension badge with current session percentage
 */
async function updateBadge(usageData) {
  try {
    const settings = (await chrome.storage.local.get('settings')).settings || {};
    if (settings.showBadge === false) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    
    // Show current session percentage on badge
    const percent = usageData.currentSession?.percent || 0;
    const text = percent >= 100 ? '!' : percent + '%';
    
    chrome.action.setBadgeText({ text });
    
    // Color based on usage
    let color = '#22c55e'; // green
    if (percent >= 90) color = '#ef4444'; // red
    else if (percent >= 70) color = '#f59e0b'; // yellow
    
    chrome.action.setBadgeBackgroundColor({ color });
    
  } catch (e) {
    // Badge update failed
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
      
      // Build new usage data from scraped percentages
      const usageData = {
        currentSession: scraped.currentSession || { percent: 0, resetsIn: '--' },
        weeklyAllModels: scraped.weeklyAllModels || { percent: 0, resetsAt: '--' },
        weeklySonnet: scraped.weeklySonnet || { percent: 0, resetsIn: '--' },
        currentModel: scraped.currentModel || 'sonnet',
        source: scraped.source,
        scrapedAt: scraped.scrapedAt,
        lastSynced: Date.now()
      };
      
      console.log('[CUP BG] Saving usage data:', usageData);
      
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
      const result = await chrome.storage.local.get('settings');
      return { settings: result.settings || {} };
    }
    
    case 'SAVE_SETTINGS': {
      await chrome.storage.local.set({ settings: message.settings });
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

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[CUP BG] Extension installed/updated');
  
  const existing = await chrome.storage.local.get('usageData');
  if (!existing.usageData) {
    await chrome.storage.local.set({ usageData: { ...DEFAULT_USAGE } });
  }
});

// Periodic sync alarm - every 5 minutes
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
