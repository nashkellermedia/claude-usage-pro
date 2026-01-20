/**
 * Claude Usage Pro - Background Service Worker
 * 
 * FEATURES:
 * 1. Firebase Anonymous Auth - Proper security via REST API
 * 2. Anthropic Token Counting - FREE accurate token counts
 * 3. HybridTracker - Baseline + token delta tracking
 * 4. FirebaseSync - Secure cross-device sync with auth
 * 5. UsageAnalytics - Historical tracking synced to Firebase
 */

// Debug mode - set to true for verbose logging
const DEBUG = true;
const log = (...args) => DEBUG && log('[CUP]', ...args);
const logError = (...args) => console.error('[CUP]', ...args);

// ============================================================================
// Firebase Auth Class - Anonymous Authentication via REST API
// ============================================================================

class FirebaseAuth {
  constructor() {
    this.apiKey = null;
    this.idToken = null;
    this.refreshToken = null;
    this.uid = null;
    this.expiresAt = null;
  }

  async initialize(apiKey) {
    if (!apiKey || !apiKey.trim()) {
      log('[FirebaseAuth] No API key provided');
      return false;
    }
    
    this.apiKey = apiKey.trim();
    
    // Try to restore existing session
    const stored = await chrome.storage.local.get(['firebase_auth']);
    if (stored.firebase_auth?.refreshToken && stored.firebase_auth?.apiKey === this.apiKey) {
      this.refreshToken = stored.firebase_auth.refreshToken;
      this.uid = stored.firebase_auth.uid;
      
      // Refresh the token
      const refreshed = await this.refreshIdToken();
      if (refreshed) {
        log('[FirebaseAuth] Restored session for UID:', this.uid);
        return true;
      }
    }
    
    // Sign in anonymously
    return await this.signInAnonymously();
  }

  async signInAnonymously() {
    try {
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnSecureToken: true })
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        console.error('[FirebaseAuth] Sign in failed:', error.error?.message);
        return false;
      }
      
      const data = await response.json();
      this.idToken = data.idToken;
      this.refreshToken = data.refreshToken;
      this.uid = data.localId;
      this.expiresAt = Date.now() + (parseInt(data.expiresIn) * 1000);
      
      // Store for persistence
      await chrome.storage.local.set({
        firebase_auth: {
          apiKey: this.apiKey,
          refreshToken: this.refreshToken,
          uid: this.uid
        }
      });
      
      log('[FirebaseAuth] Signed in anonymously, UID:', this.uid);
      return true;
    } catch (e) {
      console.error('[FirebaseAuth] Sign in error:', e.message);
      return false;
    }
  }

  async refreshIdToken() {
    if (!this.refreshToken || !this.apiKey) return false;
    
    try {
      const response = await fetch(
        `https://securetoken.googleapis.com/v1/token?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=refresh_token&refresh_token=${this.refreshToken}`
        }
      );
      
      if (!response.ok) {
        console.error('[FirebaseAuth] Token refresh failed');
        return false;
      }
      
      const data = await response.json();
      this.idToken = data.id_token;
      this.refreshToken = data.refresh_token;
      this.expiresAt = Date.now() + (parseInt(data.expires_in) * 1000);
      
      // Update stored refresh token
      await chrome.storage.local.set({
        firebase_auth: {
          apiKey: this.apiKey,
          refreshToken: this.refreshToken,
          uid: this.uid
        }
      });
      
      return true;
    } catch (e) {
      console.error('[FirebaseAuth] Refresh error:', e.message);
      return false;
    }
  }

  async getValidToken() {
    // Refresh if expiring in next 5 minutes
    if (!this.idToken || !this.expiresAt || Date.now() > this.expiresAt - 300000) {
      await this.refreshIdToken();
    }
    return this.idToken;
  }

  getUid() {
    return this.uid;
  }

  isAuthenticated() {
    return !!this.uid && !!this.idToken;
  }

  async signOut() {
    this.idToken = null;
    this.refreshToken = null;
    this.uid = null;
    this.expiresAt = null;
    await chrome.storage.local.remove('firebase_auth');
  }
}

// ============================================================================
// Anthropic Token Counter - FREE accurate token counting
// ============================================================================

class AnthropicTokenCounter {
  constructor() {
    this.apiKey = null;
  }

  setApiKey(apiKey) {
    if (apiKey && apiKey.startsWith('sk-ant-')) {
      this.apiKey = apiKey;
      return true;
    }
    return false;
  }

  async countTokens(text, model = 'claude-sonnet-4-5-20250514') {
    if (!this.apiKey) return null;
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: text }]
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.input_tokens;
      }
      return null;
    } catch (e) {
      console.error('[TokenCounter] Error:', e.message);
      return null;
    }
  }

  isConfigured() {
    return !!this.apiKey;
  }
}

// ============================================================================
// Firebase Sync Class - Secure sync with authentication
// ============================================================================

class FirebaseSync {
  constructor(auth) {
    this.auth = auth;
    this.databaseUrl = null;
    this.syncEnabled = false;
    this.lastSync = null;
    this.syncInterval = null;
    this.deviceId = null;
  }

