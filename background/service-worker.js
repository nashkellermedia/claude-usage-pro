/**
 * Claude Usage Pro - Background Service Worker
 * Handles token tracking, storage, and badge updates
 */

// Import utilities
importScripts('../lib/utils.js');

const Utils = ClaudeUsageUtils;

// State management
let currentStats = {
  tokensUsed: 0,
  quota: 100000,
  costUsed: 0,
  budget: 1.00,
  usagePercentage: 0,
  messagesCount: 0,
  lastReset: Date.now(),
  nextReset: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
};

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Claude Usage Pro installed!', details.reason);
  
  // Set default settings
  const settings = Utils.getDefaultSettings();
  await Utils.storage.setSettings(settings);
  
  // Initialize stats
  await initializeStats();
  
  // Set up daily reset alarm
  chrome.alarms.create('dailyReset', {
    periodInMinutes: 60 * 24 // 24 hours
  });
  
  // Update badge
  await Utils.badge.update(currentStats);
});

/**
 * Initialize or load stats from storage
 */
async function initializeStats() {
  const stored = await Utils.storage.get('currentStats');
  
  if (stored) {
    currentStats = stored;
  } else {
    await Utils.storage.set('currentStats', currentStats);
  }
  
  return currentStats;
}

/**
 * Update stats and persist
 */
async function updateStats(delta) {
  currentStats.tokensUsed += delta.tokens || 0;
  currentStats.costUsed += delta.cost || 0;
  currentStats.messagesCount += delta.messages || 0;
  currentStats.usagePercentage = (currentStats.tokensUsed / currentStats.quota) * 100;
  
  await Utils.storage.set('currentStats', currentStats);
  await Utils.badge.update(currentStats);
  
  // Check thresholds
  await checkThresholds();
  
  return currentStats;
}

/**
 * Check alert thresholds
 */
async function checkThresholds() {
  const settings = await Utils.storage.getSettings();
  const { alertThresholds } = settings;
  const percentage = currentStats.usagePercentage;
  
  // Get already triggered alerts
  const triggered = await Utils.storage.get('triggeredAlerts', []);
  
  for (const threshold of alertThresholds) {
    if (percentage >= threshold && !triggered.includes(threshold)) {
      await Utils.notifications.showThresholdAlert(threshold);
      triggered.push(threshold);
      await Utils.storage.set('triggeredAlerts', triggered);
    }
  }
}

/**
 * Reset daily stats
 */
async function resetDailyStats() {
  console.log('Resetting daily stats...');
  
  currentStats = {
    tokensUsed: 0,
    quota: 100000,
    costUsed: 0,
    budget: 1.00,
    usagePercentage: 0,
    messagesCount: 0,
    lastReset: Date.now(),
    nextReset: Date.now() + (24 * 60 * 60 * 1000)
  };
  
  await Utils.storage.set('currentStats', currentStats);
  await Utils.storage.set('triggeredAlerts', []);
  await Utils.badge.update(currentStats);
  
  await Utils.notifications.show(
    '🔄 Quota Reset',
    'Your daily Claude usage quota has been reset!'
  );
}

/**
 * Handle alarms
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyReset') {
    await resetDailyStats();
  }
});

/**
 * Message handler for content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'GET_STATS':
        await initializeStats();
        sendResponse({ stats: currentStats });
        break;
        
      case 'UPDATE_STATS':
        const updated = await updateStats(message.delta);
        sendResponse({ stats: updated });
        break;
        
      case 'GET_SETTINGS':
        const settings = await Utils.storage.getSettings();
        sendResponse({ settings });
        break;
        
      case 'UPDATE_SETTINGS':
        await Utils.storage.setSettings(message.settings);
        await Utils.badge.update(currentStats);
        sendResponse({ success: true });
        break;
        
      case 'RESET_STATS':
        await resetDailyStats();
        sendResponse({ stats: currentStats });
        break;
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  
  return true; // Required for async sendResponse
});

// Initialize on startup
(async () => {
  await initializeStats();
  await Utils.badge.update(currentStats);
  console.log('Claude Usage Pro background service worker ready!');
})();
