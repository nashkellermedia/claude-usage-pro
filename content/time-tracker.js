/**
 * Claude Usage Pro - Time Tracker
 * Tracks actual time spent on Claude
 * Pauses on: tab blur, visibility hidden, or 2 min idle
 */

class TimeTracker {
  constructor() {
    this.sessionStart = Date.now();
    this.sessionTime = 0; // ms
    this.isActive = true;
    this.lastTick = Date.now();
    this.lastActivity = Date.now();
    this.tickInterval = null;
    this.idleTimeout = 2 * 60 * 1000; // 2 minutes idle = pause
    this.isIdle = false;
  }
  
  initialize() {
    window.CUP.log('TimeTracker: Initializing...');
    
    // Track tab focus/blur
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause('visibility');
      } else {
        this.resume('visibility');
      }
    });
    
    window.addEventListener('focus', () => this.resume('focus'));
    window.addEventListener('blur', () => this.pause('blur'));
    
    // Track user activity for idle detection
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach(event => {
      document.addEventListener(event, () => this.onActivity(), { passive: true });
    });
    
    // Start ticking
    this.startTicking();
    
    // Load existing time data
    this.loadTimeData();
    
    window.CUP.log('TimeTracker: Initialized with 2min idle timeout');
  }
  
  onActivity() {
    this.lastActivity = Date.now();
    
    // Resume if we were idle
    if (this.isIdle && !document.hidden) {
      this.isIdle = false;
      this.resume('activity');
    }
  }
  
  startTicking() {
    // Tick every second when active
    this.tickInterval = setInterval(() => {
      // Check for idle
      const timeSinceActivity = Date.now() - this.lastActivity;
      if (timeSinceActivity > this.idleTimeout && !this.isIdle) {
        this.isIdle = true;
        this.pause('idle');
        return;
      }
      
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
  
  pause(reason = '') {
    if (this.isActive) {
      this.isActive = false;
      window.CUP.log('TimeTracker: Paused (' + reason + ')');
    }
  }
  
  resume(reason = '') {
    if (!this.isActive && !document.hidden && !this.isIdle) {
      this.isActive = true;
      this.lastTick = Date.now();
      window.CUP.log('TimeTracker: Resumed (' + reason + ')');
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