  async initialize(databaseUrl, syncId = null) {
    if (!databaseUrl || !databaseUrl.trim()) {
      this.syncEnabled = false;
      this.stopAutoSync();
      return false;
    }

    this.databaseUrl = databaseUrl.trim().replace(/\/$/, '');
    this.syncId = syncId || null;  // User-defined sync ID for cross-device sync
    
    if (!this.databaseUrl.includes('firebaseio.com') && !this.databaseUrl.includes('firebasedatabase.app')) {
      console.error('[FirebaseSync] Invalid database URL');
      return false;
    }

    if (!this.auth?.isAuthenticated()) {
      console.error('[FirebaseSync] Not authenticated');
      return false;
    }

    this.deviceId = await this.getOrCreateDeviceId();
    
    log('[FirebaseSync] Initializing with syncId:', this.syncId || '(using UID)');
    
    const connected = await this.testConnection();
    if (connected) {
      this.syncEnabled = true;
      this.startAutoSync();
      log('[FirebaseSync] Initialized with auth');
      return true;
    }

    console.error('[FirebaseSync] Connection test failed');
    return false;
  }

  async getOrCreateDeviceId() {
    const result = await chrome.storage.local.get('cup_device_id');
    let deviceId = result.cup_device_id;
    if (!deviceId) {
      deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      await chrome.storage.local.set({ cup_device_id: deviceId });
    }
    return deviceId;
  }

  getBasePath() {
    // Use syncId for cross-device sync, fall back to UID
    if (this.syncId) {
      return `${this.databaseUrl}/sync/${this.syncId}`;
    }
    return `${this.databaseUrl}/users/${this.auth.getUid()}`;
  }

  async makeAuthenticatedRequest(path, method = 'GET', data = null) {
    const token = await this.auth.getValidToken();
    if (!token) {
      console.error('[FirebaseSync] No valid auth token');
      return null;
    }

    const url = `${this.getBasePath()}/${path}.json?auth=${token}`;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data && (method === 'PUT' || method === 'POST' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const error = await response.text();
        console.error('[FirebaseSync] Request failed:', error);
        return null;
      }
      return await response.json();
    } catch (e) {
      console.error('[FirebaseSync] Request error:', e.message);
      return null;
    }
  }

  async testConnection() {
    try {
      const result = await this.makeAuthenticatedRequest('test', 'PUT', { timestamp: Date.now() });
      return result !== null;
    } catch (e) {
      return false;
    }
  }

  disable() {
    this.syncEnabled = false;
    this.stopAutoSync();
    log('[FirebaseSync] Disabled');
  }

  // Sync usage data
  async syncUsage(data) {
    if (!this.syncEnabled) return { success: false };

    const syncData = {
      ...data,
      deviceId: this.deviceId,
      deviceName: await this.getDeviceName(),
      syncedAt: Date.now(),
      timestamp: new Date().toISOString()
    };

    const result = await this.makeAuthenticatedRequest(`usage/${this.deviceId}`, 'PUT', syncData);
    if (result !== null) {
      this.lastSync = Date.now();
      return { success: true };
    }
    return { success: false };
  }

  // Sync analytics
  async syncAnalytics(analytics) {
    if (!this.syncEnabled) return { success: false };

    const result = await this.makeAuthenticatedRequest('analytics', 'PUT', {
      ...analytics,
      syncedAt: Date.now()
    });
    return { success: result !== null };
  }

  // Sync settings (non-sensitive)
  async syncSettings(settings) {
    if (!this.syncEnabled) return { success: false };

    const safeSettings = {
      badgeDisplay: settings.badgeDisplay,
      showSidebar: settings.showSidebar,
      showChatOverlay: settings.showChatOverlay,
      enableVoice: settings.enableVoice,
      anthropicApiKey: settings.anthropicApiKey || '',  // Sync for cross-device token counting
      syncedAt: Date.now()
    };

    const result = await this.makeAuthenticatedRequest('settings', 'PUT', safeSettings);
    return { success: result !== null };
  }

  // Get all synced usage data
  async getAllUsage() {
    if (!this.syncEnabled) return null;
    return await this.makeAuthenticatedRequest('usage', 'GET');
  }

  // Get merged/freshest usage
  async getMergedUsage() {
    const allUsage = await this.getAllUsage();
    if (!allUsage) return null;

    const devices = Object.values(allUsage);
    if (!devices.length) return null;

    // Return freshest data
    return devices.sort((a, b) => (b.syncedAt || 0) - (a.syncedAt || 0))[0];
  }

  // Get synced analytics
  async getAnalytics() {
    if (!this.syncEnabled) return null;
    return await this.makeAuthenticatedRequest('analytics', 'GET');
  }

  // Get synced settings
  async getSettings() {
    if (!this.syncEnabled) return null;
    return await this.makeAuthenticatedRequest('settings', 'GET');
  }

  startAutoSync() {
    this.stopAutoSync();
    
    // Push local changes every 30 seconds
    this.syncInterval = setInterval(async () => {
      // Push both tracker state AND formatted usage data
      const syncData = {};
      
      if (hybridTracker) {
        // Include tracker state for delta merging
        Object.assign(syncData, hybridTracker.exportForSync());
      }
      
      // Also include the formatted usage data the UI expects
      const usageData = await getUsageData();
      if (usageData.currentSession) syncData.currentSession = usageData.currentSession;
      if (usageData.weeklyAllModels) syncData.weeklyAllModels = usageData.weeklyAllModels;
      if (usageData.weeklySonnet) syncData.weeklySonnet = usageData.weeklySonnet;
      
      await this.syncUsage(syncData);
      
      if (usageAnalytics) {
        const analyticsData = await usageAnalytics.export();
        await this.syncAnalytics(analyticsData);
      }
    }, 30000);
    
    // Pull remote changes every 60 seconds (staggered from push)
    this.pullInterval = setInterval(async () => {
      log('[FirebaseSync] Auto-pulling from Firebase...');
      await pullFromFirebase();
      
      // Notify tabs of any changes
      const usageData = await getUsageData();
      notifyAllTabs(usageData);
    }, 60000);
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.pullInterval) {
      clearInterval(this.pullInterval);
      this.pullInterval = null;
    }
  }
  


  async getDeviceName() {
    const ua = self.navigator?.userAgent || '';
    let os = ua.includes('Mac') ? 'Mac' : ua.includes('Windows') ? 'Windows' : ua.includes('Linux') ? 'Linux' : 'Unknown';
    const result = await chrome.storage.local.get('cup_profile_name');
    const profile = result.cup_profile_name || (this.deviceId?.substring(7, 15) || 'unknown');
    return `${os} - Chrome - ${profile}`;
  }
}

