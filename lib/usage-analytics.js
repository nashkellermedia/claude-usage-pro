/**
 * Claude Usage Pro - Usage Analytics & Historical Tracking
 */

class UsageAnalytics {
  constructor() {
    this.lastSnapshot = null;
    this.lastThresholdCheck = {
      session: 0,
      weeklyAll: 0,
      weeklySonnet: 0
    };
  }
  
  /**
   * Process usage data and generate analytics
   */
  async processUsageUpdate(usageData) {
    if (!usageData) return;
    
    const now = Date.now();
    const today = this.getDateKey();
    
    // Get existing analytics
    const analytics = await this.getAnalytics();
    
    // 1. Daily Snapshot
    await this.recordDailySnapshot(analytics, usageData, today);
    
    // 2. Usage Events (threshold crossings)
    await this.recordUsageEvents(analytics, usageData, now);
    
    // 3. Model Usage Stats
    await this.recordModelUsage(analytics, usageData, today);
    
    // 4. Conversation Metrics
    await this.updateConversationMetrics(analytics, today);
    
    // Save analytics
    await this.saveAnalytics(analytics);
    
    return analytics;
  }
  
  /**
   * Record daily snapshot of usage
   */
  async recordDailySnapshot(analytics, usageData, today) {
    if (!analytics.dailySnapshots) {
      analytics.dailySnapshots = {};
    }
    
    // Only snapshot once per day (at most recent data point)
    analytics.dailySnapshots[today] = {
      date: today,
      timestamp: Date.now(),
      session: usageData.currentSession?.percent || 0,
      weeklyAll: usageData.weeklyAllModels?.percent || 0,
      weeklySonnet: usageData.weeklySonnet?.percent || 0,
      currentModel: usageData.currentModel || 'unknown'
    };
    
    // Keep only last 90 days
    this.trimOldData(analytics.dailySnapshots, 90);
  }
  
  /**
   * Record when usage crosses thresholds
   */
  async recordUsageEvents(analytics, usageData, now) {
    if (!analytics.usageEvents) {
      analytics.usageEvents = [];
    }
    
    const thresholds = [70, 90, 100];
    const metrics = {
      session: usageData.currentSession?.percent || 0,
      weeklyAll: usageData.weeklyAllModels?.percent || 0,
      weeklySonnet: usageData.weeklySonnet?.percent || 0
    };
    
    for (const [type, percent] of Object.entries(metrics)) {
      const lastCheck = this.lastThresholdCheck[type];
      
      for (const threshold of thresholds) {
        // Check if we just crossed this threshold
        if (percent >= threshold && lastCheck < threshold) {
          analytics.usageEvents.push({
            timestamp: now,
            date: this.getDateKey(),
            type: type,
            threshold: threshold,
            percent: percent
          });
        }
      }
      
      this.lastThresholdCheck[type] = percent;
    }
    
    // Keep only last 500 events
    if (analytics.usageEvents.length > 500) {
      analytics.usageEvents = analytics.usageEvents.slice(-500);
    }
  }
  
  /**
   * Track which models are being used
   */
  async recordModelUsage(analytics, usageData, today) {
    if (!analytics.modelUsage) {
      analytics.modelUsage = {};
    }
    
    const model = usageData.currentModel || 'unknown';
    
    if (!analytics.modelUsage[today]) {
      analytics.modelUsage[today] = {};
    }
    
    if (!analytics.modelUsage[today][model]) {
      analytics.modelUsage[today][model] = 0;
    }
    
    // Increment usage count for this model today
    analytics.modelUsage[today][model]++;
    
    // Keep only last 90 days
    this.trimOldData(analytics.modelUsage, 90);
  }
  
  /**
   * Update conversation metrics
   */
  async updateConversationMetrics(analytics, today) {
    if (!analytics.conversationMetrics) {
      analytics.conversationMetrics = {};
    }
    
    if (!analytics.conversationMetrics[today]) {
      analytics.conversationMetrics[today] = {
        date: today,
        count: 0,
        lastUpdated: Date.now()
      };
    }
    
    // Increment conversation count (this gets called on each usage update)
    // We'll estimate conversations based on session resets
    analytics.conversationMetrics[today].lastUpdated = Date.now();
    
    // Keep only last 90 days
    this.trimOldData(analytics.conversationMetrics, 90);
  }
  
