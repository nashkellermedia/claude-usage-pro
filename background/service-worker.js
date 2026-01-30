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
const DEBUG = false;


// Global handler for unhandled promise rejections (suppress connection errors)
self.addEventListener("unhandledrejection", (event) => {
  if (event.reason?.message?.includes("Could not establish connection") ||
      event.reason?.message?.includes("Receiving end does not exist") ||
      event.reason?.message?.includes("Extension context invalidated")) {
    event.preventDefault(); // Suppress these common errors
  } else {
    console.error("[CUP] Unhandled rejection:", event.reason);
  }
});
function log(...args) {
  if (DEBUG) {
    try {
      console.log('[CUP]', ...args);
    } catch (e) {
      // Ignore logging errors
    }
  }
}

function logError(...args) {
  try {
    console.error('[CUP]', ...args);
  } catch (e) {
    // Ignore logging errors
  }
}

// ============================================================================
// Model & Extended Thinking Multipliers
// ============================================================================
// These multipliers approximate how different models and features consume
// Claude.ai subscription quota relative to Sonnet (baseline = 1.0)

const MODEL_MULTIPLIERS = {
  // Haiku models - ~3x cheaper than Sonnet
  'claude-haiku-3': 0.33,
  'claude-haiku-3-5': 0.33,
  'claude-haiku-4': 0.33,
  'claude-haiku-4-5': 0.33,
  
  // Sonnet models - baseline
  'claude-sonnet-3': 1.0,
  'claude-sonnet-3-5': 1.0,
  'claude-sonnet-4': 1.0,
  'claude-sonnet-4-5': 1.0,
  
  // Opus 4.5 - ~1.67x Sonnet (based on $5/$25 vs $3/$15)
  'claude-opus-4-5': 1.67,
  
  // Opus 4/4.1 - ~5x Sonnet (based on $15/$75 vs $3/$15)
  'claude-opus-4': 5.0,
  'claude-opus-4-1': 5.0,
  
  // Legacy Opus 3 
  'claude-opus-3': 5.0,
  
  // Default fallback
  'default': 1.0
};

// Extended thinking multiplier for OUTPUT tokens
// Research shows 5-10x is typical, using 5x as conservative default
const EXTENDED_THINKING_OUTPUT_MULTIPLIER = 5.0;

function getModelMultiplier(model) {
  if (!model) return MODEL_MULTIPLIERS['default'];
  
  const normalized = model.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
  
  if (MODEL_MULTIPLIERS[normalized]) return MODEL_MULTIPLIERS[normalized];
  
  // Partial matches
  if (normalized.includes('haiku')) return 0.33;
  if (normalized.includes('opus-4-5') || normalized.includes('opus-4.5')) return 1.67;
  if (normalized.includes('opus')) return 5.0;
  if (normalized.includes('sonnet')) return 1.0;
  
  return MODEL_MULTIPLIERS['default'];
}

