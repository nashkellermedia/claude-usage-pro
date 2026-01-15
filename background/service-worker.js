/**
 * Claude Usage Pro - Background Service Worker with Firebase Sync
 */

// === FIREBASE SYNC (INLINED) ===
/**
 * Claude Usage Pro - Firebase Realtime Database Sync
 * Simple REST API approach - no SDK needed
 */

class FirebaseSync {
  constructor() {
    this.firebaseUrl = null;
    this.deviceId = null;
    this.syncEnabled = false;
    this.lastSync = null;
    this.syncInterval = null;
    this.initialized = false;
  }
  
  /**
   * Initialize with Firebase URL from settings
   */
  async initialize(firebaseUrl) {
    // Get or create device ID first
    if (!this.deviceId) {
      this.deviceId = await this.getOrCreateDeviceId();
    }
    
    if (!firebaseUrl || firebaseUrl.trim() === '') {
      console.log('[Firebase] No URL provided, sync disabled');
      this.syncEnabled = false;
      this.stopAutoSync();
      return false;
    }
    
    // Clean up URL - remove trailing slash, ensure it's the database URL
    this.firebaseUrl = firebaseUrl.trim().replace(/\/$/, '');
    
    // Validate it looks like a Firebase URL
    if (!this.firebaseUrl.includes('firebaseio.com') && 
        !this.firebaseUrl.includes('firebasedatabase.app')) {
      console.error('[Firebase] Invalid Firebase URL format');
      return false;
    }
    
    // Test connection
    const connected = await this.testConnection();
    if (connected) {
      this.syncEnabled = true;
      this.startAutoSync();
      console.log('[Firebase] Initialized successfully');
      return true;
    }
    
    console.error('[Firebase] Connection test failed');
    return false;
  }
  
  /**
   * Test Firebase connection
   */
  async testConnection() {
    try {
      // Test by reading from /usage path (which is allowed by our rules)
      const response = await fetch(`${this.firebaseUrl}/usage.json`);
      // Any response (even empty) means connection works
      return response.ok || response.status === 200;
    } catch (e) {
      console.error('[Firebase] Connection error:', e.message);
      return false;
    }
  }
  
  /**
   * Get or create unique device ID
   */
  async getOrCreateDeviceId() {
    const result = await chrome.storage.local.get('cup_device_id');
    let deviceId = result.cup_device_id;
    if (!deviceId) {
      deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      await chrome.storage.local.set({ cup_device_id: deviceId });
    }
    return deviceId;
  }
  