// ============================================================================
// HybridTracker Class
// ============================================================================

class HybridTracker {
  constructor() {
    this.baseline = null;
    this.delta = { inputTokens: 0, outputTokens: 0, lastReset: Date.now() };
    this.estimatedUsage = null;
    this.tokenRates = {
      sessionTokensPer1Percent: 3000,
      weeklyTokensPer1Percent: 45000
    };
  }

  async initialize() {
    try {
      const stored = await chrome.storage.local.get(['cup_baseline', 'cup_delta', 'cup_token_rates']);
      if (stored.cup_baseline) {
        this.baseline = stored.cup_baseline;
      } else {
        // Create default baseline so tracking works immediately
        this.baseline = {
          currentSession: { percent: 0, resetsIn: '--' },
          weeklyAllModels: { percent: 0, resetsAt: '--' },
          weeklySonnet: { percent: 0, resetsIn: '--' },
          source: 'default',
          timestamp: Date.now()
        };
        log('[HybridTracker] Created default baseline');
      }
      if (stored.cup_delta) this.delta = stored.cup_delta;
      if (stored.cup_token_rates) this.tokenRates = stored.cup_token_rates;
      this.updateEstimate();
      return true;
    } catch (e) {
      logError('[HybridTracker] Init error:', e.message);
      return false;
    }
  }

  async setBaseline(usageData, source = 'unknown') {
    const now = Date.now();
    const oldBaseline = this.baseline;
    
    this.baseline = {
      currentSession: usageData.currentSession || { percent: 0, resetsIn: '--' },
      weeklyAllModels: usageData.weeklyAllModels || { percent: 0, resetsAt: '--' },
      weeklySonnet: usageData.weeklySonnet || { percent: 0, resetsIn: '--' },
      source, timestamp: now
    };
    
    // Only reset deltas if the new baseline shows higher usage than our estimate
    // This prevents losing tracked data when baseline is refreshed
    if (oldBaseline && this.estimatedUsage) {
      const newSession = this.baseline.currentSession.percent || 0;
      const estSession = this.estimatedUsage.currentSession?.percent || 0;
      
      // If scraped value is close to or higher than estimate, reset deltas
      // If scraped value is much lower, keep deltas (session probably reset)
      if (newSession >= estSession - 5) {
        this.delta = { inputTokens: 0, outputTokens: 0, lastReset: now };
        log('[HybridTracker] Reset deltas - baseline caught up');
      } else {
        log('[HybridTracker] Keeping deltas - baseline lower than estimate');
      }
    } else {
      this.delta = { inputTokens: 0, outputTokens: 0, lastReset: now };
    }
    
    await this.save();
    this.updateEstimate();
    log('[HybridTracker] New baseline from', source, '- Session:', this.baseline.currentSession.percent + '%');
    return this.baseline;
  }

  async addTokenDelta(inputTokens = 0, outputTokens = 0) {
    if (inputTokens > 0 || outputTokens > 0) {
      log('[HybridTracker] +' + inputTokens + ' input, +' + outputTokens + ' output tokens');
    }
    
    this.delta.inputTokens += inputTokens;
    this.delta.outputTokens += outputTokens;
    this.updateEstimate();
    
    // Save every 500 tokens or immediately if significant
    const total = this.delta.inputTokens + this.delta.outputTokens;
    if ((inputTokens + outputTokens) > 100 || total % 500 < (inputTokens + outputTokens)) {
      await this.save();
    }
    return this.estimatedUsage;
  }

