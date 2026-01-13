/**
 * Claude Usage Pro - Background Service Worker
 * 
 * Handles:
 * - Storage of usage data
 * - Communication with content scripts
 * - Badge updates
 * - Alarms for reset checks
 */

// Default usage quota (45M tokens for Pro)
const DEFAULT_QUOTA = 45000000;

// Storage keys
const STORAGE_KEYS = {
  USAGE_DATA: 'usageData',
  SETTINGS: 'settings',
  CONVERSATIONS: 'conversations'
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
 * Add usage for a message
 */
async function addUsage(tokens, model) {
  const usageData = await getUsageData();
  
  // Normalize model name
  const normalizedModel = normalizeModel(model);
  
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
      modelUsage: {
        'claude-sonnet-4': 0,
        'claude-haiku-4': 0,
        'claude-opus-4': 0
      }
    };
    
    await saveUsageData(newData);
    await updateBadge(newData);
    await notifyAllTabs(newData);
    
    // Show notification
    await showResetNotification();
    
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
  
  const percentage = (weightedTotal / usageData.usageCap) * 100;
  
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
 * Show reset notification
 */
async function showResetNotification() {
  const settings = await getSettings();
  
  if (settings.notifications !== false) {
    // Check if we have notification permission
    const permission = await chrome.permissions.contains({ permissions: ['notifications'] });
    
    if (permission) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Claude Usage Reset',
        message: 'Your usage quota has been reset! You\'re back to full capacity.'
      });
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
    quota: DEFAULT_QUOTA
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
      switch (message.type) {
        case 'GET_USAGE_DATA': {
          const usageData = await getUsageData();
          sendResponse({ usageData });
          break;
        }
        
        case 'MESSAGE_SENT':
        case 'MESSAGE_RECEIVED': {
          const usageData = await addUsage(message.tokens, message.model);
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
          const newData = {
            tokensUsed: 0,
            usageCap: (await getSettings()).quota || DEFAULT_QUOTA,
            resetTimestamp: getNextResetTimestamp(),
            messagesCount: 0,
            lastUpdated: Date.now(),
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
        
        case 'OPEN_POPUP': {
          // Can't programmatically open popup, but can open options page
          chrome.runtime.openOptionsPage();
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

// Setup alarm for periodic reset check
chrome.alarms.create('checkReset', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkReset') {
    await checkAndReset();
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