  /**
   * Sync usage data TO Firebase
   */
  async syncToFirebase(usageData) {
    if (!this.syncEnabled || !this.firebaseUrl) {
      return { success: false, error: 'Sync not enabled' };
    }
    
    try {
      const syncData = {
        ...usageData,
        deviceId: this.deviceId,
        deviceName: await this.getDeviceName(),
        syncedAt: Date.now(),
        timestamp: new Date().toISOString()
      };
      
      // Write to Firebase: /usage/{deviceId}
      const url = `${this.firebaseUrl}/usage/${this.deviceId}.json`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncData)
      });
      
      if (response.ok) {
        this.lastSync = Date.now();
        console.log('[Firebase] Synced to cloud');
        return { success: true };
      }
      
      return { success: false, error: 'Upload failed' };
      
    } catch (e) {
      console.error('[Firebase] Sync error:', e.message);
      return { success: false, error: e.message };
    }
  }
  
  /**
   * Get usage data FROM Firebase (all devices)
   */
  async syncFromFirebase() {
    if (!this.syncEnabled || !this.firebaseUrl) {
      return { success: false, error: 'Sync not enabled' };
    }
    
    try {
      const url = `${this.firebaseUrl}/usage.json`;
      const response = await fetch(url);
      
      if (!response.ok) {
        return { success: false, error: 'Download failed' };
      }
      
      const data = await response.json();
      
      if (!data) {
        return { success: true, devices: [] };
      }
      
      // Convert object to array of devices
      const devices = Object.entries(data).map(([deviceId, deviceData]) => ({
        deviceId,
        ...deviceData
      }));
      
      // Sort by most recent first
      devices.sort((a, b) => (b.syncedAt || 0) - (a.syncedAt || 0));
      
      console.log(`[Firebase] Retrieved data from ${devices.length} device(s)`);
      return { success: true, devices };
      
    } catch (e) {
      console.error('[Firebase] Download error:', e.message);
      return { success: false, error: e.message };
    }
  }
  
  /**
   * Get merged usage data (combine all devices)
   */
  async getMergedUsage() {
    const result = await this.syncFromFirebase();
    
    if (!result.success || !result.devices || result.devices.length === 0) {
      return null;
    }
    
    // Use the most recent data
    const mostRecent = result.devices[0];
    
    // Could add logic here to merge/aggregate across devices
    // For now, just return most recent
    return {
      currentSession: mostRecent.currentSession,
      weeklyAllModels: mostRecent.weeklyAllModels,
      weeklySonnet: mostRecent.weeklySonnet,
      lastUpdated: mostRecent.timestamp,
      deviceCount: result.devices.length,
      devices: result.devices.map(d => ({
        id: d.deviceId,
        name: d.deviceName,
        lastSync: d.timestamp
      }))
    };
  }
  
  /**
   * Start auto-sync every 30 seconds
   */
  startAutoSync() {
    this.stopAutoSync(); // Clear any existing
    
    this.syncInterval = setInterval(async () => {
      // Get current usage data from storage
      const result = await chrome.storage.local.get(['usageData']);
      if (result.usageData) {
        await this.syncToFirebase(result.usageData);
      }
    }, 30000); // 30 seconds
    
    console.log('[Firebase] Auto-sync started (every 30s)');
  }
  
  /**
   * Stop auto-sync
   */
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[Firebase] Auto-sync stopped');
    }
  }
  
  /**
   * Get device name for identification
   */
  async getDeviceName() {
    // Try to get Chrome profile name or generate one
    const ua = self.navigator?.userAgent || 'Unknown';
    let os = 'Unknown';
    
    if (ua.includes('Mac')) os = 'Mac';
    else if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Linux')) os = 'Linux';
    
    const browser = 'Chrome';
    const profile = await this.getProfileName();
    
    return `${os} - ${browser}${profile ? ' - ' + profile : ''}`;
  }
  
  /**
   * Try to get Chrome profile name
   */
  async getProfileName() {
    // Chrome profile name is hard to get from extension
    // Use a stored name if user sets one, otherwise use device ID
    const result = await chrome.storage.local.get('cup_profile_name');
    const savedName = result.cup_profile_name;
    if (savedName) return savedName;
    
    // Default to shortened device ID
    return this.deviceId.substring(7, 15);
  }
  
  /**
   * Set custom profile name
   */
  async setProfileName(name) {
    await chrome.storage.local.set({ cup_profile_name: name });
  }
  
  /**
   * Get sync status
   */
  getStatus() {
    return {
      enabled: this.syncEnabled,
      firebaseUrl: this.firebaseUrl,
      deviceId: this.deviceId,
      deviceName: this.getDeviceName(),
      lastSync: this.lastSync,
      lastSyncTime: this.lastSync ? new Date(this.lastSync).toLocaleString() : 'Never'
    };
  }
  
  /**
   * Disable sync
   */
  disable() {
    this.syncEnabled = false;
    this.firebaseUrl = null;
    this.stopAutoSync();
    console.log('[Firebase] Sync disabled');
  }
}

// Create singleton instance
if (typeof window !== 'undefined') {
  window.FirebaseSync = FirebaseSync;
}

// For service worker
if (typeof self !== 'undefined' && self.FirebaseSync === undefined) {
  self.FirebaseSync = FirebaseSync;
}





// === USAGE ANALYTICS (INLINED) ===
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




// === SERVICE WORKER CODE ===


// Initialize Firebase sync instance
let firebaseSync = null;

// Initialize Usage Analytics instance
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

async function getUsageData() {
  try {
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
    
    // Process analytics
    if (!usageAnalytics) {
      usageAnalytics = new self.UsageAnalytics();
    }
    await usageAnalytics.processUsageUpdate(data);
    
    // Sync to Firebase if enabled
    if (firebaseSync && firebaseSync.syncEnabled) {
      await firebaseSync.syncToFirebase(data);
    }
    
    return data;
  } catch (e) {
    console.error('[CUP BG] Save error:', e);
    return data;
  }
}

async function initializeFirebaseSync() {
  try {
    const settings = await getSettings();
    
    if (!firebaseSync) {
      firebaseSync = new self.FirebaseSync();
    }
    
    if (settings.firebaseUrl && settings.firebaseUrl.trim() !== '') {
      console.log('[CUP BG] Initializing Firebase sync...');
      const success = await firebaseSync.initialize(settings.firebaseUrl);
      
      if (success) {
        console.log('[CUP BG] Firebase sync enabled');
        // Try to get data from Firebase
        const mergedData = await firebaseSync.getMergedUsage();
        if (mergedData) {
          console.log('[CUP BG] Retrieved data from Firebase');
          // Update local storage with Firebase data
          await chrome.storage.local.set({ usageData: mergedData });
          await updateBadge(mergedData);
          notifyAllTabs(mergedData);
        }
      } else {
        console.log('[CUP BG] Firebase sync initialization failed');
      }
    } else {
      console.log('[CUP BG] No Firebase URL configured');
      if (firebaseSync) {
        firebaseSync.disable();
      }
    }
  } catch (e) {
    console.error('[CUP BG] Firebase init error:', e);
  }
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
      case 'session':
        percent = usageData?.currentSession?.percent ?? 0;
        break;
      case 'weekly-all':
        percent = usageData?.weeklyAllModels?.percent ?? 0;
        break;
      case 'weekly-sonnet':
        percent = usageData?.weeklySonnet?.percent ?? 0;
        break;
    }
    
    const text = percent >= 100 ? '!' : percent + '%';
    chrome.action.setBadgeText({ text });
    
    let color = '#22c55e'; // green
    if (percent >= 90) color = '#ef4444'; // red
    else if (percent >= 70) color = '#f59e0b'; // yellow
    
    chrome.action.setBadgeBackgroundColor({ color });
    
  } catch (e) {
    console.error('[CUP BG] Badge update error:', e);
  }
}