  updateEstimate() {
    if (!this.baseline) {
      this.estimatedUsage = null;
      return;
    }

    const totalDeltaTokens = this.delta.inputTokens + this.delta.outputTokens;
    const sessionDelta = totalDeltaTokens / this.tokenRates.sessionTokensPer1Percent;
    const weeklyDelta = totalDeltaTokens / this.tokenRates.weeklyTokensPer1Percent;

    // Calculate precise percentages
    const sessionPercent = (this.baseline.currentSession.percent || 0) + sessionDelta;
    const weeklyPercent = (this.baseline.weeklyAllModels.percent || 0) + weeklyDelta;
    const sonnetPercent = (this.baseline.weeklySonnet.percent || 0) + weeklyDelta;

    this.estimatedUsage = {
      currentSession: {
        percent: Math.min(100, Math.round(sessionPercent)),
        percentExact: Math.min(100, sessionPercent),
        resetsIn: this.baseline.currentSession.resetsIn
      },
      weeklyAllModels: {
        percent: Math.min(100, Math.round(weeklyPercent)),
        percentExact: Math.min(100, weeklyPercent),
        resetsAt: this.baseline.weeklyAllModels.resetsAt
      },
      weeklySonnet: {
        percent: Math.min(100, Math.round(sonnetPercent)),
        percentExact: Math.min(100, sonnetPercent),
        resetsIn: this.baseline.weeklySonnet.resetsIn
      },
      isEstimate: true,
      deltaTokens: totalDeltaTokens,
      baselineTimestamp: this.baseline.timestamp,
      baselineSource: this.baseline.source
    };
    
    if (totalDeltaTokens > 0) {
      log('[HybridTracker] Estimate: Session', sessionPercent.toFixed(2) + '%, Delta tokens:', totalDeltaTokens);
    }
  }

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

  getStatus() {
    const baselineAge = this.baseline ? Date.now() - this.baseline.timestamp : null;
    return {
      initialized: true,
      hasBaseline: !!this.baseline,
      baselineAge,
      baselineSource: this.baseline?.source,
      isStale: baselineAge ? baselineAge > 30 * 60 * 1000 : true,
      deltaTokens: this.delta.inputTokens + this.delta.outputTokens,
      estimatedUsage: this.estimatedUsage
    };
  }

  exportForSync() {
    return {
      baseline: this.baseline,
      delta: this.delta,
      estimatedUsage: this.estimatedUsage,
      tokenRates: this.tokenRates
    };
  }

  async mergeFromFirebase(data) {
    if (data.baseline && (!this.baseline || data.baseline.timestamp > this.baseline.timestamp)) {
      this.baseline = data.baseline;
      this.delta = data.delta || { inputTokens: 0, outputTokens: 0, lastReset: Date.now() };
      if (data.tokenRates) this.tokenRates = data.tokenRates;
      await this.save();
      this.updateEstimate();
      log('[HybridTracker] Merged from Firebase');
    }
  }

  async reset() {
    this.baseline = null;
    this.delta = { inputTokens: 0, outputTokens: 0, lastReset: Date.now() };
    this.estimatedUsage = null;
    await chrome.storage.local.remove(['cup_baseline', 'cup_delta']);
  }
}

// ============================================================================
// UsageAnalytics Class
// ============================================================================

class UsageAnalytics {
  constructor() {
    this.data = {
      dailySnapshots: {},
      thresholdEvents: [],
      modelUsage: {},
      peakUsage: { session: 0, weeklyAll: 0, weeklySonnet: 0 }
    };
  }

  async initialize() {
    try {
      const result = await chrome.storage.local.get('usageAnalytics');
      if (result.usageAnalytics) {
        this.data = { ...this.data, ...result.usageAnalytics };
        
        // Clean up corrupted dailySnapshots entries
        if (this.data.dailySnapshots) {
          for (const [date, value] of Object.entries(this.data.dailySnapshots)) {
            if (!Array.isArray(value)) {
              log('[UsageAnalytics] Fixing corrupted entry for', date);
              this.data.dailySnapshots[date] = [];
            }
          }
        }
      }
      log('[UsageAnalytics] Initialized with', Object.keys(this.data.dailySnapshots || {}).length, 'days of data');
      return true;
    } catch (e) {
      console.error('[UsageAnalytics] Init error:', e.message);
      return false;
    }
  }

  async recordSnapshot(usageData) {
    log('[UsageAnalytics] recordSnapshot called with:', usageData?.currentSession?.percent, usageData?.weeklyAllModels?.percent);
    if (!usageData) return;
    
    const today = new Date().toISOString().split('T')[0];
    const now = Date.now();
    
    const snapshot = {
      timestamp: now,
      session: usageData.currentSession?.percent || 0,
      weeklyAll: usageData.weeklyAllModels?.percent || 0,
      weeklySonnet: usageData.weeklySonnet?.percent || 0
    };
    
    // Ensure dailySnapshots[today] is an array (fix for corrupted data)
    if (!this.data.dailySnapshots[today] || !Array.isArray(this.data.dailySnapshots[today])) {
      this.data.dailySnapshots[today] = [];
    }
    this.data.dailySnapshots[today].push(snapshot);
    
    // Update peak usage
    if (snapshot.session > this.data.peakUsage.session) {
      this.data.peakUsage.session = snapshot.session;
    }
    if (snapshot.weeklyAll > this.data.peakUsage.weeklyAll) {
      this.data.peakUsage.weeklyAll = snapshot.weeklyAll;
    }
    if (snapshot.weeklySonnet > this.data.peakUsage.weeklySonnet) {
      this.data.peakUsage.weeklySonnet = snapshot.weeklySonnet;
    }
    
    // Check thresholds
    this.checkThresholds(snapshot, today);
    
    await this.save();
  }