  /**
   * Get analytics from storage
   */
  async getAnalytics() {
    try {
      const result = await chrome.storage.local.get('usageAnalytics');
      return result.usageAnalytics || {
        dailySnapshots: {},
        usageEvents: [],
        modelUsage: {},
        conversationMetrics: {},
        version: 1
      };
    } catch (e) {
      console.error('[Analytics] Get error:', e);
      return {
        dailySnapshots: {},
        usageEvents: [],
        modelUsage: {},
        conversationMetrics: {},
        version: 1
      };
    }
  }
  
  /**
   * Save analytics to storage
   */
  async saveAnalytics(analytics) {
    try {
      analytics.lastUpdated = Date.now();
      await chrome.storage.local.set({ usageAnalytics: analytics });
    } catch (e) {
      console.error('[Analytics] Save error:', e);
    }
  }
  
  /**
   * Get summary statistics
   */
  async getSummary(days = 30) {
    const analytics = await this.getAnalytics();
    const cutoffDate = this.getDateKey(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    // Filter to recent data
    const recentSnapshots = Object.values(analytics.dailySnapshots || {})
      .filter(s => s.date >= cutoffDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    
    const recentEvents = (analytics.usageEvents || [])
      .filter(e => e.date >= cutoffDate);
    
    // Calculate stats
    const summary = {
      period: `Last ${days} days`,
      days: recentSnapshots.length,
      averageUsage: {
        session: this.average(recentSnapshots.map(s => s.session)),
        weeklyAll: this.average(recentSnapshots.map(s => s.weeklyAll)),
        weeklySonnet: this.average(recentSnapshots.map(s => s.weeklySonnet))
      },
      peakUsage: {
        session: Math.max(...recentSnapshots.map(s => s.session), 0),
        weeklyAll: Math.max(...recentSnapshots.map(s => s.weeklyAll), 0),
        weeklySonnet: Math.max(...recentSnapshots.map(s => s.weeklySonnet), 0)
      },
      thresholdHits: {
        total: recentEvents.length,
        by70: recentEvents.filter(e => e.threshold === 70).length,
        by90: recentEvents.filter(e => e.threshold === 90).length,
        by100: recentEvents.filter(e => e.threshold === 100).length
      },
      modelPreference: this.calculateModelPreference(analytics.modelUsage, cutoffDate),
      snapshots: recentSnapshots
    };
    
    return summary;
  }
  
  /**
   * Calculate average
   */
  average(arr) {
    if (!arr || arr.length === 0) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }
  
  /**
   * Calculate model preference
   */
  calculateModelPreference(modelUsage, cutoffDate) {
    const totals = {};
    
    for (const [date, models] of Object.entries(modelUsage || {})) {
      if (date >= cutoffDate) {
        for (const [model, count] of Object.entries(models)) {
          totals[model] = (totals[model] || 0) + count;
        }
      }
    }
    
    return totals;
  }
  
  /**
   * Get date key (YYYY-MM-DD)
   */
  getDateKey(timestamp = Date.now()) {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0];
  }
  
  /**
   * Trim old data beyond X days
   */
  trimOldData(obj, days) {
    const cutoff = this.getDateKey(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    for (const key of Object.keys(obj)) {
      if (key < cutoff) {
        delete obj[key];
      }
    }
  }
  
  /**
   * Export analytics data
   */
  async exportData() {
    const analytics = await this.getAnalytics();
    const summary = await this.getSummary(90);
    
    return {
      analytics,
      summary,
      exportedAt: new Date().toISOString()
    };
  }
}

// Export
if (typeof window !== 'undefined') {
  window.UsageAnalytics = UsageAnalytics;
}

if (typeof self !== 'undefined' && self.UsageAnalytics === undefined) {
  self.UsageAnalytics = UsageAnalytics;
}

console.log('[CUP] Usage Analytics loaded');
