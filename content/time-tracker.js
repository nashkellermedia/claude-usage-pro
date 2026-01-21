/**
 * Claude Usage Pro - Time Tracker
 * Tracks actual time spent on Claude
 */

class TimeTracker {
  constructor() {
    this.sessionStart = Date.now();
    this.sessionTime = 0; // ms
    this.isActive = true;
    this.lastTick = Date.now();
    this.tickInterval = null;
  }
  
  initialize() {
    window.CUP.log('TimeTracker: Initializing...');
    
    // Track tab focus/blur
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
      } else {
        this.resume();
      }
    });
    
    window.addEventListener('focus', () => this.resume());
    window.addEventListener('blur', () => this.pause());
    
    // Start ticking
    this.startTicking();
    
    // Load existing time data
    this.loadTimeData();
    
    window.CUP.log('TimeTracker: Initialized');
  }
  
  startTicking() {
    // Tick every second when active
    this.tickInterval = setInterval(() => {
      if (this.isActive) {
        const now = Date.now();
        const elapsed = now - this.lastTick;
        this.sessionTime += elapsed;
        this.lastTick = now;
        
        // Save and broadcast every 10 seconds
        if (Math.floor(this.sessionTime / 1000) % 10 === 0) {
          this.saveTimeData();
          this.broadcastTime();
        }
      }
    }, 1000);
  }
  
  pause() {
    if (this.isActive) {
      this.isActive = false;
      window.CUP.log('TimeTracker: Paused');
    }
  }
  
  resume() {
    if (!this.isActive) {
      this.isActive = true;
      this.lastTick = Date.now();
      window.CUP.log('TimeTracker: Resumed');
    }
  }
  
  async loadTimeData() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TIME_DATA' });
      if (response?.timeData) {
        window.CUP.log('TimeTracker: Loaded time data', response.timeData);
      }
    } catch (e) {
      window.CUP.logError('TimeTracker: Load error', e);
    }
  }
  
  async saveTimeData() {
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_TIME_DATA',
        sessionTime: this.sessionTime
      });
    } catch (e) {
      // Ignore - might fail during page transition
    }
  }
  
  broadcastTime() {
    try {
      chrome.runtime.sendMessage({
        type: 'TIME_UPDATE',
        sessionTime: this.sessionTime
      }).catch(() => {});
    } catch (e) {
      // Ignore
    }
  }
  
  getSessionTime() {
    return this.sessionTime;
  }
  
  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

window.TimeTracker = TimeTracker;
window.CUP.log('TimeTracker loaded');