function applyTokenMultipliers(inputTokens, outputTokens, model, extendedThinking = false) {
  const modelMult = getModelMultiplier(model);
  
  let adjInput = Math.round(inputTokens * modelMult);
  let adjOutput = Math.round(outputTokens * modelMult);
  
  // Extended thinking multiplier on output tokens only
  if (extendedThinking && outputTokens > 0) {
    adjOutput = Math.round(adjOutput * EXTENDED_THINKING_OUTPUT_MULTIPLIER);
  }
  
  if (DEBUG && (modelMult !== 1.0 || extendedThinking)) {
    log('[Multipliers] Model:', model, 'mult:', modelMult, 'ET:', extendedThinking, 
        '| Input:', inputTokens, '->', adjInput, '| Output:', outputTokens, '->', adjOutput);
  }
  
  return { inputTokens: adjInput, outputTokens: adjOutput, modelMultiplier: modelMult };
}


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
    this.syncInterval = null;
    this.pullInterval = null;
    this.lastPush = null;
    this.lastPull = null;
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
      log('[FirebaseSync] No valid auth token - attempting refresh...');
      // Try to refresh the token
      const refreshed = await this.auth.refreshIdToken();
      if (!refreshed) {
        logError('[FirebaseSync] Token refresh failed');
        return null;
      }
      const newToken = await this.auth.getValidToken();
      if (!newToken) {
        logError('[FirebaseSync] Still no token after refresh');
        return null;
      }
    }

    const finalToken = await this.auth.getValidToken();
    const basePath = this.getBasePath();
    const url = `${basePath}/${path}.json?auth=${finalToken}`;
    
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data && (method === 'PUT' || method === 'POST' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      log('[FirebaseSync]', method, path);
      const response = await fetch(url, options);
      if (!response.ok) {
        const error = await response.text();
        logError('[FirebaseSync] Request failed:', response.status, path, error.substring(0, 200));
        return null;
      }
      return await response.json();
    } catch (e) {
      // Log the full error for debugging
      logError('[FirebaseSync] Fetch error for', path + ':', e.message);
      // Check if it might be a token issue
      if (e.message === 'Failed to fetch') {
        log('[FirebaseSync] Network error - will retry on next interval');
      }
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
      this.lastPush = Date.now();
      return { success: true };
    }
    return { success: false };
  }

  // Sync analytics
  async syncAnalytics(analytics) {
    // Sanitize modelUsage keys for Firebase (remove invalid characters)
    if (analytics.modelUsage) {
      const sanitizedModelUsage = {};
      for (const [key, value] of Object.entries(analytics.modelUsage)) {
        // Skip keys with invalid Firebase characters or old format
        if (key.includes(" ") || key.includes(".") || key.includes(":") || key.includes("20250") || key.includes("$") || key.includes("#") || key.includes("[") || key.includes("]") || key.includes("/")) {
          log("[FirebaseSync] Skipping invalid modelUsage key:", key);
          continue;
        }
        if (typeof value === "number") {
          sanitizedModelUsage[key] = value;
        }
      }
      analytics = { ...analytics, modelUsage: sanitizedModelUsage };
    }
    if (!this.syncEnabled) return { success: false };

    const result = await this.makeAuthenticatedRequest('analytics', 'PUT', {
      ...analytics,
      syncedAt: Date.now()
    });
    return { success: result !== null };
  }

  // Sync time data
  async syncTimeData(timeData) {
    if (!this.syncEnabled) return { success: false };

    const result = await this.makeAuthenticatedRequest('timeData', 'PUT', {
      ...timeData,
      deviceId: this.deviceId,
      syncedAt: Date.now()
    });
    return { success: result !== null };
  }

  // Get synced time data from Firebase
  async getTimeDataFromFirebase() {
    if (!this.syncEnabled) return null;
    return await this.makeAuthenticatedRequest("timeData", "GET");
  }

  // Sync settings (non-sensitive - excludes Firebase credentials which are device-specific)
  async syncSettings(settings) {
    if (!this.syncEnabled) return { success: false };

    // Sync all user preferences except Firebase credentials (device-specific)
    const safeSettings = {
      // Display settings
      badgeDisplay: settings.badgeDisplay,
      showSidebar: settings.showSidebar,
      showChatOverlay: settings.showChatOverlay,
      sidebarMinimized: settings.sidebarMinimized,
      enableVoice: settings.enableVoice,
      enableResetNotifications: settings.enableResetNotifications,
      
      // Threshold settings
      thresholdWarning: settings.thresholdWarning,
      thresholdDanger: settings.thresholdDanger,
      
      // Stats bar visibility settings
      statsBarShowDraft: settings.statsBarShowDraft,
      statsBarShowFiles: settings.statsBarShowFiles,
      statsBarShowSession: settings.statsBarShowSession,
      statsBarShowWeekly: settings.statsBarShowWeekly,
      statsBarShowSonnet: settings.statsBarShowSonnet,
      statsBarShowTimer: settings.statsBarShowTimer,
      
      // Auto-refresh settings
      autoRefreshEnabled: settings.autoRefreshEnabled,
      autoRefreshMinutes: settings.autoRefreshMinutes,
      
      // Auto-continue settings
      enableAutoContinue: settings.enableAutoContinue,
      autoContinueDelay: settings.autoContinueDelay,
      maxAutoContinues: settings.maxAutoContinues,
      
      // API key for token counting (shared across devices)
      anthropicApiKey: settings.anthropicApiKey || '',
      
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

    // Merge by taking HIGHEST usage values across all devices
    // Usage can only go up (or reset), so max is always correct
    const merged = {
      currentSession: { percent: 0, resetsIn: '--' },
      weeklyAllModels: { percent: 0, resetsAt: '--' },
      weeklySonnet: { percent: 0, resetsIn: '--' },
      syncedAt: 0,
      deviceId: this.deviceId
    };
    
    for (const device of devices) {
      // Get usage from estimatedUsage or baseline or direct properties
      const source = device.estimatedUsage || device.baseline || device;
      
      // Take highest session percent
      const sessionPct = source.currentSession?.percent || 0;
      if (sessionPct > (merged.currentSession.percent || 0)) {
        merged.currentSession = { ...source.currentSession };
      }
      
      // Take highest weekly all models percent
      const weeklyAllPct = source.weeklyAllModels?.percent || 0;
      if (weeklyAllPct > (merged.weeklyAllModels.percent || 0)) {
        merged.weeklyAllModels = { ...source.weeklyAllModels };
      }
      
      // Take highest weekly sonnet percent
      const sonnetPct = source.weeklySonnet?.percent || 0;
      if (sonnetPct > (merged.weeklySonnet.percent || 0)) {
        merged.weeklySonnet = { ...source.weeklySonnet };
      }
      
      // Also merge baseline/delta if present (for hybrid tracker)
      if (device.baseline && (!merged.baseline || device.baseline.timestamp > merged.baseline.timestamp)) {
        merged.baseline = device.baseline;
        merged.delta = device.delta;
        merged.tokenRates = device.tokenRates;
      }
      
      // Track most recent sync time
      if ((device.syncedAt || 0) > merged.syncedAt) {
        merged.syncedAt = device.syncedAt;
      }
    }
    
    log('[FirebaseSync] Merged usage from', devices.length, 'devices: Session', merged.currentSession.percent + '%, Weekly', merged.weeklyAllModels.percent + '%');
    return merged;
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
      
      // Sync time data
      const timeData = await getTimeData();
      await this.syncTimeData(timeData);
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
    // Burn rate tracking - stores recent token events for rate calculation
    this.tokenHistory = []; // Array of { tokens, timestamp }
    this.burnRateWindowMs = 60 * 60 * 1000; // 1 hour window for burn rate calc
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
    const totalNew = inputTokens + outputTokens;
    if (totalNew > 0) {
      log('[HybridTracker] +' + inputTokens + ' input, +' + outputTokens + ' output tokens');
      
      // Track for burn rate calculation
      this.tokenHistory.push({ tokens: totalNew, timestamp: Date.now() });
      
      // Clean up old entries outside the window
      const cutoff = Date.now() - this.burnRateWindowMs;
      this.tokenHistory = this.tokenHistory.filter(h => h.timestamp > cutoff);
    }
    
    this.delta.inputTokens += inputTokens;
    this.delta.outputTokens += outputTokens;
    this.updateEstimate();
    
    // Save every 500 tokens or immediately if significant
    const total = this.delta.inputTokens + this.delta.outputTokens;
    if (totalNew > 100 || total % 500 < totalNew) {
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
        resetsIn: this.baseline.currentSession.resetsIn,
        resetsAt: this.baseline.currentSession.resetsAt // Timestamp for countdown
      },
      weeklyAllModels: {
        percent: Math.min(100, Math.round(weeklyPercent)),
        percentExact: Math.min(100, weeklyPercent),
        resetsAt: this.baseline.weeklyAllModels.resetsAt, // Timestamp
        resetsAtStr: this.baseline.weeklyAllModels.resetsAtStr
      },
      weeklySonnet: {
        percent: Math.min(100, Math.round(sonnetPercent)),
        percentExact: Math.min(100, sonnetPercent),
        resetsIn: this.baseline.weeklySonnet.resetsIn,
        resetsAt: this.baseline.weeklySonnet.resetsAt // Timestamp for countdown
      },
      isEstimate: true,
      deltaTokens: totalDeltaTokens,
      baselineTimestamp: this.baseline.timestamp,
      baselineSource: this.baseline.source
    };
    
    if (totalDeltaTokens > 0) {
      log('[HybridTracker] Estimate: Session', sessionPercent.toFixed(2) + '%, Delta tokens:', totalDeltaTokens);
    }
    
    // Calculate predictions based on burn rate
    this.calculatePredictions();
  }
  
  calculatePredictions() {
    if (!this.estimatedUsage) return;
    
    // Calculate burn rate from recent history
    const burnRate = this.getBurnRate();
    
    if (burnRate.tokensPerHour > 0) {
      const sessionPercent = this.estimatedUsage.currentSession?.percentExact || 0;
      const weeklyPercent = this.estimatedUsage.weeklyAllModels?.percentExact || 0;
      const sonnetPercent = this.estimatedUsage.weeklySonnet?.percentExact || 0;
      
      // Calculate remaining percentage and time to 100%
      const sessionRemaining = 100 - sessionPercent;
      const weeklyRemaining = 100 - weeklyPercent;
      const sonnetRemaining = 100 - sonnetPercent;
      
      // Tokens needed to reach 100%
      const sessionTokensRemaining = sessionRemaining * this.tokenRates.sessionTokensPer1Percent;
      const weeklyTokensRemaining = weeklyRemaining * this.tokenRates.weeklyTokensPer1Percent;
      const sonnetTokensRemaining = sonnetRemaining * this.tokenRates.weeklyTokensPer1Percent;
      
      // Hours until limit (at current rate)
      const sessionHoursRemaining = sessionTokensRemaining / burnRate.tokensPerHour;
      const weeklyHoursRemaining = weeklyTokensRemaining / burnRate.tokensPerHour;
      const sonnetHoursRemaining = sonnetTokensRemaining / burnRate.tokensPerHour;
      
      this.estimatedUsage.predictions = {
        burnRate: burnRate,
        session: {
          hoursRemaining: sessionHoursRemaining,
          predictedLimitTime: sessionHoursRemaining < 168 ? Date.now() + (sessionHoursRemaining * 60 * 60 * 1000) : null,
          formatted: this.formatTimeRemaining(sessionHoursRemaining)
        },
        weeklyAll: {
          hoursRemaining: weeklyHoursRemaining,
          predictedLimitTime: weeklyHoursRemaining < 168 ? Date.now() + (weeklyHoursRemaining * 60 * 60 * 1000) : null,
          formatted: this.formatTimeRemaining(weeklyHoursRemaining)
        },
        weeklySonnet: {
          hoursRemaining: sonnetHoursRemaining,
          predictedLimitTime: sonnetHoursRemaining < 168 ? Date.now() + (sonnetHoursRemaining * 60 * 60 * 1000) : null,
          formatted: this.formatTimeRemaining(sonnetHoursRemaining)
        }
      };
      
      log('[HybridTracker] Predictions - Burn rate:', burnRate.tokensPerHour.toFixed(0), 'tokens/hr, Session limit in:', this.estimatedUsage.predictions.session.formatted);
    } else {
      this.estimatedUsage.predictions = null;
    }
  }
  
  getBurnRate() {
    if (this.tokenHistory.length < 2) {
      return { tokensPerHour: 0, sampleSize: this.tokenHistory.length, windowMinutes: 0 };
    }
    
    const now = Date.now();
    const cutoff = now - this.burnRateWindowMs;
    const recentHistory = this.tokenHistory.filter(h => h.timestamp > cutoff);
    
    if (recentHistory.length < 2) {
      return { tokensPerHour: 0, sampleSize: recentHistory.length, windowMinutes: 0 };
    }
    
    // Calculate total tokens and time span
    const totalTokens = recentHistory.reduce((sum, h) => sum + h.tokens, 0);
    const oldestTimestamp = Math.min(...recentHistory.map(h => h.timestamp));
    const timeSpanMs = now - oldestTimestamp;
    const timeSpanHours = timeSpanMs / (60 * 60 * 1000);
    
    // Avoid division by very small numbers
    if (timeSpanHours < 0.01) { // Less than 36 seconds
      return { tokensPerHour: 0, sampleSize: recentHistory.length, windowMinutes: 0 };
    }
    
    const tokensPerHour = totalTokens / timeSpanHours;
    
    return {
      tokensPerHour: tokensPerHour,
      sampleSize: recentHistory.length,
      windowMinutes: Math.round(timeSpanMs / 60000)
    };
  }
  
  formatTimeRemaining(hours) {
    if (!hours || hours <= 0) return 'now';
    if (hours > 168) return '7+ days'; // More than a week
    if (hours > 48) return Math.round(hours / 24) + ' days';
    if (hours > 24) return '1-2 days';
    if (hours >= 1) {
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
    }
    // Less than an hour
    const minutes = Math.round(hours * 60);
    return minutes + 'm';
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
      
      // Only use Firebase delta if it's HIGHER than local (prevents overwriting local progress)
      const firebaseDelta = data.delta || { inputTokens: 0, outputTokens: 0 };
      const firebaseTotal = (firebaseDelta.inputTokens || 0) + (firebaseDelta.outputTokens || 0);
      const localTotal = (this.delta.inputTokens || 0) + (this.delta.outputTokens || 0);
      
      if (firebaseTotal > localTotal) {
        this.delta = firebaseDelta;
        log('[HybridTracker] Used Firebase delta (higher):', firebaseTotal);
      } else {
        log('[HybridTracker] Kept local delta (higher):', localTotal);
      }
      
      if (data.tokenRates) this.tokenRates = data.tokenRates;
      await this.save();
      this.updateEstimate();
      log('[HybridTracker] Merged baseline from Firebase');
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

        // Clean up corrupted and old format modelUsage entries
        if (this.data.modelUsage) {
          const cleanedModelUsage = {};
          for (const [model, count] of Object.entries(this.data.modelUsage)) {
            // Skip non-numeric counts
            if (typeof count !== "number") {
              log("[UsageAnalytics] Removing corrupted modelUsage entry for", model);
              continue;
            }
            // Skip old format keys (with spaces, dots, or raw API date IDs)
            if (model.includes(" ") || model.includes(".") || model.includes("20250")) {
              log("[UsageAnalytics] Removing old format modelUsage entry:", model);
              continue;
            }
            cleanedModelUsage[model] = count;
          }
          this.data.modelUsage = cleanedModelUsage;
        }
      }
      log('[UsageAnalytics] modelUsage entries:', Object.keys(this.data.modelUsage || {}).length);
      if (this.data.modelUsage && Object.keys(this.data.modelUsage).length > 0) {
        log('[UsageAnalytics] Models:', this.data.modelUsage);
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
    if (!model) {
      log('[UsageAnalytics] recordModelUsage called with no model');
      return;
    }
    // Normalize model name for consistent tracking
    const normalizedModel = this.normalizeModelName(model);
    const oldCount = this.data.modelUsage[normalizedModel] || 0;
    this.data.modelUsage[normalizedModel] = oldCount + 1;
    log('[UsageAnalytics] Model usage recorded:', normalizedModel, '(raw:', model, ') - count:', this.data.modelUsage[normalizedModel]);
    // Must await the save to ensure it completes
    this.save().catch(e => logError('[UsageAnalytics] Save failed:', e.message));
  }
  
  normalizeModelName(model) {
    // Map API model IDs to Firebase-safe keys (no spaces, dots, $, #, [, ], /)
    if (!model) return "unknown";
    const m = model.toLowerCase();
    
    // Claude 4.5 models (latest)
    if (m.includes("opus-4-5") || m.includes("opus-4.5")) return "claude-opus-4-5";
    if (m.includes("sonnet-4-5") || m.includes("sonnet-4.5")) return "claude-sonnet-4-5";
    if (m.includes("haiku-4-5") || m.includes("haiku-4.5")) return "claude-haiku-4-5";
    
    // Claude 4 models
    if (m.includes("opus-4") || m === "claude-opus-4-20250514") return "claude-opus-4";
    if (m.includes("sonnet-4") || m === "claude-sonnet-4-20250514") return "claude-sonnet-4";
    if (m.includes("haiku-4") || m === "claude-haiku-4-20250514") return "claude-haiku-4";
    
    // Claude 3.5 models
    if (m.includes("opus-3-5") || m.includes("opus-3.5")) return "claude-opus-3-5";
    if (m.includes("sonnet-3-5") || m.includes("sonnet-3.5")) return "claude-sonnet-3-5";
    if (m.includes("haiku-3-5") || m.includes("haiku-3.5")) return "claude-haiku-3-5";
    
    // Claude 3 models
    if (m.includes("opus-3")) return "claude-opus-3";
    if (m.includes("sonnet-3")) return "claude-sonnet-3";
    if (m.includes("haiku-3")) return "claude-haiku-3";
    
    // Generic fallbacks
    if (m.includes("opus")) return "claude-opus";
    if (m.includes("sonnet")) return "claude-sonnet";
    if (m.includes("haiku")) return "claude-haiku";
    
    // Sanitize any remaining model name for Firebase
    return model.replace(/[.\s$#\[\]\/]/g, "-").toLowerCase();
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
    
    // Weekly comparison and daily breakdown
    const weeklyStats = this.getWeeklyStats();
    
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
      modelPreference: this.data.modelUsage,
      weeklyStats
    };
  }
  
  getSparklineData(days = 7) {
    // Get daily peak usage for the last N days
    const result = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const snapshots = this.data.dailySnapshots[dateStr];
      if (snapshots && Array.isArray(snapshots) && snapshots.length > 0) {
        // Get peak values for the day
        let peakSession = 0, peakWeekly = 0, peakSonnet = 0;
        for (const snap of snapshots) {
          if ((snap.session || 0) > peakSession) peakSession = snap.session || 0;
          if ((snap.weeklyAll || 0) > peakWeekly) peakWeekly = snap.weeklyAll || 0;
          if ((snap.weeklySonnet || 0) > peakSonnet) peakSonnet = snap.weeklySonnet || 0;
        }
        result.push({
          date: dateStr,
          session: peakSession,
          weeklyAll: peakWeekly,
          weeklySonnet: peakSonnet
        });
      } else {
        // No data for this day
        result.push({
          date: dateStr,
          session: null,
          weeklyAll: null,
          weeklySonnet: null
        });
      }
    }
    
    return result;
  }
  
  getWeeklyStats() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    
    // Get start of this week (Sunday)
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - dayOfWeek);
    thisWeekStart.setHours(0, 0, 0, 0);
    
    // Get start of last week
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setMilliseconds(-1);
    
    // Calculate averages for each week
    const thisWeekAvg = this.getAverageForRange(thisWeekStart, now);
    const lastWeekAvg = this.getAverageForRange(lastWeekStart, lastWeekEnd);
    
    // Week-over-week change
    let weekOverWeekChange = null;
    if (lastWeekAvg > 0 && thisWeekAvg > 0) {
      weekOverWeekChange = Math.round(((thisWeekAvg - lastWeekAvg) / lastWeekAvg) * 100);
    }
    
    // Daily breakdown for this week
    const dailyBreakdown = this.getDailyBreakdown(thisWeekStart, now);
    
    // Find busiest day
    let busiestDay = null;
    let busiestAvg = 0;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const [day, data] of Object.entries(dailyBreakdown)) {
      if (data.avg > busiestAvg) {
        busiestAvg = data.avg;
        busiestDay = dayNames[parseInt(day)];
      }
    }
    
    return {
      thisWeekAvg,
      lastWeekAvg,
      weekOverWeekChange,
      dailyBreakdown,
      busiestDay,
      busiestDayAvg: busiestAvg
    };
  }
  
  getAverageForRange(startDate, endDate) {
    let total = 0, count = 0;
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    for (const [date, snapshots] of Object.entries(this.data.dailySnapshots)) {
      if (date >= startStr && date <= endStr && Array.isArray(snapshots)) {
        for (const snap of snapshots) {
          total += snap.session || 0;
          count++;
        }
      }
    }
    
    return count > 0 ? Math.round(total / count) : 0;
  }
  
  getDailyBreakdown(startDate, endDate) {
    const breakdown = {};
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    for (const [date, snapshots] of Object.entries(this.data.dailySnapshots)) {
      if (date >= startStr && date <= endStr && Array.isArray(snapshots)) {
        const dayOfWeek = new Date(date).getDay();
        if (!breakdown[dayOfWeek]) {
          breakdown[dayOfWeek] = { total: 0, count: 0, peak: 0 };
        }
        for (const snap of snapshots) {
          const session = snap.session || 0;
          breakdown[dayOfWeek].total += session;
          breakdown[dayOfWeek].count++;
          if (session > breakdown[dayOfWeek].peak) {
            breakdown[dayOfWeek].peak = session;
          }
        }
      }
    }
    
    // Calculate averages
    for (const day of Object.keys(breakdown)) {
      breakdown[day].avg = breakdown[day].count > 0 
        ? Math.round(breakdown[day].total / breakdown[day].count) 
        : 0;
    }
    
    return breakdown;
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

// Time tracking data
const DEFAULT_TIME_DATA = {
  today: { date: null, ms: 0 },
  thisWeek: { weekStart: null, ms: 0 },
  allTime: { ms: 0 }
};

async function getTimeData() {
  try {
    const result = await chrome.storage.local.get('timeData');
    const data = result.timeData || { ...DEFAULT_TIME_DATA };
    
    // Check if we need to reset today
    const today = new Date().toISOString().split('T')[0];
    if (data.today.date !== today) {
      data.today = { date: today, ms: 0 };
    }
    
    // Check if we need to reset this week (Sunday start)
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    
    if (data.thisWeek.weekStart !== weekStartStr) {
      data.thisWeek = { weekStart: weekStartStr, ms: 0 };
    }
    
    return data;
  } catch (e) {
    return { ...DEFAULT_TIME_DATA };
  }
}

async function updateTimeData(sessionTimeMs, sessionId = null) {
  try {
    const data = await getTimeData();
    const today = new Date().toISOString().split('T')[0];
    
    // Calculate increment (difference from last update)
    // Reset lastSessionTime if this is a new session (page refresh, extension reload)
    const isNewSession = sessionId && sessionId !== data.lastSessionId;
    const lastSession = isNewSession ? 0 : (data.lastSessionTime || 0);
    if (isNewSession) {
      log("[CUP BG] New time tracking session detected:", sessionId);
    }
    const increment = Math.max(0, sessionTimeMs - lastSession);
    
    // Update today
    if (data.today.date === today) {
      data.today.ms += increment;
    } else {
      data.today = { date: today, ms: increment };
    }
    
    // Update this week
    data.thisWeek.ms += increment;
    
    // Update all time
    data.allTime.ms = (data.allTime.ms || 0) + increment;
    
    // Store last session time to calculate increment
    data.lastSessionTime = sessionTimeMs;
    if (sessionId) data.lastSessionId = sessionId;
    
    await chrome.storage.local.set({ timeData: data });
    return data;
  } catch (e) {
    logError('Time data update error:', e);
    return null;
  }
}

function formatTimeMs(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

const DEFAULT_SETTINGS = {
  badgeDisplay: 'session',
  showSidebar: true,
  showChatOverlay: true,
  sidebarMinimized: false,
  enableVoice: false,
  enableResetNotifications: true,
  firebaseDatabaseUrl: '',
  firebaseApiKey: '',
  anthropicApiKey: '',
  firebaseSyncId: '',
  // Custom alert thresholds (percentage)
  thresholdWarning: 70,
  thresholdDanger: 90,
  // Stats bar metric visibility
  statsBarShowDraft: true,
  statsBarShowFiles: true,
  statsBarShowSession: true,
  statsBarShowWeekly: true,
  statsBarShowSonnet: true,
  statsBarShowTimer: true,
  // Auto-refresh baseline settings
  autoRefreshEnabled: true,
  autoRefreshMinutes: 15,
  // Auto-continue settings
  enableAutoContinue: false,
  autoContinueDelay: 1500,
  maxAutoContinues: 10
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
    
    // Schedule reset notification if usage is high
    await scheduleResetNotification(data);
  } catch (e) {
    console.error('[CUP BG] Save error:', e.message);
  }
}

async function updateBadge(usageData) {
  const settings = await getSettings();
  let percent = 0;
  let color = '#4CAF50';
  let hasData = false;

  switch (settings.badgeDisplay) {
    case 'session':
      percent = usageData?.currentSession?.percent || 0;
      hasData = usageData?.currentSession?.percent !== undefined;
      break;
    case 'weekly-all':
      percent = usageData?.weeklyAllModels?.percent || 0;
      hasData = usageData?.weeklyAllModels?.percent !== undefined;
      break;
    case 'weekly-sonnet':
      percent = usageData?.weeklySonnet?.percent || 0;
      hasData = usageData?.weeklySonnet?.percent !== undefined;
      break;
    case 'none':
      chrome.action.setBadgeText({ text: '' });
      return;
  }

  if (percent >= 90) color = '#f44336';
  else if (percent >= 70) color = '#ff9800';

  // Always show badge - "0" if we have data with 0%, "--" if no data yet
  let badgeText = '--';
  if (hasData) {
    badgeText = String(percent);
  }
  
  chrome.action.setBadgeText({ text: badgeText });
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
      
      // Start with stored data as base
      let merged = { ...usageData };
      
      // Merge with HybridTracker estimates using "highest value wins" strategy
      // Usage can only go up (until reset), so the higher value is always correct
      if (hybridTracker?.estimatedUsage && hybridTracker?.baseline) {
        const est = hybridTracker.estimatedUsage;
        
        // For session: use whichever is HIGHER
        if (est.currentSession) {
          const estPct = est.currentSession.percent || 0;
          const storedPct = usageData.currentSession?.percent || 0;
          
          if (estPct >= storedPct) {
            merged.currentSession = est.currentSession;
          }
          // Preserve reset timestamp from estimate if available
          if (est.currentSession.resetsAt && !merged.currentSession?.resetsAt) {
            merged.currentSession = { ...merged.currentSession, resetsAt: est.currentSession.resetsAt };
          }
        }
        
        // Same for weekly all models
        if (est.weeklyAllModels) {
          const estPct = est.weeklyAllModels.percent || 0;
          const storedPct = usageData.weeklyAllModels?.percent || 0;
          if (estPct >= storedPct) {
            merged.weeklyAllModels = est.weeklyAllModels;
          }
        }
        
        // Same for weekly sonnet
        if (est.weeklySonnet) {
          const estPct = est.weeklySonnet.percent || 0;
          const storedPct = usageData.weeklySonnet?.percent || 0;
          if (estPct >= storedPct) {
            merged.weeklySonnet = est.weeklySonnet;
          }
        }
        
        // Include delta tracking info
        if (est.deltaTokens > 0) {
          merged.isEstimate = true;
          merged.deltaTokens = est.deltaTokens;
        }
        
        // Include predictions if available
        if (est.predictions) {
          merged.predictions = est.predictions;
        }
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
      const { inputTokens, outputTokens, model, extendedThinking } = message;
      
      // Use Anthropic API for accurate counting if available
      let finalInputTokens = inputTokens || 0;
      if (tokenCounter?.isConfigured() && message.text) {
        const accurate = await tokenCounter.countTokens(message.text);
        if (accurate) {
          finalInputTokens = accurate;
        }
      }
      
      // Apply model and extended thinking multipliers
      const adjusted = applyTokenMultipliers(
        finalInputTokens,
        outputTokens || 0,
        model,
        extendedThinking || false
      );
      
      if (hybridTracker) {
        const estimated = await hybridTracker.addTokenDelta(adjusted.inputTokens, adjusted.outputTokens);
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

    case 'RATE_LIMIT_DETECTED': {
      await handleRateLimitDetected(message.rateLimitState);
      return { success: true };
    }

    case 'RATE_LIMIT_CLEARED': {
      await handleRateLimitCleared();
      return { success: true };
    }

    case 'GET_RATE_LIMIT_STATE': {
      // Check if it should have expired or has no valid reset time
      if (rateLimitState.isLimited) {
        if (!rateLimitState.resetTime || Date.now() > rateLimitState.resetTime) {
          await handleRateLimitCleared();
        }
      }
      return { rateLimitState };
    }
    
    case 'CLEAR_RATE_LIMIT_STATE': {
      await handleRateLimitCleared();
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
        lastPush: firebaseSync?.lastPush || null,
        lastPull: firebaseSync?.lastPull || null,
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
        
        // Sync time data
        const timeData = await getTimeData();
        await firebaseSync.syncTimeData(timeData);
        log('[CUP BG] Pushed time data');
        
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

    case 'GET_SPARKLINE_DATA': {
      if (!usageAnalytics) return { sparkline: null };
      return { sparkline: usageAnalytics.getSparklineData(message.days || 7) };
    }

    case 'GET_TIME_DATA': {
      const timeData = await getTimeData();
      return { timeData };
    }

    case 'UPDATE_TIME_DATA': {
      const timeData = await updateTimeData(message.sessionTime, message.sessionId);
      return { timeData };
    }

    case 'TIME_UPDATE': {
      // Just acknowledge - time data is saved via UPDATE_TIME_DATA
      return { ok: true };
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

    case 'CLEAN_MODEL_USAGE': {
      if (usageAnalytics) {
        usageAnalytics.data.modelUsage = {};
        await usageAnalytics.save();
        log('[CUP BG] Model usage cleaned');
        // Also sync to Firebase to clean remote data
        if (firebaseSync?.syncEnabled) {
          await firebaseSync.syncAnalytics(await usageAnalytics.export());
          log('[CUP BG] Cleaned model usage synced to Firebase');
        }
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
      
      // Merge into hybrid tracker - this updates the baseline but PRESERVES local deltas
      if (syncedData.baseline && hybridTracker) {
        await hybridTracker.mergeFromFirebase(syncedData);
      }
      
      // IMPORTANT: Use HybridTracker's estimate (which includes local deltas)
      // rather than raw Firebase percentages, to avoid losing tracked progress
      if (hybridTracker?.estimatedUsage) {
        const estimate = hybridTracker.estimatedUsage;
        const current = await getUsageData();
        
        // Only update if we have meaningful data
        if (estimate.currentSession?.percent > 0 || estimate.weeklyAllModels?.percent > 0) {
          const merged = {
            ...current,
            currentSession: estimate.currentSession,
            weeklyAllModels: estimate.weeklyAllModels,
            weeklySonnet: estimate.weeklySonnet,
            isEstimate: true,
            deltaTokens: estimate.deltaTokens,
            lastUpdated: Date.now()
          };
          
          await chrome.storage.local.set({ usageData: merged });
          await updateBadge(merged);
          log("[CUP BG] Stored usage from HybridTracker estimate:", merged.currentSession?.percent + "%", merged.weeklyAllModels?.percent + "%", "delta:", estimate.deltaTokens);
        }
      } else {
        // Fallback: no hybrid tracker, use Firebase data directly
        const usageForStorage = {};
        const source = syncedData.currentSession ? syncedData : (syncedData.estimatedUsage || syncedData.baseline || syncedData);
        if (source) {
          if (source.currentSession) usageForStorage.currentSession = source.currentSession;
          if (source.weeklyAllModels) usageForStorage.weeklyAllModels = source.weeklyAllModels;
          if (source.weeklySonnet) usageForStorage.weeklySonnet = source.weeklySonnet;
        }
        
        if (Object.keys(usageForStorage).length > 0) {
          const current = await getUsageData();
          const merged = {
            ...current,
            ...usageForStorage,
            lastUpdated: Date.now()
          };
          
          await chrome.storage.local.set({ usageData: merged });
          await updateBadge(merged);
          log("[CUP BG] Stored usage from Firebase (no HybridTracker):", merged.currentSession?.percent + "%", merged.weeklyAllModels?.percent + "%");
        }
      }
    }
    // Pull analytics
    const analytics = await firebaseSync.getAnalytics();
    if (analytics && usageAnalytics) {
      log('[CUP BG] Pulled analytics from Firebase');
      
      // Merge modelUsage by taking the higher count for each model
      const mergedModelUsage = { ...usageAnalytics.data.modelUsage };
      if (analytics.modelUsage) {
        for (const [model, count] of Object.entries(analytics.modelUsage)) {
          if (typeof count === "number" && !model.includes(" ") && !model.includes(".") && !model.includes(":") && !model.includes("20250")) {
            mergedModelUsage[model] = Math.max(mergedModelUsage[model] || 0, count);
          }
        }
      }
      
      // Merge peakUsage by taking the higher values
      const mergedPeakUsage = {
        session: Math.max(usageAnalytics.data.peakUsage?.session || 0, analytics.peakUsage?.session || 0),
        weeklyAll: Math.max(usageAnalytics.data.peakUsage?.weeklyAll || 0, analytics.peakUsage?.weeklyAll || 0),
        weeklySonnet: Math.max(usageAnalytics.data.peakUsage?.weeklySonnet || 0, analytics.peakUsage?.weeklySonnet || 0)
      };
      
      // Merge dailySnapshots by combining arrays for each date
      const mergedDailySnapshots = { ...usageAnalytics.data.dailySnapshots };
      if (analytics.dailySnapshots) {
        for (const [date, snapshots] of Object.entries(analytics.dailySnapshots)) {
          if (Array.isArray(snapshots)) {
            if (!mergedDailySnapshots[date]) {
              mergedDailySnapshots[date] = [];
            }
            // Add snapshots that don't already exist (by timestamp)
            const existingTimestamps = new Set(mergedDailySnapshots[date].map(s => s.timestamp));
            for (const snap of snapshots) {
              if (!existingTimestamps.has(snap.timestamp)) {
                mergedDailySnapshots[date].push(snap);
              }
            }
          }
        }
      }
      
      // Merge thresholdEvents by deduplicating (by date + threshold)
      const mergedThresholdEvents = [...(usageAnalytics.data.thresholdEvents || [])];
      if (Array.isArray(analytics.thresholdEvents)) {
        const existingKeys = new Set(mergedThresholdEvents.map(e => `${e.date}-${e.threshold}`));
        for (const event of analytics.thresholdEvents) {
          const key = `${event.date}-${event.threshold}`;
          if (!existingKeys.has(key)) {
            mergedThresholdEvents.push(event);
          }
        }
      }
      
      usageAnalytics.data = { 
        ...usageAnalytics.data, 
        ...analytics,
        modelUsage: mergedModelUsage,
        peakUsage: mergedPeakUsage,
        dailySnapshots: mergedDailySnapshots,
        thresholdEvents: mergedThresholdEvents,
      };
      await usageAnalytics.save();
      log('[CUP BG] Analytics merged - models:', Object.keys(mergedModelUsage).length, 'days:', Object.keys(mergedDailySnapshots).length);
    }


    // Pull time data and merge (take higher values for same date)
    const remoteTimeData = await firebaseSync.getTimeDataFromFirebase();
    if (remoteTimeData) {
      const localTimeData = await getTimeData();
      const today = new Date().toISOString().split("T")[0];
      
      // Merge today - take higher value if same date
      if (remoteTimeData.today?.date === today && localTimeData.today?.date === today) {
        localTimeData.today.ms = Math.max(localTimeData.today.ms || 0, remoteTimeData.today.ms || 0);
      } else if (remoteTimeData.today?.date === today) {
        localTimeData.today = remoteTimeData.today;
      }
      
      // Merge thisWeek - take higher value if same week
      if (remoteTimeData.thisWeek?.weekStart === localTimeData.thisWeek?.weekStart) {
        localTimeData.thisWeek.ms = Math.max(localTimeData.thisWeek.ms || 0, remoteTimeData.thisWeek.ms || 0);
      } else if (remoteTimeData.thisWeek?.weekStart > (localTimeData.thisWeek?.weekStart || "")) {
        localTimeData.thisWeek = remoteTimeData.thisWeek;
      }
      
      // Merge allTime - take higher value
      localTimeData.allTime = localTimeData.allTime || { ms: 0 };
      localTimeData.allTime.ms = Math.max(localTimeData.allTime.ms || 0, remoteTimeData.allTime?.ms || 0);
      
      await chrome.storage.local.set({ timeData: localTimeData });
      log("[CUP BG] Merged time data from Firebase - today:", Math.round(localTimeData.today.ms / 60000) + "min");
    }

    // Pull settings (including anthropicApiKey)
    const syncedSettings = await firebaseSync.getSettings();
    log('[CUP BG] Synced settings from Firebase:', JSON.stringify(syncedSettings));
    if (syncedSettings) {
      log('[CUP BG] Pulled settings from Firebase, has anthropicApiKey:', !!syncedSettings.anthropicApiKey);
      const currentSettings = await getSettings();
      
      // Merge synced settings, but don't overwrite Firebase credentials (device-specific)
      // Use ?? for booleans to handle false values correctly, || for strings
      const mergedSettings = {
        ...currentSettings,
        
        // Display settings
        badgeDisplay: syncedSettings.badgeDisplay || currentSettings.badgeDisplay,
        showSidebar: syncedSettings.showSidebar ?? currentSettings.showSidebar,
        showChatOverlay: syncedSettings.showChatOverlay ?? currentSettings.showChatOverlay,
        sidebarMinimized: syncedSettings.sidebarMinimized ?? currentSettings.sidebarMinimized,
        enableVoice: syncedSettings.enableVoice ?? currentSettings.enableVoice,
        enableResetNotifications: syncedSettings.enableResetNotifications ?? currentSettings.enableResetNotifications,
        
        // Threshold settings
        thresholdWarning: syncedSettings.thresholdWarning ?? currentSettings.thresholdWarning,
        thresholdDanger: syncedSettings.thresholdDanger ?? currentSettings.thresholdDanger,
        
        // Stats bar visibility settings
        statsBarShowDraft: syncedSettings.statsBarShowDraft ?? currentSettings.statsBarShowDraft,
        statsBarShowFiles: syncedSettings.statsBarShowFiles ?? currentSettings.statsBarShowFiles,
        statsBarShowSession: syncedSettings.statsBarShowSession ?? currentSettings.statsBarShowSession,
        statsBarShowWeekly: syncedSettings.statsBarShowWeekly ?? currentSettings.statsBarShowWeekly,
        statsBarShowSonnet: syncedSettings.statsBarShowSonnet ?? currentSettings.statsBarShowSonnet,
        statsBarShowTimer: syncedSettings.statsBarShowTimer ?? currentSettings.statsBarShowTimer,
        
        // Auto-refresh settings
        autoRefreshEnabled: syncedSettings.autoRefreshEnabled ?? currentSettings.autoRefreshEnabled,
        autoRefreshMinutes: syncedSettings.autoRefreshMinutes ?? currentSettings.autoRefreshMinutes,
        
        // Auto-continue settings
        enableAutoContinue: syncedSettings.enableAutoContinue ?? currentSettings.enableAutoContinue,
        autoContinueDelay: syncedSettings.autoContinueDelay ?? currentSettings.autoContinueDelay,
        maxAutoContinues: syncedSettings.maxAutoContinues ?? currentSettings.maxAutoContinues,
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
      log('[CUP BG] Merged and saved all synced settings');
    }

    firebaseSync.lastPull = Date.now();
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

// ============================================================================
// Reset Notifications
// ============================================================================

// Parse reset time string to minutes (e.g., "4 hours" -> 240, "30 minutes" -> 30)
function parseResetTimeToMinutes(resetStr) {
  if (!resetStr || resetStr === '--') return null;
  
  const str = resetStr.toLowerCase().trim();
  let totalMinutes = 0;
  
  // Match patterns like "4 hours", "4h 30m", "30 minutes", "2 days"
  const hourMatch = str.match(/(\d+)\s*(?:hours?|hr?s?)/);
  const minMatch = str.match(/(\d+)\s*(?:minutes?|mins?|m)(?!o)/); // (?!o) to avoid matching "months"
  const dayMatch = str.match(/(\d+)\s*(?:days?|d)/);
  
  if (dayMatch) totalMinutes += parseInt(dayMatch[1]) * 24 * 60;
  if (hourMatch) totalMinutes += parseInt(hourMatch[1]) * 60;
  if (minMatch) totalMinutes += parseInt(minMatch[1]);
  
  return totalMinutes > 0 ? totalMinutes : null;
}

// Schedule a notification for when usage resets
async function scheduleResetNotification(usageData) {
  const settings = await getSettings();
  if (!settings.enableResetNotifications) return;
  
  const sessionPercent = usageData?.currentSession?.percent || 0;
  const resetStr = usageData?.currentSession?.resetsIn;
  
  // Only schedule if usage is high (>= 70%)
  if (sessionPercent < 70) {
    // Clear any existing alarm if usage dropped
    chrome.alarms.clear('resetNotification');
    return;
  }
  
  const resetMinutes = parseResetTimeToMinutes(resetStr);
  if (!resetMinutes) return;
  
  // Schedule alarm
  chrome.alarms.create('resetNotification', { delayInMinutes: resetMinutes });
  log('[CUP BG] Scheduled reset notification in', resetMinutes, 'minutes');
}

// Show the reset notification
async function showResetNotification() {
  try {
    await chrome.notifications.create('usageReset', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Claude Usage Reset',
      message: 'Your session usage limit has reset. You can continue chatting!',
      priority: 2
    });
    log('[CUP BG] Reset notification shown');
  } catch (e) {
    logError('[CUP BG] Notification error:', e.message);
  }
}

// Periodic badge update
chrome.alarms.create('updateBadge', { periodInMinutes: 1 });

// Auto-refresh baseline check (runs every minute, but only refreshes if stale)
chrome.alarms.create('autoRefreshCheck', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'updateBadge') {
    const usageData = await getUsageData();
    await updateBadge(usageData);
  } else if (alarm.name === 'resetNotification') {
    await showResetNotification();
  } else if (alarm.name === 'autoRefreshCheck') {
    await checkAndAutoRefresh();
  }
});

// Auto-refresh baseline if stale
async function checkAndAutoRefresh() {
  const settings = await getSettings();
  
  // Check if auto-refresh is enabled
  if (!settings.autoRefreshEnabled) return;
  
  // Check baseline age
  if (!hybridTracker?.baseline?.timestamp) return;
  
  const baselineAgeMs = Date.now() - hybridTracker.baseline.timestamp;
  const refreshThresholdMs = (settings.autoRefreshMinutes || 30) * 60 * 1000;
  
  if (baselineAgeMs < refreshThresholdMs) {
    // Baseline is fresh enough
    return;
  }
  
  log('[CUP BG] Baseline is stale (' + Math.round(baselineAgeMs / 60000) + 'm), auto-refreshing...');
  
  // Open usage page in background tab, scrape, then close
  try {
    const tab = await chrome.tabs.create({
      url: 'https://claude.ai/settings/usage',
      active: false // Background tab
    });
    
    // Wait for page to load and scrape
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // Send message to content script to scrape
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_USAGE' });
      log('[CUP BG] Auto-refresh scrape triggered');
    } catch (e) {
      log('[CUP BG] Auto-refresh scrape message failed:', e.message);
    }
    
    // Wait for scrape to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Close the tab
    await chrome.tabs.remove(tab.id);
    log('[CUP BG] Auto-refresh complete, tab closed');
    
    // Show notification
    try {
      await chrome.notifications.create('autoRefresh', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Claude Usage Pro',
        message: 'Usage data auto-refreshed',
        priority: 0
      });
      // Auto-dismiss after 3 seconds
      setTimeout(() => {
        chrome.notifications.clear('autoRefresh');
      }, 3000);
    } catch (e) {
      // Notifications might not be available
    }
    
  } catch (e) {
    logError('[CUP BG] Auto-refresh failed:', e.message);
  }
}

// Global error handler for unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
  logError('Unhandled rejection:', event.reason);
  event.preventDefault();
});

// ============================================================================
// Rate Limit Detection & Tracking
// ============================================================================

let rateLimitState = {
  isLimited: false,
  retryAfter: null,
  resetTime: null,
  message: null,
  detectedAt: null,
  source: null,
  history: []  // Track rate limit events for analytics
};

async function handleRateLimitDetected(state) {
  log('[CUP BG] Rate limit detected:', state.source, state.resetTime ? new Date(state.resetTime).toLocaleTimeString() : 'unknown reset');
  
  rateLimitState = {
    ...state,
    history: [...(rateLimitState.history || []).slice(-19), {
      detectedAt: state.detectedAt || Date.now(),
      source: state.source,
      resetTime: state.resetTime
    }]
  };
  
  // Save to storage
  await chrome.storage.local.set({ rateLimitState });
  
  // Update badge to show rate limited status
  chrome.action.setBadgeText({ text: '⛔' });
  chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
  
  // Show notification if enabled
  const settings = await getSettings();
  if (settings.enableResetNotifications) {
    try {
      await chrome.notifications.create('rateLimited', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Claude Rate Limit Reached',
        message: state.resetTime 
          ? `Usage limit reached. Resets at ${new Date(state.resetTime).toLocaleTimeString()}`
          : 'Usage limit reached. Please wait before sending more messages.',
        priority: 2
      });
    } catch (e) {
      logError('[CUP BG] Notification error:', e.message);
    }
  }
  
  // Schedule alarm for when limit resets
  if (state.resetTime) {
    const resetDelay = Math.max(1, Math.ceil((state.resetTime - Date.now()) / 60000));
    chrome.alarms.create('rateLimitReset', { delayInMinutes: resetDelay });
    log('[CUP BG] Scheduled rate limit reset alarm in', resetDelay, 'minutes');
  }
  
  // Notify all tabs
  chrome.tabs.query({ url: 'https://claude.ai/*' }).then(tabs => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { 
        type: 'RATE_LIMIT_UPDATED', 
        rateLimitState 
      }).catch(() => {});
    }
  }).catch(() => {});
}

