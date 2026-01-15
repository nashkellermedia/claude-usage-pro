/**
 * Claude Usage Pro - Background Service Worker v1.9.0
 * 
 * HYBRID TRACKING APPROACH:
 * 1. UsageFetcher - Directly fetches usage from Claude's API
 * 2. HybridTracker - Maintains baseline + token deltas
 * 3. FirebaseSync - Syncs across devices
 * 4. UsageAnalytics - Historical tracking
 * 
 * The key improvement: We try to fetch real usage data from Claude's API
 * instead of relying solely on page scraping or token estimates.
 */

// ============================================================================
// INLINE: UsageFetcher Class
// ============================================================================

class UsageFetcher {
  constructor() {
    this.organizationId = null;
    this.lastFetch = null;
    this.lastData = null;
    this.minFetchInterval = 30000;
  }

  async initialize() {
    try {
      this.organizationId = await this.getOrganizationId();
      console.log('[UsageFetcher] Initialized, org:', this.organizationId);
      return !!this.organizationId;
    } catch (e) {
      console.error('[UsageFetcher] Init error:', e.message);
      return false;
    }
  }

  async getOrganizationId() {
    try {
      const cached = await chrome.storage.local.get('cup_org_id');
      if (cached.cup_org_id) return cached.cup_org_id;

      // We need to get this from a tab that's logged into Claude
      // Store it when we see it in requests
      return null;
    } catch (e) {
      return null;
    }
  }

  async fetchUsageFromTab(tabId) {
    // This sends a message to content script to fetch usage
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'FETCH_USAGE_API' });
      if (response?.usageData) {
        this.lastData = response.usageData;
        this.lastFetch = Date.now();
        return response.usageData;
      }
    } catch (e) {
      console.log('[UsageFetcher] Tab fetch failed:', e.message);
    }
    return null;
  }

  getCached() {
    return this.lastData;
  }
}

