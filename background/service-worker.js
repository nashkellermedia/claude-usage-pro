/**
 * Claude Usage Pro - Background Service Worker
 * Handles token tracking, storage, and badge updates
 */

// Inline utils since importScripts doesn't work with ES modules
const Utils = {
  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  },

  formatCurrency(amount, decimals = 2) {
    return '$' + amount.toFixed(decimals);
  },

  getUsageColor(percentage) {
    if (percentage >= 95) return '#EF4444';
    if (percentage >= 80) return '#F59E0B';
    if (percentage >= 50) return '#FBBF24';
    return '#10B981';
  },

  getDefaultSettings() {
    return {
      badgeMode: 'percentage',
      badgeCustomText: '',
      alertThresholds: [50, 75, 90, 95],
      notificationsEnabled: true,
      theme: 'auto',
      dailyQuota: 100000,
      monthlyCost: 1.00,
      firebaseEnabled: false,
      trackingEnabled: true
    };
  },

  storage: {
    async get(key, defaultValue = null) {
      try {
        const result = await chrome.storage.local.get(key);
        return result[key] !== undefined ? result[key] : defaultValue;
      } catch (error) {
        console.error('Storage get error:', error);
        return defaultValue;
      }
    },

    async set(key, value) {
      try {
        await chrome.storage.local.set({ [key]: value });
        return true;
      } catch (error) {
        console.error('Storage set error:', error);
        return false;
      }
    },

    async getSettings() {
      try {
        const result = await chrome.storage.sync.get('settings');
        const defaults = Utils.getDefaultSettings();
        return { ...defaults, ...result.settings };
      } catch (error) {
        console.error('Get settings error:', error);
        return Utils.getDefaultSettings();
      }
    },

    async setSettings(settings) {
      try {
        await chrome.storage.sync.set({ settings });
        return true;
      } catch (error) {
        console.error('Set settings error:', error);
        return false;
      }
    }
  },

  async updateBadge(stats, settings) {
    const { badgeMode } = settings;
    let text = '';
    let color = Utils.getUsageColor(stats.usagePercentage);
    
    switch (badgeMode) {
      case 'percentage':
        text = Math.round(stats.usagePercentage) + '%';
        break;
      case 'tokens':
        const remaining = stats.quota - stats.tokensUsed;
        text = Utils.formatNumber(remaining);
        break;
      case 'cost':
        const costRemaining = stats.budget - stats.costUsed;
        text = Utils.formatCurrency(costRemaining, 1).replace('$', '');
        break;
      case 'messages':
        text = stats.messagesCount.toString();
        color = '#8B5CF6';
        break;
      case 'custom':
        text = settings.badgeCustomText || '';
        color = '#8B5CF6';
        break;
      default:
        text = Math.round(stats.usagePercentage) + '%';
    }
    
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  }
};

// State management
let currentStats = {
  tokensUsed: 0,
  quota: 100000,
  costUsed: 0,
  budget: 1.00,
  usagePercentage: 0,
  messagesCount: 0,
  lastReset: Date.now(),
  nextReset: Date.now() + (24 * 60 * 60 * 1000)
};

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('🎯 Claude Usage Pro installed!', details.reason);
  
  const settings = Utils.getDefaultSettings();
  await Utils.storage.setSettings(settings);
  await initializeStats();
  
  chrome.alarms.create('dailyReset', {
    periodInMinutes: 60 * 24
  });
  
  await Utils.updateBadge(currentStats, settings);
});

/**
 * Initialize or load stats
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
 * Update stats
 */
async function updateStats(delta) {
  currentStats.tokensUsed += delta.tokens || 0;
  currentStats.costUsed += delta.cost || 0;
  currentStats.messagesCount += delta.messages || 0;
  currentStats.usagePercentage = (currentStats.tokensUsed / currentStats.quota) * 100;
  
  await Utils.storage.set('currentStats', currentStats);
  
  const settings = await Utils.storage.getSettings();
  await Utils.updateBadge(currentStats, settings);
  
  return currentStats;
}

/**
 * Reset daily stats
 */
async function resetDailyStats() {
  console.log('🔄 Resetting daily stats...');
  
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
  
  const settings = await Utils.storage.getSettings();
  await Utils.updateBadge(currentStats, settings);
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
 * Message handler
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
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
          await Utils.updateBadge(currentStats, message.settings);
          sendResponse({ success: true });
          break;
          
        case 'RESET_STATS':
          await resetDailyStats();
          sendResponse({ stats: currentStats });
          break;
          
        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({ error: error.message });
    }
  })();
  
  return true;
});

// Initialize on startup
(async () => {
  await initializeStats();
  const settings = await Utils.storage.getSettings();
  await Utils.updateBadge(currentStats, settings);
  console.log('✅ Claude Usage Pro background service worker ready!');
})();

// Message handler for content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📬 Service worker received message:', message.type);
  
  if (message.type === 'UPDATE_STATS') {
    handleStatsUpdate(message.delta, message.usage)
      .then(stats => sendResponse({ success: true, stats }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'GET_STATS') {
    getStats()
      .then(stats => sendResponse({ success: true, stats }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.type === 'OPEN_POPUP') {
    chrome.action.openPopup();
    sendResponse({ success: true });
    return true;
  }
});

// Handle stats update from content script
async function handleStatsUpdate(delta, usage) {
  console.log('📊 Updating stats:', delta);
  
  // Get current stats
  let stats = await Utils.storage.get('currentStats', {
    tokensUsed: 0,
    quota: 100000,
    costUsed: 0,
    budget: 1.00,
    usagePercentage: 0,
    messagesCount: 0,
    nextReset: Date.now() + (24 * 60 * 60 * 1000)
  });
  
  // Update stats
  stats.tokensUsed += delta.tokens || 0;
  stats.costUsed += delta.cost || 0;
  stats.messagesCount += delta.messages || 0;
  stats.usagePercentage = (stats.tokensUsed / stats.quota) * 100;
  
  // Save updated stats
  await Utils.storage.set('currentStats', stats);
  
  // Update badge
  const settings = await Utils.storage.getSettings();
  await Utils.updateBadge(stats, settings);
  
  console.log('✅ Stats updated:', stats);
  
  return stats;
}

// Get current stats
async function getStats() {
  const stats = await Utils.storage.get('currentStats', {
    tokensUsed: 0,
    quota: 100000,
    costUsed: 0,
    budget: 1.00,
    usagePercentage: 0,
    messagesCount: 0,
    nextReset: Date.now() + (24 * 60 * 60 * 1000)
  });
  
  return stats;
}

console.log('🎯 Service worker fully loaded with message handlers');