async function handleRateLimitCleared() {
  log('[CUP BG] Rate limit cleared');
  
  rateLimitState.isLimited = false;
  await chrome.storage.local.set({ rateLimitState });
  
  // Restore normal badge
  const usageData = await getUsageData();
  await updateBadge(usageData);
  
  // Clear the alarm
  chrome.alarms.clear('rateLimitReset');
  
  // Notify tabs
  chrome.tabs.query({ url: 'https://claude.ai/*' }).then(tabs => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { 
        type: 'RATE_LIMIT_UPDATED', 
        rateLimitState: { isLimited: false }
      }).catch(() => {});
    }
  }).catch(() => {});
  
  // Show reset notification
  const settings = await getSettings();
  if (settings.enableResetNotifications) {
    try {
      await chrome.notifications.create('rateLimitCleared', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Rate Limit Reset',
        message: 'Your usage limit has reset. You can continue chatting!',
        priority: 1
      });
    } catch (e) {}
  }
}

// Load stored rate limit state on startup
chrome.storage.local.get('rateLimitState').then(result => {
  if (result.rateLimitState) {
    rateLimitState = result.rateLimitState;
    
    // Check if it should have expired or has no valid reset time
    if (rateLimitState.isLimited) {
      if (!rateLimitState.resetTime || Date.now() > rateLimitState.resetTime) {
        handleRateLimitCleared();
      }
    }
  }
});

// Handle rate limit reset alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'rateLimitReset') {
    await handleRateLimitCleared();
  }
});