function notifyAllTabs(usageData) {
  chrome.tabs.query({ url: 'https://claude.ai/*' }).then(tabs => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'USAGE_UPDATED', usageData }).catch(() => {});
    }
  }).catch(() => {});
}

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
      if (!scraped) {
        return { usageData: await getUsageData() };
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
      const settings = await getSettings();
      return { settings };
    }
    
    case 'SAVE_SETTINGS': {
      const current = await getSettings();
      const updated = { ...current, ...message.settings };
      await chrome.storage.local.set({ settings: updated });
      
      // If Firebase URL changed, reinitialize
      if (updated.firebaseUrl !== current.firebaseUrl) {
        console.log('[CUP BG] Firebase URL changed, reinitializing...');
        await initializeFirebaseSync();
      }
      
      // Update badge if display setting changed
      const usageData = await getUsageData();
      await updateBadge(usageData);
      
      // Notify tabs of settings change
      chrome.tabs.query({ url: 'https://claude.ai/*' }).then(tabs => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings: updated }).catch(() => {});
        }
      }).catch(() => {});
      
      return { success: true };
    }
    
    case 'SYNC_FROM_FIREBASE': {
      if (!firebaseSync || !firebaseSync.syncEnabled) {
        return { success: false, error: 'Firebase not enabled' };
      }
      
      try {
        const mergedData = await firebaseSync.getMergedUsage();
        if (mergedData) {
          await chrome.storage.local.set({ usageData: mergedData });
          await updateBadge(mergedData);
          notifyAllTabs(mergedData);
          return { success: true, usageData: mergedData };
        }
        return { success: false, error: 'No data found' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    
    case 'GET_FIREBASE_STATUS': {
      if (!firebaseSync) {
        return { enabled: false };
      }
      return firebaseSync.getStatus();
    }
    
    case 'RESET_USAGE': {
      const freshData = { ...DEFAULT_USAGE, lastSynced: Date.now() };
      await saveUsageData(freshData);
      notifyAllTabs(freshData);
      return { usageData: freshData };
    }
    
    case 'GET_ANALYTICS_SUMMARY': {
      if (!usageAnalytics) {
        usageAnalytics = new self.UsageAnalytics();
      }
      const days = message.days || 30;
      const summary = await usageAnalytics.getSummary(days);
      return { summary };
    }
    
    case 'EXPORT_ANALYTICS': {
      if (!usageAnalytics) {
        usageAnalytics = new self.UsageAnalytics();
      }
      const exportData = await usageAnalytics.exportData();
      return { data: exportData };
    }
    
    default:
      return { error: 'Unknown message type' };
  }
}

// On install/update
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[CUP BG] Extension installed/updated');
  
  const existing = await chrome.storage.local.get(['usageData', 'settings']);
  if (!existing.usageData) {
    await chrome.storage.local.set({ usageData: { ...DEFAULT_USAGE } });
  }
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS } });
  }
  
  // Initialize Firebase sync
  await initializeFirebaseSync();
  
  // Update badge
  const usageData = await getUsageData();
  await updateBadge(usageData);
});

// On startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[CUP BG] Browser started');
  
  // Initialize Firebase sync
  await initializeFirebaseSync();
  
  const usageData = await getUsageData();
  await updateBadge(usageData);
});

// Periodic sync - check Firebase every 2 minutes
chrome.alarms.create('syncUsage', { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncUsage') {
    // Try to sync from Firebase
    if (firebaseSync && firebaseSync.syncEnabled) {
      try {
        const mergedData = await firebaseSync.getMergedUsage();
        if (mergedData) {
          const current = await getUsageData();
          // Only update if Firebase data is newer
          if (!current.lastSynced || mergedData.syncedAt > current.lastSynced) {
            await chrome.storage.local.set({ usageData: mergedData });
            await updateBadge(mergedData);
            notifyAllTabs(mergedData);
          }
        }
      } catch (e) {
        console.error('[CUP BG] Periodic sync error:', e);
      }
    }
    
    // Also trigger a scrape if on claude.ai
    try {
      const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRAPE_USAGE' }).catch(() => {});
      }
    } catch (e) {}
  }
});

console.log('[CUP BG] Service worker loaded');

// Initialize on load
(async () => {
  await initializeFirebaseSync();
  const usageData = await getUsageData();
  await updateBadge(usageData);
})();