  checkThresholds(snapshot, date) {
    const thresholds = [70, 90, 100];
    
    for (const threshold of thresholds) {
      if (snapshot.session >= threshold || snapshot.weeklyAll >= threshold || snapshot.weeklySonnet >= threshold) {
        const existing = this.data.thresholdEvents.find(e => 
          e.date === date && e.threshold === threshold
        );
        
        if (!existing) {
          this.data.thresholdEvents.push({
            date,
            threshold,
            timestamp: Date.now(),
            session: snapshot.session,
            weeklyAll: snapshot.weeklyAll,
            weeklySonnet: snapshot.weeklySonnet
          });
        }
      }
    }
  }

  recordModelUsage(model) {
    if (!model) return;
    this.data.modelUsage[model] = (this.data.modelUsage[model] || 0) + 1;
    this.save();
  }

  async save() {
    try {
      await chrome.storage.local.set({ usageAnalytics: this.data });
    } catch (e) {
      console.error('[UsageAnalytics] Save error:', e.message);
    }
  }

  getSummary(days = 30) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const cutoffDate = new Date(cutoff).toISOString().split('T')[0];
    
    let totalSession = 0, totalWeeklyAll = 0, totalWeeklySonnet = 0, count = 0;
    
    for (const [date, snapshots] of Object.entries(this.data.dailySnapshots)) {
      if (date >= cutoffDate && Array.isArray(snapshots)) {
        for (const snap of snapshots) {
          totalSession += snap.session || 0;
          totalWeeklyAll += snap.weeklyAll || 0;
          totalWeeklySonnet += snap.weeklySonnet || 0;
          count++;
        }
      }
    }
    
    const thresholdHits = { by70: 0, by90: 0, by100: 0 };
    for (const event of this.data.thresholdEvents) {
      if (new Date(event.date) >= new Date(cutoffDate)) {
        if (event.threshold === 70) thresholdHits.by70++;
        if (event.threshold === 90) thresholdHits.by90++;
        if (event.threshold === 100) thresholdHits.by100++;
      }
    }
    
    return {
      period: `Last ${days} days`,
      days: Object.keys(this.data.dailySnapshots).filter(d => d >= cutoffDate).length,
      averageUsage: count > 0 ? {
        session: Math.round(totalSession / count),
        weeklyAll: Math.round(totalWeeklyAll / count),
        weeklySonnet: Math.round(totalWeeklySonnet / count)
      } : { session: 0, weeklyAll: 0, weeklySonnet: 0 },
      peakUsage: this.data.peakUsage,
      thresholdHits,
      modelPreference: this.data.modelUsage
    };
  }

  async export() {
    return this.data;
  }
}

// ============================================================================
// Globals
// ============================================================================

let firebaseAuth = null;
let firebaseSync = null;
let hybridTracker = null;
let usageAnalytics = null;
let tokenCounter = null;

const DEFAULT_USAGE = {
  currentSession: { percent: 0, resetsIn: '--' },
  weeklyAllModels: { percent: 0, resetsAt: '--' },
  weeklySonnet: { percent: 0, resetsIn: '--' }
};

const DEFAULT_SETTINGS = {
  badgeDisplay: 'session',
  showSidebar: true,
  showChatOverlay: true,
  enableVoice: false,
  firebaseDatabaseUrl: '',
  firebaseApiKey: '',
  anthropicApiKey: '',
  firebaseSyncId: ''
};

// ============================================================================
// Core Functions
// ============================================================================

async function getUsageData() {
  try {
    const result = await chrome.storage.local.get('usageData');
    return result.usageData || { ...DEFAULT_USAGE };
  } catch (e) {
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
    await chrome.storage.local.set({ usageData: data });
    await updateBadge(data);
    
    // Record analytics
    if (usageAnalytics) {
      await usageAnalytics.recordSnapshot(data);
    }
    
    // Sync to Firebase
    if (firebaseSync?.syncEnabled) {
      await firebaseSync.syncUsage(data);
    }
  } catch (e) {
    console.error('[CUP BG] Save error:', e.message);
  }
}

async function updateBadge(usageData) {
  const settings = await getSettings();
  let percent = 0;
  let color = '#4CAF50';

  switch (settings.badgeDisplay) {
    case 'session':
      percent = usageData?.currentSession?.percent || 0;
      break;
    case 'weekly-all':
      percent = usageData?.weeklyAllModels?.percent || 0;
      break;
    case 'weekly-sonnet':
      percent = usageData?.weeklySonnet?.percent || 0;
      break;
    case 'none':
      chrome.action.setBadgeText({ text: '' });
      return;
  }

  if (percent >= 90) color = '#f44336';
  else if (percent >= 70) color = '#ff9800';

  chrome.action.setBadgeText({ text: percent > 0 ? `${percent}` : '' });
  chrome.action.setBadgeBackgroundColor({ color });
}

function notifyAllTabs(usageData) {
  chrome.tabs.query({ url: 'https://claude.ai/*' }).then(tabs => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'USAGE_UPDATED', usageData }).catch(() => {});
    }
  }).catch(() => {});
}

