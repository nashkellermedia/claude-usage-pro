/**
 * Claude Usage Pro - Background Service Worker
 * 
 * Handles:
 * - Storage of usage data (local + Firebase sync)
 * - Communication with content scripts
 * - Badge updates
 * - Periodic sync with Claude's actual usage page
 */

// Default usage quota (45M tokens for Pro)
const DEFAULT_QUOTA = 45000000;

// Storage keys
const STORAGE_KEYS = {
  USAGE_DATA: 'usageData',
  SETTINGS: 'settings',
  CONVERSATIONS: 'conversations',
  FIREBASE_CONFIG: 'firebaseConfig',
  LAST_SYNC: 'lastSync'
};

/**
 * Initialize default usage data
 */
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

/**
 * Get next reset timestamp (next day at midnight UTC, or configurable)
 */
function getNextResetTimestamp() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

/**
 * Get usage data from storage
 */
async function getUsageData() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.USAGE_DATA);
  return data[STORAGE_KEYS.USAGE_DATA] || await initializeUsageData();
}

/**
 * Save usage data to storage
 */
async function saveUsageData(usageData) {
  await chrome.storage.local.set({ [STORAGE_KEYS.USAGE_DATA]: usageData });
}

/**
 * Normalize model name - handles null/undefined safely
 */
function normalizeModel(model) {
  if (!model || typeof model !== 'string') return 'claude-sonnet-4';
  
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'claude-opus-4';
  if (lower.includes('haiku')) return 'claude-haiku-4';
  return 'claude-sonnet-4';
}

/**
 * Add usage for a message
 */
async function addUsage(tokens, model) {
  const usageData = await getUsageData();
  
  // Normalize model name safely
  const normalizedModel = normalizeModel(model);
  
  // Initialize modelUsage if needed
  if (!usageData.modelUsage) {
    usageData.modelUsage = {
      'claude-sonnet-4': 0,
      'claude-haiku-4': 0,
      'claude-opus-4': 0
    };
  }
  
  // Add to model-specific usage
  usageData.modelUsage[normalizedModel] = (usageData.modelUsage[normalizedModel] || 0) + tokens;
  
  // Update totals
  usageData.tokensUsed += tokens;
  usageData.messagesCount++;
  usageData.lastUpdated = Date.now();
  
  await saveUsageData(usageData);
  await updateBadge(usageData);
  await notifyAllTabs(usageData);
  
  console.log(`[CUP] Added ${tokens} tokens for ${normalizedModel}`);
  return usageData;
}

/**
 * Sync with actual Claude usage data (scraped from settings page)
 */
async function syncWithScrapedData(scrapedData) {
  const usageData = await getUsageData();
  
  if (scrapedData.usagePercent !== undefined) {
    usageData.syncedUsagePercent = scrapedData.usagePercent;
    usageData.lastSynced = Date.now();
    
    // Calculate actual tokens from percentage
    if (scrapedData.usagePercent > 0) {
      const actualTokens = Math.round((scrapedData.usagePercent / 100) * usageData.usageCap);
      usageData.tokensUsed = actualTokens;
    }
  }
  
  if (scrapedData.resetTime) {
    usageData.resetTimestamp = scrapedData.resetTime;
  }
  
  if (scrapedData.planType) {
    usageData.planType = scrapedData.planType;
  }
  
  await saveUsageData(usageData);
  await updateBadge(usageData);
  await notifyAllTabs(usageData);
  
  console.log('[CUP] Synced with scraped data:', scrapedData);
  return usageData;
}

/**
 * Check and reset if expired
 */
async function checkAndReset() {
  const usageData = await getUsageData();
  
  if (Date.now() >= usageData.resetTimestamp) {
    console.log('[CUP] Usage period expired, resetting...');
    
    const newData = {
      tokensUsed: 0,
      usageCap: usageData.usageCap,
      resetTimestamp: getNextResetTimestamp(),
      messagesCount: 0,
      lastUpdated: Date.now(),
      lastSynced: usageData.lastSynced,
      syncedUsagePercent: 0,
      modelUsage: {
        'claude-sonnet-4': 0,
        'claude-haiku-4': 0,
        'claude-opus-4': 0
      }
    };
    
    await saveUsageData(newData);
    await updateBadge(newData);
    await notifyAllTabs(newData);
    
    return newData;
  }
  
  return usageData;
}

/**
 * Update the extension badge
 */
