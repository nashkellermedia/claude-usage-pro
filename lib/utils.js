/**
 * Claude Usage Pro - Utility Functions
 * Common utilities used across the extension
 */

const Utils = {
  /**
   * Format numbers with proper abbreviations
   */
  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  },

  /**
   * Format currency
   */
  formatCurrency(amount, decimals = 2) {
    return '$' + amount.toFixed(decimals);
  },

  /**
   * Format percentage
   */
  formatPercentage(value, total) {
    if (total === 0) return '0%';
    return Math.round((value / total) * 100) + '%';
  },

  /**
   * Calculate usage color based on percentage
   */
  getUsageColor(percentage) {
    if (percentage >= 95) return '#EF4444'; // Red
    if (percentage >= 80) return '#F59E0B'; // Orange
    if (percentage >= 50) return '#FBBF24'; // Yellow
    return '#10B981'; // Green
  },

  /**
   * Get time until reset (formatted)
   */
  formatTimeUntilReset(resetTimestamp) {
    const now = Date.now();
    const diff = resetTimestamp - now;
    
    if (diff <= 0) return 'Resetting...';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  },

  /**
   * Debounce function calls
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Deep clone object
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * Get model pricing (cost per 1K tokens)
   */
  getModelPricing(model) {
    const pricing = {
      'claude-sonnet-4': { input: 0.003, output: 0.015, cached: 0.0003 },
      'claude-sonnet-3.5': { input: 0.003, output: 0.015, cached: 0.0003 },
      'claude-opus-4': { input: 0.015, output: 0.075, cached: 0.0015 },
      'claude-haiku-4': { input: 0.0008, output: 0.004, cached: 0.00008 },
      'claude-haiku-3.5': { input: 0.0008, output: 0.004, cached: 0.00008 }
    };
    
    return pricing[model] || pricing['claude-sonnet-4'];
  },

  /**
   * Calculate cost for tokens
   */
  calculateCost(inputTokens, outputTokens, cachedTokens, model) {
    const pricing = this.getModelPricing(model);
    
    const inputCost = ((inputTokens - cachedTokens) / 1000) * pricing.input;
    const cachedCost = (cachedTokens / 1000) * pricing.cached;
    const outputCost = (outputTokens / 1000) * pricing.output;
    
    return inputCost + cachedCost + outputCost;
  },

  /**
   * Get default settings
   */
  getDefaultSettings() {
    return {
      // Badge settings
      badgeMode: 'percentage', // 'percentage', 'tokens', 'cost', 'messages', 'custom'
      badgeCustomText: '',
      
      // Alert settings
      alertThresholds: [50, 75, 90, 95],
      notificationsEnabled: true,
      
      // Display settings
      theme: 'auto', // 'auto', 'light', 'dark'
      overlayPosition: 'top-right',
      showCachedTokens: true,
      showCostEstimates: true,
      
      // Quota settings
      dailyQuota: 100000, // Default: 100K tokens/day
      monthlyCost: 1.00, // Default budget
      
      // Firebase sync
      firebaseEnabled: false,
      firebaseConfig: null,
      
      // Advanced
      trackingEnabled: true,
      detailedLogging: false
    };
  },

  /**
   * Storage helpers
   */
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

  /**
   * Badge management
   */
  badge: {
    /**
     * Update badge based on current settings and stats
     */
    async update(stats) {
      const settings = await Utils.storage.getSettings();
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
          color = '#8B5CF6'; // Purple for message count
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
    },

    /**
     * Clear badge
     */
    async clear() {
      await chrome.action.setBadgeText({ text: '' });
    }
  },

  /**
   * Notification helpers
   */
  notifications: {
    async show(title, message, type = 'info') {
      const settings = await Utils.storage.getSettings();
      if (!settings.notificationsEnabled) return;
      
      const iconUrl = chrome.runtime.getURL('assets/icons/icon-128.png');
      
      await chrome.notifications.create({
        type: 'basic',
        iconUrl,
        title,
        message,
        priority: type === 'warning' ? 2 : 1
      });
    },

    async showThresholdAlert(percentage) {
      await this.show(
        '⚠️ Usage Alert',
        `You've used ${percentage}% of your Claude quota.`,
        'warning'
      );
    }
  }
};

// Make available globally
if (typeof window !== 'undefined') {
  window.ClaudeUsageUtils = Utils;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