// ============================================================================
// INLINE: HybridTracker Class
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
      if (stored.cup_baseline) this.baseline = stored.cup_baseline;
      if (stored.cup_delta) this.delta = stored.cup_delta;
      if (stored.cup_token_rates) this.tokenRates = stored.cup_token_rates;
      this.updateEstimate();
      return true;
    } catch (e) {
      console.error('[HybridTracker] Init error:', e.message);
      return false;
    }
  }

  async setBaseline(usageData, source = 'unknown') {
    const now = Date.now();
    this.baseline = {
      currentSession: usageData.currentSession || { percent: 0, resetsIn: '--' },
      weeklyAllModels: usageData.weeklyAllModels || { percent: 0, resetsAt: '--' },
      weeklySonnet: usageData.weeklySonnet || { percent: 0, resetsIn: '--' },
      source, timestamp: now
    };
    this.delta = { inputTokens: 0, outputTokens: 0, lastReset: now };
    await this.save();
    this.updateEstimate();
    console.log('[HybridTracker] New baseline from', source);
    return this.baseline;
  }

  async addTokenDelta(inputTokens = 0, outputTokens = 0) {
    this.delta.inputTokens += inputTokens;
    this.delta.outputTokens += outputTokens;
    this.updateEstimate();
    
    const total = this.delta.inputTokens + this.delta.outputTokens;
    if (total % 1000 < (inputTokens + outputTokens)) {
      await this.save();
    }
    return this.estimatedUsage;
  }

  updateEstimate() {
    if (!this.baseline) {
      this.estimatedUsage = null;
      return;
    }

    const totalDelta = this.delta.inputTokens + this.delta.outputTokens;
    const sessionDeltaPct = totalDelta / this.tokenRates.sessionTokensPer1Percent;
    const weeklyDeltaPct = totalDelta / this.tokenRates.weeklyTokensPer1Percent;

    this.estimatedUsage = {
      currentSession: {
        percent: Math.min(100, Math.round((this.baseline.currentSession?.percent || 0) + sessionDeltaPct)),
        resetsIn: this.baseline.currentSession?.resetsIn || '--',
        isEstimate: totalDelta > 0
      },
      weeklyAllModels: {
        percent: Math.min(100, Math.round((this.baseline.weeklyAllModels?.percent || 0) + weeklyDeltaPct)),
        resetsAt: this.baseline.weeklyAllModels?.resetsAt || '--',
        isEstimate: totalDelta > 0
      },
      weeklySonnet: this.baseline.weeklySonnet ? {
        percent: Math.min(100, Math.round((this.baseline.weeklySonnet?.percent || 0) + weeklyDeltaPct)),
        resetsIn: this.baseline.weeklySonnet?.resetsIn || '--',
        isEstimate: totalDelta > 0
      } : null,
      baselineSource: this.baseline.source,
      baselineAge: Date.now() - this.baseline.timestamp,
      deltaTokens: totalDelta,
      estimatedAt: Date.now()
    };
  }

  getCurrentUsage() {
    return this.estimatedUsage || {
      currentSession: { percent: 0, resetsIn: '--', isEstimate: true },
      weeklyAllModels: { percent: 0, resetsAt: '--', isEstimate: true },
      weeklySonnet: null,
      baselineSource: 'none',
      deltaTokens: 0
    };
  }

  isBaselineStale(thresholdMs = 300000) {
    if (!this.baseline) return true;
    return (Date.now() - this.baseline.timestamp) > thresholdMs;
  }

  exportForSync() {
    return { baseline: this.baseline, delta: this.delta, tokenRates: this.tokenRates };
  }

  async mergeFromFirebase(data) {
    if (!data?.baseline) return false;
    if (!this.baseline || data.baseline.timestamp > this.baseline.timestamp) {
      this.baseline = data.baseline;
      if (data.delta) this.delta = data.delta;
      await this.save();
      this.updateEstimate();
      return true;
    }
    return false;
  }

  async save() {
    try {
      await chrome.storage.local.set({
        cup_baseline: this.baseline,
        cup_delta: this.delta,
        cup_token_rates: this.tokenRates
      });
    } catch (e) {}
  }

  async reset() {
    this.baseline = null;
    this.delta = { inputTokens: 0, outputTokens: 0, lastReset: Date.now() };
    this.estimatedUsage = null;
    await chrome.storage.local.remove(['cup_baseline', 'cup_delta']);
  }
}

// ============================================================================
// INLINE: FirebaseSync Class
// ============================================================================

class FirebaseSync {
  constructor() {
    this.firebaseUrl = null;
    this.deviceId = null;
    this.syncEnabled = false;
    this.lastSync = null;
    this.syncInterval = null;
  }

  async initialize(firebaseUrl) {
    if (!this.deviceId) {
      this.deviceId = await this.getOrCreateDeviceId();
    }

    if (!firebaseUrl || firebaseUrl.trim() === '') {
      this.syncEnabled = false;
      this.stopAutoSync();
      return false;
    }

    this.firebaseUrl = firebaseUrl.trim().replace(/\/$/, '');

    if (!this.firebaseUrl.includes('firebaseio.com') && !this.firebaseUrl.includes('firebasedatabase.app')) {
      console.error('[Firebase] Invalid URL format');
      return false;
    }

    const connected = await this.testConnection();
    if (connected) {
      this.syncEnabled = true;
      this.startAutoSync();
      console.log('[Firebase] Initialized');
      return true;
    }

    console.error('[Firebase] Connection failed');
    return false;
  }

