/**
 * Claude Usage Pro - Firebase Sync
 * Cross-browser/device synchronization
 */

class FirebaseSync {
  constructor(config) {
    this.config = config;
    this.db = null;
    this.auth = null;
    this.userId = null;
    this.initialized = false;
    this.syncEnabled = false;
  }
  
  /**
   * Initialize Firebase
   */
  async initialize() {
    if (this.initialized) return true;
    
    try {
      // Check if config exists
      if (!this.config || !this.config.apiKey) {
        console.log('[CUP Firebase] No config provided, sync disabled');
        return false;
      }
      
      // Load Firebase SDK dynamically
      await this.loadFirebaseSDK();
      
      // Initialize Firebase
      const app = firebase.initializeApp(this.config);
      this.db = firebase.firestore();
      this.auth = firebase.auth();
      
      // Sign in anonymously for cross-device sync
      await this.signIn();
      
      this.initialized = true;
      this.syncEnabled = true;
      console.log('[CUP Firebase] Initialized successfully');
      return true;
      
    } catch (e) {
      console.error('[CUP Firebase] Init failed:', e.message);
      return false;
    }
  }
  
  /**
   * Load Firebase SDK
   */
  async loadFirebaseSDK() {
    if (window.firebase) return;
    
    const scripts = [
      'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js',
      'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js'
    ];
    
    for (const src of scripts) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
  }
  
  /**
   * Sign in (anonymous or with custom token)
   */
  async signIn() {
    try {
      // Try to get existing user
      if (this.auth.currentUser) {
        this.userId = this.auth.currentUser.uid;
        return;
      }
      
      // Sign in anonymously
      const result = await this.auth.signInAnonymously();
      this.userId = result.user.uid;
      console.log('[CUP Firebase] Signed in:', this.userId);
      
    } catch (e) {
      console.error('[CUP Firebase] Sign in failed:', e.message);
      throw e;
    }
  }
  
  /**
   * Sync usage data to Firebase
   */
  async syncUsage(usageData) {
    if (!this.syncEnabled || !this.db || !this.userId) {
      return false;
    }
    
    try {
      const docRef = this.db.collection('usage').doc(this.userId);
      
      await docRef.set({
        ...usageData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        deviceId: this.getDeviceId()
      }, { merge: true });
      
      console.log('[CUP Firebase] Synced usage data');
      return true;
      
    } catch (e) {
      console.error('[CUP Firebase] Sync failed:', e.message);
      return false;
    }
  }
  
  /**
   * Get usage data from Firebase
   */
  async getUsage() {
    if (!this.syncEnabled || !this.db || !this.userId) {
      return null;
    }
    
    try {
      const docRef = this.db.collection('usage').doc(this.userId);
      const doc = await docRef.get();
      
      if (doc.exists) {
        return doc.data();
      }
      return null;
      
    } catch (e) {
      console.error('[CUP Firebase] Get failed:', e.message);
      return null;
    }
  }
  
  /**
   * Listen for real-time updates
   */
  onUsageUpdate(callback) {
    if (!this.syncEnabled || !this.db || !this.userId) {
      return () => {};
    }
    
    const docRef = this.db.collection('usage').doc(this.userId);
    
    return docRef.onSnapshot((doc) => {
      if (doc.exists) {
        const data = doc.data();
        // Only update if from different device
        if (data.deviceId !== this.getDeviceId()) {
          callback(data);
        }
      }
    });
  }
  
  /**
   * Get unique device ID
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
   * Link with custom auth (for logged in users)
   */
  async linkAccount(customToken) {
    if (!this.auth) return false;
    
    try {
      await this.auth.signInWithCustomToken(customToken);
      this.userId = this.auth.currentUser.uid;
      return true;
    } catch (e) {
      console.error('[CUP Firebase] Link failed:', e.message);
      return false;
    }
  }
}

// Export for use
window.FirebaseSync = FirebaseSync;
console.log('[CUP] FirebaseSync loaded');
