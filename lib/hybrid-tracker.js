/**
 * Claude Usage Pro - Hybrid Usage Tracker
 * 
 * Combines multiple data sources for the most accurate usage tracking:
 * 1. API Fetch (most accurate, but requires network call)
 * 2. Page Scraping (accurate when on usage page)
 * 3. Token Delta Tracking (fills gaps between accurate readings)
 * 4. Firebase Sync (cross-device aggregation)
 * 
 * The key insight is that we maintain:
 * - A "baseline" (last known accurate reading from API or scraping)
 * - A "delta" (accumulated token usage since baseline)
 * - An estimated current usage (baseline + delta converted to %)
 */

class HybridTracker {
  constructor() {
    this.baseline = null;
    this.delta = {
      inputTokens: 0,
      outputTokens: 0,
      lastReset: Date.now()
    };
    this.estimatedUsage = null;
    
    // Token to percentage conversion estimates
    // These are rough estimates and may need tuning
    this.tokenRates = {
      // Approximate tokens per 1% of 5-hour session limit
      sessionTokensPer1Percent: 3000,
      // Approximate tokens per 1% of weekly limit
      weeklyTokensPer1Percent: 45000
    };
  }

  /**
   * Initialize from storage
   */
  async initialize() {
    try {
      const stored = await chrome.storage.local.get([
        'cup_baseline',
        'cup_delta',
        'cup_token_rates'
      ]);

      if (stored.cup_baseline) {
        this.baseline = stored.cup_baseline;
      }

      if (stored.cup_delta) {
        this.delta = stored.cup_delta;
      }

      if (stored.cup_token_rates) {
        this.tokenRates = stored.cup_token_rates;
      }

      // Calculate current estimate
      this.updateEstimate();

      console.log('[HybridTracker] Initialized:', {
        hasBaseline: !!this.baseline,
        deltaTokens: this.delta.inputTokens + this.delta.outputTokens
      });

      return true;
    } catch (e) {
      console.error('[HybridTracker] Init error:', e.message);
      return false;
    }
  }

  /**
   * Record a new baseline from API fetch or page scrape
   * This is the "source of truth" moment
   */
  async setBaseline(usageData, source = 'unknown') {
    const now = Date.now();

    this.baseline = {
      currentSession: usageData.currentSession || { percent: 0, resetsIn: '--' },
      weeklyAllModels: usageData.weeklyAllModels || { percent: 0, resetsAt: '--' },
      weeklySonnet: usageData.weeklySonnet || { percent: 0, resetsIn: '--' },
      source: source,
      timestamp: now
    };

    // Reset delta since we have fresh accurate data
    this.delta = {
      inputTokens: 0,
      outputTokens: 0,
      lastReset: now
    };

    // Save to storage
    await this.save();

    // Update estimate
    this.updateEstimate();

    console.log('[HybridTracker] New baseline set from', source, ':', this.baseline);

    return this.baseline;
  }

  /**
   * Add token delta from intercepted messages
   */
  async addTokenDelta(inputTokens = 0, outputTokens = 0) {
    this.delta.inputTokens += inputTokens;
    this.delta.outputTokens += outputTokens;

    // Update estimate
    this.updateEstimate();

    // Save periodically (not every token to avoid thrashing storage)
    // Save every ~1000 tokens
    const totalDelta = this.delta.inputTokens + this.delta.outputTokens;
    if (totalDelta % 1000 < (inputTokens + outputTokens)) {
      await this.save();
    }

    return this.estimatedUsage;
  }

  /**
   * Update the estimated usage based on baseline + delta
   */
  updateEstimate() {
    if (!this.baseline) {
      // No baseline - can't estimate
      this.estimatedUsage = null;
      return;
    }

    const totalDeltaTokens = this.delta.inputTokens + this.delta.outputTokens;

    // Calculate delta as percentage
    const sessionDeltaPercent = totalDeltaTokens / this.tokenRates.sessionTokensPer1Percent;
    const weeklyDeltaPercent = totalDeltaTokens / this.tokenRates.weeklyTokensPer1Percent;

    this.estimatedUsage = {
      currentSession: {
        percent: Math.min(100, Math.round(
          (this.baseline.currentSession?.percent || 0) + sessionDeltaPercent
        )),
        resetsIn: this.baseline.currentSession?.resetsIn || '--',
        isEstimate: true
      },
      weeklyAllModels: {
        percent: Math.min(100, Math.round(
          (this.baseline.weeklyAllModels?.percent || 0) + weeklyDeltaPercent
        )),
        resetsAt: this.baseline.weeklyAllModels?.resetsAt || '--',
        isEstimate: true
      },
      weeklySonnet: this.baseline.weeklySonnet ? {
        percent: Math.min(100, Math.round(
          (this.baseline.weeklySonnet?.percent || 0) + weeklyDeltaPercent
        )),
        resetsIn: this.baseline.weeklySonnet?.resetsIn || '--',
        isEstimate: true
      } : null,
      baselineSource: this.baseline.source,
      baselineAge: Date.now() - this.baseline.timestamp,
      deltaTokens: totalDeltaTokens,
      estimatedAt: Date.now()
    };
  }