  async testConnection() {
    try {
      const response = await fetch(`${this.firebaseUrl}/usage.json`);
      return response.ok;
    } catch (e) {
      return false;
    }
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

  async syncToFirebase(data) {
    if (!this.syncEnabled || !this.firebaseUrl) return { success: false };

    try {
      const syncData = {
        ...data,
        deviceId: this.deviceId,
        deviceName: await this.getDeviceName(),
        syncedAt: Date.now(),
        timestamp: new Date().toISOString()
      };

      const response = await fetch(`${this.firebaseUrl}/usage/${this.deviceId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncData)
      });

      if (response.ok) {
        this.lastSync = Date.now();
        return { success: true };
      }
      return { success: false };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async syncFromFirebase() {
    if (!this.syncEnabled || !this.firebaseUrl) return { success: false };

    try {
      const response = await fetch(`${this.firebaseUrl}/usage.json`);
      if (!response.ok) return { success: false };

      const data = await response.json();
      if (!data) return { success: true, devices: [] };

      const devices = Object.entries(data).map(([deviceId, d]) => ({ deviceId, ...d }));
      devices.sort((a, b) => (b.syncedAt || 0) - (a.syncedAt || 0));

      return { success: true, devices };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getMergedUsage() {
    const result = await this.syncFromFirebase();
    if (!result.success || !result.devices?.length) return null;

    const mostRecent = result.devices[0];
    return {
      currentSession: mostRecent.currentSession,
      weeklyAllModels: mostRecent.weeklyAllModels,
      weeklySonnet: mostRecent.weeklySonnet,
      baseline: mostRecent.baseline,
      delta: mostRecent.delta,
      lastUpdated: mostRecent.timestamp,
      deviceCount: result.devices.length,
      devices: result.devices.map(d => ({ id: d.deviceId, name: d.deviceName, lastSync: d.timestamp }))
    };
  }

  startAutoSync() {
    this.stopAutoSync();
    this.syncInterval = setInterval(async () => {
      const result = await chrome.storage.local.get(['usageData']);
      if (result.usageData) {
        await this.syncToFirebase(result.usageData);
      }
    }, 30000);
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async getDeviceName() {
    const ua = self.navigator?.userAgent || '';
    let os = ua.includes('Mac') ? 'Mac' : ua.includes('Windows') ? 'Windows' : ua.includes('Linux') ? 'Linux' : 'Unknown';
    const result = await chrome.storage.local.get('cup_profile_name');
    const profile = result.cup_profile_name || (this.deviceId?.substring(7, 15) || 'unknown');
    return `${os} - Chrome - ${profile}`;
  }

  getStatus() {
    return {
      enabled: this.syncEnabled,
      firebaseUrl: this.firebaseUrl,
      deviceId: this.deviceId,
      lastSync: this.lastSync,
      lastSyncTime: this.lastSync ? new Date(this.lastSync).toLocaleString() : 'Never'
    };
  }

  disable() {
    this.syncEnabled = false;
    this.firebaseUrl = null;
    this.stopAutoSync();
  }
}

// ============================================================================
// INLINE: UsageAnalytics Class (simplified)
// ============================================================================

class UsageAnalytics {
  constructor() {
    this.lastThresholdCheck = { session: 0, weeklyAll: 0, weeklySonnet: 0 };
  }

  async processUsageUpdate(usageData) {
    if (!usageData) return;

    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const analytics = await this.getAnalytics();

    // Record daily snapshot
    analytics.dailySnapshots = analytics.dailySnapshots || {};
    analytics.dailySnapshots[today] = {
      date: today,
      timestamp: now,
      session: usageData.currentSession?.percent || 0,
      weeklyAll: usageData.weeklyAllModels?.percent || 0,
      weeklySonnet: usageData.weeklySonnet?.percent || 0
    };

    // Trim old data (90 days)
    const cutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    for (const key of Object.keys(analytics.dailySnapshots)) {
      if (key < cutoff) delete analytics.dailySnapshots[key];
    }

    await this.saveAnalytics(analytics);
    return analytics;
  }

  async getAnalytics() {
    try {
      const result = await chrome.storage.local.get('usageAnalytics');
      return result.usageAnalytics || { dailySnapshots: {}, usageEvents: [], version: 1 };
    } catch (e) {
      return { dailySnapshots: {}, usageEvents: [], version: 1 };
    }
  }

  async saveAnalytics(analytics) {
    try {
      analytics.lastUpdated = Date.now();
      await chrome.storage.local.set({ usageAnalytics: analytics });
    } catch (e) {}
  }

  async getSummary(days = 30) {
    const analytics = await this.getAnalytics();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const snapshots = Object.values(analytics.dailySnapshots || {})
      .filter(s => s.date >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date));

    const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    return {
      period: `Last ${days} days`,
      days: snapshots.length,
      averageUsage: {
        session: avg(snapshots.map(s => s.session)),
        weeklyAll: avg(snapshots.map(s => s.weeklyAll))
      },
      snapshots
    };
  }

  async exportData() {
    const analytics = await this.getAnalytics();
    const summary = await this.getSummary(90);
    return { analytics, summary, exportedAt: new Date().toISOString() };
  }
}

// ============================================================================
// SERVICE WORKER MAIN CODE
// ============================================================================

// Global instances
let firebaseSync = null;
let hybridTracker = null;
let usageFetcher = null;
let usageAnalytics = null;

const DEFAULT_USAGE = {
  currentSession: { percent: 0, resetsIn: '--' },
  weeklyAllModels: { percent: 0, resetsAt: '--' },
  weeklySonnet: { percent: 0, resetsIn: '--' },
  currentModel: 'sonnet',
  lastSynced: null
};

const DEFAULT_SETTINGS = {
  badgeDisplay: 'session',
  showSidebar: true,
  showChatOverlay: true,
  enableVoice: false,
  firebaseUrl: ''
};

// ============================================================================
// Core Functions
// ============================================================================

async function getUsageData() {
  try {
    // First try hybrid tracker for most accurate data
    if (hybridTracker) {
      const estimated = hybridTracker.getCurrentUsage();
      if (estimated && estimated.baselineSource !== 'none') {
        return { ...estimated, source: 'hybrid' };
      }
    }

    // Fall back to stored data
    const result = await chrome.storage.local.get('usageData');
    return result.usageData || { ...DEFAULT_USAGE };
  } catch (e) {
    console.error('[CUP BG] Get usage error:', e);
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
    data.lastSynced = Date.now();
    await chrome.storage.local.set({ usageData: data });
    await updateBadge(data);

    if (!usageAnalytics) usageAnalytics = new UsageAnalytics();
    await usageAnalytics.processUsageUpdate(data);

    if (firebaseSync?.syncEnabled) {
      // Include hybrid tracker data in sync
      const syncData = hybridTracker ? {
        ...data,
        ...hybridTracker.exportForSync()
      } : data;
      await firebaseSync.syncToFirebase(syncData);
    }

    return data;
  } catch (e) {
    console.error('[CUP BG] Save error:', e);
    return data;
  }
}

async function initializeAll() {
  console.log('[CUP BG] Initializing all components...');

  // Initialize hybrid tracker
  hybridTracker = new HybridTracker();
  await hybridTracker.initialize();

  // Initialize usage fetcher
  usageFetcher = new UsageFetcher();
  await usageFetcher.initialize();

  // Initialize Firebase
  const settings = await getSettings();
  firebaseSync = new FirebaseSync();

  if (settings.firebaseUrl?.trim()) {
    const success = await firebaseSync.initialize(settings.firebaseUrl);
    if (success) {
      console.log('[CUP BG] Firebase enabled');
      
      // Try to get data from Firebase
      const merged = await firebaseSync.getMergedUsage();
      if (merged) {
        console.log('[CUP BG] Got Firebase data');
        
        // Merge into hybrid tracker
        if (merged.baseline) {
          await hybridTracker.mergeFromFirebase(merged);
        }
        
        // Also save to legacy storage
        await chrome.storage.local.set({ usageData: merged });
        notifyAllTabs(merged);
      }
    }
  }

  // Update badge
  const usageData = await getUsageData();
  await updateBadge(usageData);

  console.log('[CUP BG] Initialization complete');
}

async function updateBadge(usageData) {
  try {
    const settings = await getSettings();
    const display = settings.badgeDisplay || 'session';

    if (display === 'none') {
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    let percent = 0;
    switch (display) {
      case 'session': percent = usageData?.currentSession?.percent ?? 0; break;
      case 'weekly-all': percent = usageData?.weeklyAllModels?.percent ?? 0; break;
      case 'weekly-sonnet': percent = usageData?.weeklySonnet?.percent ?? 0; break;
    }

    const text = percent >= 100 ? '!' : percent + '%';
    chrome.action.setBadgeText({ text });

    let color = '#22c55e';
    if (percent >= 90) color = '#ef4444';
    else if (percent >= 70) color = '#f59e0b';
    chrome.action.setBadgeBackgroundColor({ color });
  } catch (e) {
    console.error('[CUP BG] Badge error:', e);
  }
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
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(message, sender) {
  const { type } = message;

  switch (type) {
    case 'GET_USAGE_DATA': {
      const usageData = await getUsageData();
      return { usageData };
    }

    case 'SYNC_SCRAPED_DATA': {
      console.log('[CUP BG] Received scraped data');
      const scraped = message.data;
      if (!scraped) return { usageData: await getUsageData() };

      // Set as new baseline in hybrid tracker
      if (hybridTracker) {
        await hybridTracker.setBaseline(scraped, scraped.source || 'scrape');
      }

      const usageData = {
        currentSession: scraped.currentSession || { percent: 0, resetsIn: '--' },
        weeklyAllModels: scraped.weeklyAllModels || { percent: 0, resetsAt: '--' },
        weeklySonnet: scraped.weeklySonnet || { percent: 0, resetsIn: '--' },
        currentModel: scraped.currentModel || 'sonnet',
        source: scraped.source,
        scrapedAt: scraped.scrapedAt,
        lastSynced: Date.now()
      };

      await saveUsageData(usageData);
      notifyAllTabs(usageData);
      return { usageData };
    }

    case 'TOKEN_DELTA': {
      // New message type for tracking token usage
      if (hybridTracker) {
        const { inputTokens, outputTokens } = message;
        await hybridTracker.addTokenDelta(inputTokens || 0, outputTokens || 0);
        const usageData = await getUsageData();
        await updateBadge(usageData);
        return { usageData };
      }
      return { usageData: await getUsageData() };
    }

    case 'UPDATE_MODEL': {
      const usageData = await getUsageData();
      usageData.currentModel = message.model || 'sonnet';
      await saveUsageData(usageData);
      notifyAllTabs(usageData);
      return { usageData };
    }

    case 'TRIGGER_SYNC': {
      try {
        const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*', active: true });
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRAPE_USAGE' }).catch(() => {});
        }
      } catch (e) {}
      return { success: true };
    }

    case 'GET_SETTINGS': {
      return { settings: await getSettings() };
    }

    case 'SAVE_SETTINGS': {
      const current = await getSettings();
      const updated = { ...current, ...message.settings };
      await chrome.storage.local.set({ settings: updated });

      if (updated.firebaseUrl !== current.firebaseUrl) {
        console.log('[CUP BG] Firebase URL changed');
        if (firebaseSync) firebaseSync.disable();
        firebaseSync = new FirebaseSync();
        if (updated.firebaseUrl?.trim()) {
          await firebaseSync.initialize(updated.firebaseUrl);
        }
      }

      const usageData = await getUsageData();
      await updateBadge(usageData);

      chrome.tabs.query({ url: 'https://claude.ai/*' }).then(tabs => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings: updated }).catch(() => {});
        }
      }).catch(() => {});

      return { success: true };
    }

    case 'SYNC_FROM_FIREBASE': {
      if (!firebaseSync?.syncEnabled) {
        return { success: false, error: 'Firebase not enabled' };
      }

      try {
        const merged = await firebaseSync.getMergedUsage();
        if (merged) {
          if (merged.baseline && hybridTracker) {
            await hybridTracker.mergeFromFirebase(merged);
          }
          await chrome.storage.local.set({ usageData: merged });
          await updateBadge(merged);
          notifyAllTabs(merged);
          return { success: true, usageData: merged };
        }
        return { success: false, error: 'No data found' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case 'GET_FIREBASE_STATUS': {
      if (!firebaseSync) return { enabled: false };
      return firebaseSync.getStatus();
    }

    case 'GET_HYBRID_STATUS': {
      if (!hybridTracker) return { initialized: false };
      return {
        initialized: true,
        hasBaseline: !!hybridTracker.baseline,
        baselineSource: hybridTracker.baseline?.source || 'none',
        baselineAge: hybridTracker.baseline ? Date.now() - hybridTracker.baseline.timestamp : null,
        isStale: hybridTracker.isBaselineStale(),
        deltaTokens: hybridTracker.delta.inputTokens + hybridTracker.delta.outputTokens
      };
    }

    case 'RESET_USAGE': {
      if (hybridTracker) await hybridTracker.reset();
      const freshData = { ...DEFAULT_USAGE, lastSynced: Date.now() };
      await saveUsageData(freshData);
      notifyAllTabs(freshData);
      return { usageData: freshData };
    }

    case 'GET_ANALYTICS_SUMMARY': {
      if (!usageAnalytics) usageAnalytics = new UsageAnalytics();
      const summary = await usageAnalytics.getSummary(message.days || 30);
      return { summary };
    }

    case 'EXPORT_ANALYTICS': {
      if (!usageAnalytics) usageAnalytics = new UsageAnalytics();
      const data = await usageAnalytics.exportData();
      return { data };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ============================================================================
// Lifecycle Events
// ============================================================================

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[CUP BG] Extension installed/updated');

  const existing = await chrome.storage.local.get(['usageData', 'settings']);
  if (!existing.usageData) {
    await chrome.storage.local.set({ usageData: { ...DEFAULT_USAGE } });
  }
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS } });
  }

  await initializeAll();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[CUP BG] Browser started');
  await initializeAll();
});

// ============================================================================
// Periodic Sync Alarm
// ============================================================================

chrome.alarms.create('syncUsage', { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncUsage') {
    // Check if baseline is stale and try to refresh
    if (hybridTracker?.isBaselineStale(300000)) { // 5 minutes
      console.log('[CUP BG] Baseline is stale, requesting refresh');
      
      // Ask a Claude tab to scrape/fetch fresh data
      try {
        const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRAPE_USAGE' }).catch(() => {});
        }
      } catch (e) {}
    }

    // Sync with Firebase
    if (firebaseSync?.syncEnabled) {
      try {
        const merged = await firebaseSync.getMergedUsage();
        if (merged) {
          const current = await getUsageData();
          if (!current.lastSynced || merged.syncedAt > current.lastSynced) {
            if (merged.baseline && hybridTracker) {
              await hybridTracker.mergeFromFirebase(merged);
            }
            await chrome.storage.local.set({ usageData: merged });
            await updateBadge(merged);
            notifyAllTabs(merged);
          }
        }
      } catch (e) {
        console.error('[CUP BG] Periodic sync error:', e);
      }
    }
  }
});

// ============================================================================
// WebRequest Listener - Track API calls
// ============================================================================

// Listen for completion requests to track token usage
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.url.includes('/completion') || details.url.includes('/chat')) {
      // A message was sent - content script will report tokens
      console.log('[CUP BG] Detected completion request');
    }
  },
  { urls: ['https://claude.ai/api/*'] }
);

// ============================================================================
// Initialize on Load
// ============================================================================

console.log('[CUP BG] Service worker loaded v1.9.0');

(async () => {
  await initializeAll();
})();
