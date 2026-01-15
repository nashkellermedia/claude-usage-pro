/**
 * Claude Usage Pro - Firebase Realtime Database Sync
 * Simple REST API approach - no SDK needed
 */

class FirebaseSync {
  constructor() {
    this.firebaseUrl = null;
    this.deviceId = this.getOrCreateDeviceId();
    this.syncEnabled = false;
    this.lastSync = null;
    this.syncInterval = null;
  }
  
  /**
   * Initialize with Firebase URL from settings
   */
  async initialize(firebaseUrl) {
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
      const response = await fetch(`${this.firebaseUrl}/test.json`);
      return response.ok;
    } catch (e) {
      console.error('[Firebase] Connection error:', e.message);
      return false;
    }
  }
  
  /**
   * Get or create unique device ID
   */
  getOrCreateDeviceId() {
    let deviceId = localStorage.getItem('cup_device_id');
    if (!deviceId) {
      deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('cup_device_id', deviceId);
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
        deviceName: this.getDeviceName(),
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
  getDeviceName() {
    // Try to get Chrome profile name or generate one
    const ua = navigator.userAgent;
    let os = 'Unknown';
    
    if (ua.includes('Mac')) os = 'Mac';
    else if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Linux')) os = 'Linux';
    
    const browser = 'Chrome';
    const profile = this.getProfileName();
    
    return `${os} - ${browser}${profile ? ' - ' + profile : ''}`;
  }
  
  /**
   * Try to get Chrome profile name
   */
  getProfileName() {
    // Chrome profile name is hard to get from extension
    // Use a stored name if user sets one, otherwise use device ID
    const savedName = localStorage.getItem('cup_profile_name');
    if (savedName) return savedName;
    
    // Default to shortened device ID
    return this.deviceId.substring(7, 15);
  }
  
  /**
   * Set custom profile name
   */
  setProfileName(name) {
    localStorage.setItem('cup_profile_name', name);
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

console.log('[CUP] Firebase Realtime Database Sync loaded');
