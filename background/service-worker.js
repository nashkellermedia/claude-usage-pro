/**
 * Claude Usage Pro - Background Service Worker
 * Handles token tracking, storage, and badge updates
 */

console.log('🚀 Service worker starting...');

// Inline utils
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
        text = settings.badgeCustomText || '---';
        color = '#8B5CF6';
        break;
      default:
        text = '0%';
    }
    
    try {
      await chrome.action.setBadgeText({ text });
      await chrome.action.setBadgeBackgroundColor({ color });
    } catch (error) {
      console.error('Badge update error:', error);
    }
  }
};

// Initialize stats if they don't exist
async function initializeStats() {
  const stats = await Utils.storage.get('currentStats');
  
  if (!stats) {
    const newStats = {
      tokensUsed: 0,
      quota: 100000,
      costUsed: 0,
      budget: 1.00,
      usagePercentage: 0,
      messagesCount: 0,
      nextReset: Date.now() + (24 * 60 * 60 * 1000),
      lastUpdated: Date.now()
    };
    
    await Utils.storage.set('currentStats', newStats);
    console.log('✅ Initialized default stats:', newStats);
    return newStats;
  }
  
  return stats;
}

// Get current stats
async function getStats() {
  let stats = await Utils.storage.get('currentStats');
  
  if (!stats) {
    stats = await initializeStats();
  }
  
  console.log('📊 Getting stats:', stats);
  return stats;
}

// Handle stats update from content script
async function handleStatsUpdate(delta, usage) {
  console.log('📊 Updating stats with delta:', delta);
  
  // Get current stats
  let stats = await getStats();
  
  // Update stats
  stats.tokensUsed += delta.tokens || 0;
  stats.costUsed += delta.cost || 0;
  stats.messagesCount += delta.messages || 0;
  stats.usagePercentage = (stats.tokensUsed / stats.quota) * 100;
  stats.lastUpdated = Date.now();
  
  // Save updated stats
  await Utils.storage.set('currentStats', stats);
  
  // Update badge
  const settings = await Utils.storage.getSettings();
  await Utils.updateBadge(stats, settings);
  
  console.log('✅ Stats updated:', stats);
  
  return stats;
}

// Reset stats daily
async function resetDailyStats() {
  console.log('🔄 Resetting daily stats...');
  
  const newStats = {
    tokensUsed: 0,
    quota: 100000,
    costUsed: 0,
    budget: 1.00,
    usagePercentage: 0,
    messagesCount: 0,
    nextReset: Date.now() + (24 * 60 * 60 * 1000),
    lastUpdated: Date.now()
  };
  
  await Utils.storage.set('currentStats', newStats);
  
  const settings = await Utils.storage.getSettings();
  await Utils.updateBadge(newStats, settings);
  
  console.log('✅ Stats reset');
}

// Message handler - SINGLE LISTENER
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📬 Service worker received message:', message.type);
  
  // Handle async operations properly
  (async () => {
    try {
      switch (message.type) {
        case 'GET_STATS': {
          const stats = await getStats();
          sendResponse({ success: true, stats });
          break;
        }
        
        case 'UPDATE_STATS': {
          const stats = await handleStatsUpdate(message.delta, message.usage);
          sendResponse({ success: true, stats });
          break;
        }
        
        case 'OPEN_POPUP': {
          await chrome.action.openPopup();
          sendResponse({ success: true });
          break;
        }
        
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('❌ Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Keep channel open for async response
});

// Setup daily reset alarm
chrome.alarms.create('dailyReset', {
  periodInMinutes: 24 * 60
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    resetDailyStats();
  }
});

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('🎉 Extension installed/updated');
  await initializeStats();
  
  const settings = await Utils.storage.getSettings();
  const stats = await getStats();
  await Utils.updateBadge(stats, settings);
});

// Initialize on startup
(async () => {
  await initializeStats();
  const settings = await Utils.storage.getSettings();
  const stats = await getStats();
  await Utils.updateBadge(stats, settings);
  console.log('✅ Service worker ready');
})();