// ============================================================================
// Message Handler
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(e => {
    console.error('[CUP BG] Message error:', e);
    sendResponse({ error: e.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'GET_USAGE_DATA': {
      log('[CUP BG] GET_USAGE_DATA called, recordSnapshot:', message.recordSnapshot);
      const usageData = await getUsageData();
      
      // Merge with estimates if available
      // Note: spread order means later values override earlier
      // We want stored data as base, then estimates can add delta tracking
      let merged = { ...usageData };
      
      if (hybridTracker?.estimatedUsage) {
        // Only use estimates if they're newer or have valid data
        const est = hybridTracker.estimatedUsage;
        if (est.currentSession?.percent > 0 || !usageData.currentSession?.percent) {
          merged.currentSession = est.currentSession;
        }
        if (est.weeklyAllModels?.percent > 0 || !usageData.weeklyAllModels?.percent) {
          merged.weeklyAllModels = est.weeklyAllModels;
        }
        if (est.weeklySonnet?.percent > 0 || !usageData.weeklySonnet?.percent) {
          merged.weeklySonnet = est.weeklySonnet;
        }
        merged.isEstimate = est.isEstimate;
        merged.deltaTokens = est.deltaTokens;
      }
      
      // Record analytics snapshot if requested and we have valid data
      if (message.recordSnapshot && usageAnalytics) {
        log('[CUP BG] Recording snapshot, currentSession:', merged.currentSession?.percent);
        if (merged.currentSession?.percent > 0 || merged.weeklyAllModels?.percent > 0) {
          await usageAnalytics.recordSnapshot(merged);
          log('[CUP BG] Snapshot recorded successfully');
        }
      }
      
      return { usageData: merged };
    }

    case 'SYNC_SCRAPED_DATA':
    case 'USAGE_SCRAPED': {
      const { usageData } = message;
      if (!usageData) return { success: false };

      if (hybridTracker) {
        await hybridTracker.setBaseline(usageData, 'scraper');
      }

      const existing = await getUsageData();
      const merged = { ...existing, ...usageData, lastUpdated: Date.now() };
      await saveUsageData(merged);
      notifyAllTabs(merged);

      return { success: true };
    }

    case 'ADD_TOKEN_DELTA': {
      const { inputTokens, outputTokens, model } = message;
      
      // Use Anthropic API for accurate counting if available
      if (tokenCounter?.isConfigured() && message.text) {
        const accurate = await tokenCounter.countTokens(message.text);
        if (accurate) {
          message.inputTokens = accurate;
        }
      }
      
      if (hybridTracker) {
        const estimated = await hybridTracker.addTokenDelta(inputTokens || 0, outputTokens || 0);
        if (estimated) {
          const current = await getUsageData();
          const merged = { ...current, ...estimated };
          await saveUsageData(merged);
          notifyAllTabs(merged);
        }
      }
      
      if (usageAnalytics && model) {
        usageAnalytics.recordModelUsage(model);
      }
      
      return { success: true };
    }

    case 'GET_HYBRID_STATUS': {
      return hybridTracker?.getStatus() || { initialized: false };
    }

    case 'GET_FIREBASE_STATUS': {
      return {
        enabled: firebaseSync?.syncEnabled || false,
        authenticated: firebaseAuth?.isAuthenticated() || false,
        uid: firebaseAuth?.getUid() || null,
        lastSync: firebaseSync?.lastSync || null,
        syncId: firebaseSync?.syncId || null
      };
    }

    case 'GET_SETTINGS': {
      return { settings: await getSettings() };
    }

    case 'SAVE_SETTINGS': {
      const current = await getSettings();
      const updated = { ...current, ...message.settings };
      await chrome.storage.local.set({ settings: updated });

      // Re-initialize Firebase if config changed
      const authChanged = updated.firebaseApiKey !== current.firebaseApiKey;
      const urlChanged = updated.firebaseDatabaseUrl !== current.firebaseDatabaseUrl;
      const syncIdChanged = updated.firebaseSyncId !== current.firebaseSyncId;
      
      if (authChanged || urlChanged || syncIdChanged) {
        log('[CUP BG] Firebase config changed, reinitializing...');
        log('[CUP BG] authChanged:', authChanged, 'urlChanged:', urlChanged, 'syncIdChanged:', syncIdChanged);
        
        // Initialize auth
        if (updated.firebaseApiKey) {
          if (!firebaseAuth || authChanged) {
            firebaseAuth = new FirebaseAuth();
            await firebaseAuth.initialize(updated.firebaseApiKey);
          }
          
          if (firebaseAuth?.isAuthenticated() && updated.firebaseDatabaseUrl) {
            firebaseSync = new FirebaseSync(firebaseAuth);
            const syncInitialized = await firebaseSync.initialize(updated.firebaseDatabaseUrl, updated.firebaseSyncId);
            
            if (syncInitialized) {
              // Check if this profile has existing usage data
              const existingData = await getUsageData();
              const hasExistingData = existingData?.currentSession?.percent > 0 || 
                                      existingData?.weeklyAllModels?.percent > 0;
              
              log('[CUP BG] Has existing local data:', hasExistingData);
              
              if (syncIdChanged && updated.firebaseSyncId && hasExistingData) {
                // Profile with data adding sync ID -> push to new path
                log('[CUP BG] Sync ID changed with existing data, pushing to new path...');
                
                // Combine tracker state and usage data
                const syncData = {};
                if (hybridTracker) {
                  Object.assign(syncData, hybridTracker.exportForSync());
                }
                if (existingData.currentSession) syncData.currentSession = existingData.currentSession;
                if (existingData.weeklyAllModels) syncData.weeklyAllModels = existingData.weeklyAllModels;
                if (existingData.weeklySonnet) syncData.weeklySonnet = existingData.weeklySonnet;
                
                await firebaseSync.syncUsage(syncData);
                if (usageAnalytics) {
                  await firebaseSync.syncAnalytics(await usageAnalytics.export());
                }
                await firebaseSync.syncSettings(updated);
                log('[CUP BG] Data pushed to new sync path');
              } else {
                // New profile or no local data -> pull from Firebase
                log('[CUP BG] Pulling data from Firebase...');
                await pullFromFirebase();
              }
            }
          }
        } else {
          firebaseAuth = null;
          if (firebaseSync) firebaseSync.disable();
          firebaseSync = null;
        }
      }

      // Update Anthropic token counter
      if (updated.anthropicApiKey !== current.anthropicApiKey) {
        if (updated.anthropicApiKey) {
          tokenCounter = new AnthropicTokenCounter();
          tokenCounter.setApiKey(updated.anthropicApiKey);
          log('[CUP BG] Anthropic token counter configured');
        } else {
          tokenCounter = null;
        }
      }

      // Sync settings to Firebase
      if (firebaseSync?.syncEnabled) {
        await firebaseSync.syncSettings(updated);
      }

      const usageData = await getUsageData();
      await updateBadge(usageData);

      // Notify all tabs
      chrome.tabs.query({ url: 'https://claude.ai/*' }).then(tabs => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings: updated }).catch(() => {});
        }
      }).catch(() => {});

      return { success: true };
    }

    case 'PUSH_TO_FIREBASE': {
      if (!firebaseSync?.syncEnabled) {
        return { success: false, error: 'Firebase not configured' };
      }

      try {
        // Push all data to Firebase - combine tracker state and usage data
        const syncData = {};
        
        if (hybridTracker) {
          Object.assign(syncData, hybridTracker.exportForSync());
        }
        
        const usageData = await getUsageData();
        if (usageData.currentSession) syncData.currentSession = usageData.currentSession;
        if (usageData.weeklyAllModels) syncData.weeklyAllModels = usageData.weeklyAllModels;
        if (usageData.weeklySonnet) syncData.weeklySonnet = usageData.weeklySonnet;
        
        await firebaseSync.syncUsage(syncData);
        log('[CUP BG] Pushed usage data:', syncData.currentSession?.percent, syncData.weeklyAllModels?.percent);
        
        if (usageAnalytics) {
          const analyticsData = await usageAnalytics.export();
          await firebaseSync.syncAnalytics(analyticsData);
          log('[CUP BG] Pushed analytics');
        }
        
        const settings = await getSettings();
        await firebaseSync.syncSettings(settings);
        log('[CUP BG] Pushed settings');
        
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case 'SYNC_FROM_FIREBASE': {
      if (!firebaseSync?.syncEnabled) {
        return { success: false, error: 'Firebase not configured' };
      }

      try {
        await pullFromFirebase();
        
        // Notify all tabs of updated data
        const usageData = await getUsageData();
        notifyAllTabs(usageData);
        
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case 'GET_ANALYTICS_SUMMARY': {
      log('[CUP BG] GET_ANALYTICS_SUMMARY, usageAnalytics exists:', !!usageAnalytics);
      log('[CUP BG] dailySnapshots:', Object.keys(usageAnalytics?.data?.dailySnapshots || {}));
      if (!usageAnalytics) return { summary: null };
      return { summary: usageAnalytics.getSummary(message.days || 30) };
    }

    case 'RESET_ANALYTICS': {
      if (usageAnalytics) {
        usageAnalytics.data = {
          dailySnapshots: {},
          thresholdEvents: [],
          modelUsage: {},
          peakUsage: { session: 0, weeklyAll: 0, weeklySonnet: 0 }
        };
        await usageAnalytics.save();
        log('[CUP BG] Analytics reset');
      }
      return { success: true };
    }

    case 'EXPORT_ANALYTICS': {
      if (!usageAnalytics) return { data: null };
      return { data: await usageAnalytics.export() };
    }

    case 'COUNT_TOKENS': {
      if (!tokenCounter?.isConfigured()) {
        return { error: 'Anthropic API key not configured', tokens: null };
      }
      const tokens = await tokenCounter.countTokens(message.text, message.model);
      return { tokens };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ============================================================================
// Firebase Pull (for cross-device sync)
// ============================================================================

async function pullFromFirebase() {
  if (!firebaseSync?.syncEnabled) {
    log('[CUP BG] pullFromFirebase: sync not enabled');
    return;
  }
  
  log('[CUP BG] pullFromFirebase: starting pull from path:', firebaseSync.getBasePath());
  
  try {
    // Pull usage data (hybrid tracker state)
    const syncedData = await firebaseSync.getMergedUsage();
    log('[CUP BG] Pulled usage data:', syncedData ? 'got data' : 'empty/null');
    if (syncedData) {
      log('[CUP BG] Usage data keys:', Object.keys(syncedData));
      
      // Merge into hybrid tracker
      if (syncedData.baseline && hybridTracker) {
        await hybridTracker.mergeFromFirebase(syncedData);
      }
      
      // Extract the actual usage percentages for storage
      // The UI expects { currentSession, weeklyAllModels, weeklySonnet }
      const usageForStorage = {};
      
      // Prefer estimatedUsage (has deltas applied), fall back to baseline
      const source = syncedData.estimatedUsage || syncedData.baseline;
      if (source) {
        if (source.currentSession) usageForStorage.currentSession = source.currentSession;
        if (source.weeklyAllModels) usageForStorage.weeklyAllModels = source.weeklyAllModels;
        if (source.weeklySonnet) usageForStorage.weeklySonnet = source.weeklySonnet;
      }
      
      if (Object.keys(usageForStorage).length > 0) {
        const current = await getUsageData();
        const merged = { ...current, ...usageForStorage, lastUpdated: Date.now() };
        await chrome.storage.local.set({ usageData: merged });
        await updateBadge(merged);
        log('[CUP BG] Stored usage:', merged.currentSession?.percent, merged.weeklyAllModels?.percent);
      }
    }
    
    // Pull analytics
    const analytics = await firebaseSync.getAnalytics();
    if (analytics && usageAnalytics) {
      log('[CUP BG] Pulled analytics from Firebase');
      usageAnalytics.data = { 
        ...usageAnalytics.data, 
        ...analytics,
        // Ensure arrays are arrays
        dailySnapshots: analytics.dailySnapshots || {},
        thresholdEvents: Array.isArray(analytics.thresholdEvents) ? analytics.thresholdEvents : [],
      };
      await usageAnalytics.save();
    }
    
    // Pull settings (including anthropicApiKey)
    const syncedSettings = await firebaseSync.getSettings();
    log('[CUP BG] Synced settings from Firebase:', JSON.stringify(syncedSettings));
    if (syncedSettings) {
      log('[CUP BG] Pulled settings from Firebase, has anthropicApiKey:', !!syncedSettings.anthropicApiKey);
      const currentSettings = await getSettings();
      
      // Merge synced settings, but don't overwrite Firebase credentials
      const mergedSettings = {
        ...currentSettings,
        badgeDisplay: syncedSettings.badgeDisplay || currentSettings.badgeDisplay,
        showSidebar: syncedSettings.showSidebar ?? currentSettings.showSidebar,
        showChatOverlay: syncedSettings.showChatOverlay ?? currentSettings.showChatOverlay,
        enableVoice: syncedSettings.enableVoice ?? currentSettings.enableVoice,
      };
      
      // Always sync anthropicApiKey from Firebase if available
      if (syncedSettings.anthropicApiKey) {
        mergedSettings.anthropicApiKey = syncedSettings.anthropicApiKey;
        log('[CUP BG] Pulled Anthropic API key from Firebase');
        
        // Initialize token counter with pulled key
        if (!tokenCounter) {
          tokenCounter = new AnthropicTokenCounter();
        }
        tokenCounter.setApiKey(syncedSettings.anthropicApiKey);
      }
      
      await chrome.storage.local.set({ settings: mergedSettings });
    }
    
    log('[CUP BG] Firebase pull complete');
  } catch (e) {
    console.error('[CUP BG] Firebase pull error:', e.message);
  }
}

// ============================================================================
// Initialization
// ============================================================================

async function initializeExtension() {
  log('[CUP BG] Initializing Claude Usage Pro v2.1.6...');

  // Initialize hybrid tracker
  hybridTracker = new HybridTracker();
  await hybridTracker.initialize();

  // Initialize analytics
  usageAnalytics = new UsageAnalytics();
  await usageAnalytics.initialize();

  // Load settings
  const settings = await getSettings();

  // Initialize Anthropic token counter
  if (settings.anthropicApiKey) {
    tokenCounter = new AnthropicTokenCounter();
    tokenCounter.setApiKey(settings.anthropicApiKey);
    log('[CUP BG] Anthropic token counter configured');
  }

  // Initialize Firebase Auth
  if (settings.firebaseApiKey) {
    firebaseAuth = new FirebaseAuth();
    const authSuccess = await firebaseAuth.initialize(settings.firebaseApiKey);
    
    if (authSuccess && settings.firebaseDatabaseUrl) {
      firebaseSync = new FirebaseSync(firebaseAuth);
      const syncInitialized = await firebaseSync.initialize(settings.firebaseDatabaseUrl, settings.firebaseSyncId);
      
      // Auto-pull data from Firebase on startup
      if (syncInitialized) {
        log('[CUP BG] Firebase connected, pulling data from cloud...');
        await pullFromFirebase();
      }
    }
  }

  // Initialize storage if needed
  const existing = await chrome.storage.local.get(['usageData', 'settings']);
  if (!existing.usageData) {
    await chrome.storage.local.set({ usageData: { ...DEFAULT_USAGE } });
  }
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS } });
  }

  // Update badge
  const usageData = await getUsageData();
  await updateBadge(usageData);

  log('[CUP BG] Initialization complete');
}

// Run initialization
initializeExtension().catch(console.error);

// Periodic badge update
chrome.alarms.create('updateBadge', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'updateBadge') {
    const usageData = await getUsageData();
    await updateBadge(usageData);
  }
});

// Global error handler for unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
  logError('Unhandled rejection:', event.reason);
  event.preventDefault();
});