  /**
   * Get current usage (best available data)
   */
  getCurrentUsage() {
    return this.estimatedUsage || {
      currentSession: { percent: 0, resetsIn: '--', isEstimate: true },
      weeklyAllModels: { percent: 0, resetsAt: '--', isEstimate: true },
      weeklySonnet: null,
      baselineSource: 'none',
      baselineAge: null,
      deltaTokens: 0
    };
  }

  /**
   * Get baseline age in human readable format
   */
  getBaselineAge() {
    if (!this.baseline) return 'No baseline';

    const ageMs = Date.now() - this.baseline.timestamp;
    const ageMinutes = Math.floor(ageMs / 60000);
    const ageHours = Math.floor(ageMinutes / 60);

    if (ageHours > 0) {
      return `${ageHours}h ${ageMinutes % 60}m ago`;
    } else if (ageMinutes > 0) {
      return `${ageMinutes}m ago`;
    } else {
      return 'Just now';
    }
  }

  /**
   * Check if baseline is stale (older than threshold)
   */
  isBaselineStale(thresholdMs = 300000) { // 5 minutes default
    if (!this.baseline) return true;
    return (Date.now() - this.baseline.timestamp) > thresholdMs;
  }

  /**
   * Merge with data from another device (Firebase sync)
   */
  async mergeFromFirebase(firebaseData) {
    if (!firebaseData || !firebaseData.baseline) {
      return false;
    }

    // If Firebase baseline is newer, use it
    if (!this.baseline || firebaseData.baseline.timestamp > this.baseline.timestamp) {
      console.log('[HybridTracker] Using newer baseline from Firebase');
      this.baseline = firebaseData.baseline;

      // Merge deltas - add Firebase delta that accumulated since their baseline
      if (firebaseData.delta) {
        // Only add if from different device or newer
        // This is tricky - for now, just use Firebase delta if baseline is from Firebase
        this.delta = firebaseData.delta;
      }

      await this.save();
      this.updateEstimate();
      return true;
    }

    return false;
  }

  /**
   * Export data for Firebase sync
   */
  exportForSync() {
    return {
      baseline: this.baseline,
      delta: this.delta,
      estimatedUsage: this.estimatedUsage,
      tokenRates: this.tokenRates,
      exportedAt: Date.now()
    };
  }

  /**
   * Save to storage
   */
  async save() {
    try {
      await chrome.storage.local.set({
        cup_baseline: this.baseline,
        cup_delta: this.delta,
        cup_token_rates: this.tokenRates
      });
    } catch (e) {
      console.error('[HybridTracker] Save error:', e.message);
    }
  }

  /**
   * Handle session reset (5-hour timer reset)
   * The baseline for session resets but weekly continues
   */
  handleSessionReset() {
    if (this.baseline) {
      this.baseline.currentSession = { percent: 0, resetsIn: '5h' };
      this.updateEstimate();
    }
  }

  /**
   * Update token conversion rates (for calibration)
   */
  async calibrateRates(actualUsage, trackedTokens) {
    // If we know actual usage and tracked tokens, we can calibrate
    if (actualUsage.sessionPercent > 0 && trackedTokens > 0) {
      const newRate = Math.round(trackedTokens / actualUsage.sessionPercent);
      if (newRate > 1000 && newRate < 10000) {
        this.tokenRates.sessionTokensPer1Percent = newRate;
        await this.save();
        console.log('[HybridTracker] Calibrated session rate:', newRate);
      }
    }
  }

  /**
   * Get status for debugging
   */
  getStatus() {
    return {
      hasBaseline: !!this.baseline,
      baselineSource: this.baseline?.source || 'none',
      baselineAge: this.getBaselineAge(),
      isStale: this.isBaselineStale(),
      deltaInputTokens: this.delta.inputTokens,
      deltaOutputTokens: this.delta.outputTokens,
      totalDeltaTokens: this.delta.inputTokens + this.delta.outputTokens,
      tokenRates: this.tokenRates,
      estimatedUsage: this.estimatedUsage
    };
  }

  /**
   * Reset all data
   */
  async reset() {
    this.baseline = null;
    this.delta = {
      inputTokens: 0,
      outputTokens: 0,
      lastReset: Date.now()
    };
    this.estimatedUsage = null;

    await chrome.storage.local.remove([
      'cup_baseline',
      'cup_delta',
      'cup_token_rates'
    ]);

    console.log('[HybridTracker] Reset complete');
  }
}

// Export
if (typeof self !== 'undefined') {
  self.HybridTracker = HybridTracker;
}
if (typeof window !== 'undefined') {
  window.HybridTracker = HybridTracker;
}

console.log('[CUP] Hybrid Tracker loaded');