async function updateBadge(usageData) {
  // Calculate weighted usage percentage
  let weightedTotal = 0;
  const multipliers = {
    'claude-sonnet-4': 1.0,
    'claude-haiku-4': 0.2,
    'claude-opus-4': 5.0
  };
  
  for (const [model, tokens] of Object.entries(usageData.modelUsage || {})) {
    const mult = multipliers[model] || 1.0;
    weightedTotal += tokens * mult;
  }
  
  // Use synced percentage if available and recent (within 30 min)
  let percentage;
  if (usageData.syncedUsagePercent !== null && 
      usageData.lastSynced && 
      (Date.now() - usageData.lastSynced) < 30 * 60 * 1000) {
    percentage = usageData.syncedUsagePercent;
  } else {
    percentage = (weightedTotal / usageData.usageCap) * 100;
  }
  
  // Set badge text
  const badgeText = percentage >= 100 ? '!' : Math.round(percentage) + '%';
  await chrome.action.setBadgeText({ text: badgeText });
  
  // Set badge color
  let color = '#2c84db'; // Blue
  if (percentage >= 95) color = '#de2929'; // Red
  else if (percentage >= 80) color = '#f59e0b'; // Yellow
  
  await chrome.action.setBadgeBackgroundColor({ color });
}

/**
 * Notify all Claude.ai tabs of updated data
 */
async function notifyAllTabs(usageData) {
  const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
  
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'USAGE_UPDATED',
        usageData
      });
    } catch (error) {
      // Tab might not have content script loaded
    }
  }
}

/**
 * Get settings
 */
async function getSettings() {
  const data = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  return data[STORAGE_KEYS.SETTINGS] || {
    notifications: true,
    showBadge: true,
    quota: DEFAULT_QUOTA,
    syncInterval: 5, // minutes
    firebaseEnabled: false
  };
}

/**
 * Save settings
 */
async function saveSettings(settings) {
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      console.log('[CUP] Received message:', message.type);
      
      switch (message.type) {
        case 'GET_USAGE_DATA': {
          const usageData = await getUsageData();
          sendResponse({ usageData });
          break;
        }
        
        case 'MESSAGE_SENT':
        case 'MESSAGE_RECEIVED': {
          const tokens = message.tokens || 0;
          const model = message.model || 'claude-sonnet-4';
          const usageData = await addUsage(tokens, model);
          sendResponse({ usageData });
          break;
        }
        
        case 'SYNC_SCRAPED_DATA': {
          const usageData = await syncWithScrapedData(message.data);
          sendResponse({ usageData });
          break;
        }
        
        case 'CHECK_RESET': {
          const usageData = await checkAndReset();
          sendResponse({ usageData });
          break;
        }
        
        case 'GET_SETTINGS': {
          const settings = await getSettings();
          sendResponse({ settings });
          break;
        }
        
        case 'SAVE_SETTINGS': {
          await saveSettings(message.settings);
          
          // Update quota if changed
          if (message.settings.quota) {
            const usageData = await getUsageData();
            usageData.usageCap = message.settings.quota;
            await saveUsageData(usageData);
            await updateBadge(usageData);
          }
          
          sendResponse({ success: true });
          break;
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
          await notifyAllTabs(newData);
          sendResponse({ usageData: newData });
          break;
        }
        
        case 'TRIGGER_SYNC': {
          // Tell content script to scrape usage page
          const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*', active: true });
          if (tabs.length > 0) {
            await chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRAPE_USAGE' });
          }
          sendResponse({ success: true });
          break;
        }
        
        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[CUP] Error handling message:', error);
      sendResponse({ error: error.message });
    }
  })();
  
  return true; // Keep channel open for async response
});

// Setup alarm for periodic sync
chrome.alarms.create('syncUsage', { periodInMinutes: 5 });
chrome.alarms.create('checkReset', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkReset') {
    await checkAndReset();
  }
  if (alarm.name === 'syncUsage') {
    // Trigger sync on active Claude tab
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*', active: true });
    if (tabs.length > 0) {
      try {
        await chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRAPE_USAGE' });
      } catch (e) {
        // Tab might not have content script
      }
    }
  }
});

// Initialize on install/update
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[CUP] Extension installed/updated');
  
  const usageData = await initializeUsageData();
  await updateBadge(usageData);
});

// Initialize on startup
(async () => {
  console.log('[CUP] Service worker starting...');
  
  const usageData = await initializeUsageData();
  await updateBadge(usageData);
  
  console.log('[CUP] Service worker ready');
})();
