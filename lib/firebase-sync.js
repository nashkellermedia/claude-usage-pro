/**
 * Claude Usage Pro - Firebase Sync
 * 
 * Syncs usage data across devices using Firebase Realtime Database
 */

class FirebaseSync {
  constructor() {
    this.db = null;
    this.userId = null;
    this.isInitialized = false;
    this.listeners = [];
    
    // Default Firebase config (users can override)
    this.config = null;
  }
  
  /**
   * Initialize Firebase with config
   */
  async initialize(config) {
    if (!config || !config.apiKey) {
      console.log('[CUP Firebase] No config provided, sync disabled');
      return false;
    }
    
    try {
      // Dynamically load Firebase
      if (!window.firebase) {
        await this.loadFirebaseSDK();
      }
      
      // Initialize app if not already done
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      
      this.db = firebase.database();
      this.config = config;
      this.isInitialized = true;
      
      console.log('[CUP Firebase] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[CUP Firebase] Init error:', error);
      return false;
    }
  }
  
  /**
   * Load Firebase SDK dynamically
   */
  async loadFirebaseSDK() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js';
      script.onload = () => {
        const dbScript = document.createElement('script');
        dbScript.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js';
        dbScript.onload = resolve;
        dbScript.onerror = reject;
        document.head.appendChild(dbScript);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  
  /**
   * Set user ID for sync
   */
  setUserId(userId) {
    this.userId = userId;
  }
  
  /**
   * Generate anonymous user ID
   */
  generateUserId() {
    const stored = localStorage.getItem('cup_user_id');
    if (stored) return stored;
    
    const id = 'cup_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('cup_user_id', id);
    return id;
  }
  
  /**
   * Push usage data to Firebase
   */
  async pushUsageData(usageData) {
    if (!this.isInitialized || !this.db) {
      return false;
    }
    
    const userId = this.userId || this.generateUserId();
    
    try {
      await this.db.ref(`users/${userId}/usage`).set({
        ...usageData,
        lastUpdated: firebase.database.ServerValue.TIMESTAMP,
        deviceId: this.getDeviceId()
      });
      
      console.log('[CUP Firebase] Pushed usage data');
      return true;
    } catch (error) {
      console.error('[CUP Firebase] Push error:', error);
      return false;
    }
  }
  
  /**
   * Pull usage data from Firebase
   */
  async pullUsageData() {
    if (!this.isInitialized || !this.db) {
      return null;
    }
    
    const userId = this.userId || this.generateUserId();
    
    try {
      const snapshot = await this.db.ref(`users/${userId}/usage`).once('value');
      const data = snapshot.val();
      
      if (data) {
        console.log('[CUP Firebase] Pulled usage data');
        return data;
      }
    } catch (error) {
      console.error('[CUP Firebase] Pull error:', error);
    }
    
    return null;
  }
  
  /**
   * Listen for realtime updates
   */
  onUsageUpdate(callback) {
    if (!this.isInitialized || !this.db) {
      return null;
    }
    
    const userId = this.userId || this.generateUserId();
    
    const ref = this.db.ref(`users/${userId}/usage`);
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data && callback) {
        callback(data);
      }
    });
    
    this.listeners.push({ ref, callback });
    return ref;
  }
  
  /**
   * Get device identifier
   */
  getDeviceId() {
    let deviceId = localStorage.getItem('cup_device_id');
    if (!deviceId) {
      deviceId = 'device_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('cup_device_id', deviceId);
    }
    return deviceId;
  }
  
  /**
   * Cleanup listeners
   */
  cleanup() {
    for (const { ref } of this.listeners) {
      ref.off();
    }
    this.listeners = [];
  }
}

window.FirebaseSync = FirebaseSync;
console.log('[CUP] FirebaseSync class loaded');
