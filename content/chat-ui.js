/**
 * Claude Usage Pro - Chat UI
 * Stats bar below chat input (matching Claude's native style)
 */

class ChatUI {
  constructor() {
    this.inputStats = null;
    this.initialized = false;
    this.lastDraftLength = 0;
    this.typingInterval = null;
    this.currentUsageData = null;
  }
  
  initialize() {
    window.CUP.log('ChatUI: Initializing...');
    this.initialized = true;
  }
  
  async injectUI() {
    await this.injectInputStats();
    this.startDraftMonitor();
  }
  
  async injectInputStats() {
    // Wait for the native Claude stats bar to appear
    // We want to integrate with it or place ours similarly
    
    for (let i = 0; i < 20; i++) {
      // Look for Claude's native bottom bar area
      const nativeBar = document.querySelector('[class*="text-text-500"]');
      const composer = document.querySelector('[contenteditable="true"]');
      
      if (composer && !document.getElementById('cup-input-stats')) {
        // Find the container that holds the draft info
        // Claude shows: "Draft: X tokens" and timer on the right
        
        // Look for the area below the composer
        const composerParent = composer.closest('form') || composer.closest('[class*="flex"]');
        
        if (composerParent) {
          // Create our stats bar
          this.inputStats = document.createElement('div');
          this.inputStats.id = 'cup-input-stats';
          this.inputStats.innerHTML = `
            <span class="cup-stat-item">
              <span class="cup-stat-icon">✏️</span>
              <span class="cup-stat-label">Draft:</span>
              <span class="cup-stat-value" id="cup-draft-tokens">0</span>
              <span class="cup-stat-unit">tokens</span>
            </span>
            <span class="cup-stat-divider">│</span>
            <span class="cup-stat-item">
              <span class="cup-stat-label">Session:</span>
              <span class="cup-stat-value" id="cup-session-pct">--%</span>
            </span>
            <span class="cup-stat-divider">│</span>
            <span class="cup-stat-item">
              <span class="cup-stat-label">Weekly:</span>
              <span class="cup-stat-value" id="cup-weekly-all-pct">--%</span>
            </span>
            <span class="cup-stat-divider">│</span>
            <span class="cup-stat-item">
              <span class="cup-stat-label">Sonnet:</span>
              <span class="cup-stat-value" id="cup-weekly-sonnet-pct">--%</span>
            </span>
            <span class="cup-stat-divider">│</span>
            <span class="cup-stat-item">
              <span class="cup-stat-icon">⏱️</span>
              <span class="cup-stat-value" id="cup-reset-timer">--</span>
            </span>
          `;
          
          // Try to find the right place to insert
          // Look for where Claude puts its native stats
          const formArea = composer.closest('form');
          if (formArea && formArea.parentElement) {
            formArea.parentElement.appendChild(this.inputStats);
            window.CUP.log('ChatUI: Input stats injected after form');
            return;
          }
        }
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
    
    window.CUP.log('ChatUI: Could not find injection point for input stats');
  }
  
  startDraftMonitor() {
    if (this.typingInterval) clearInterval(this.typingInterval);
    
    this.typingInterval = setInterval(() => {
      const input = document.querySelector('[contenteditable="true"]') ||
                   document.querySelector('textarea');
      
      if (input) {
        const text = input.innerText || input.value || '';
        const tokens = Math.ceil(text.length / 4);
        
        if (tokens !== this.lastDraftLength) {
          this.lastDraftLength = tokens;
          this.updateElement('cup-draft-tokens', tokens.toLocaleString());
        }
      }
    }, 300);
  }
  
  updateUsage(usageData) {
    if (!usageData) return;
    this.currentUsageData = usageData;
    
    // Update session percentage
    if (usageData.currentSession) {
      const pct = usageData.currentSession.percent || 0;
      this.updateElement('cup-session-pct', pct + '%');
      this.colorizeElement('cup-session-pct', pct);
      
      if (usageData.currentSession.resetsIn) {
        this.updateElement('cup-reset-timer', usageData.currentSession.resetsIn);
      }
    }
    
    // Update weekly all models
    if (usageData.weeklyAllModels) {
      const pct = usageData.weeklyAllModels.percent || 0;
      this.updateElement('cup-weekly-all-pct', pct + '%');
      this.colorizeElement('cup-weekly-all-pct', pct);
    }
    
    // Update weekly sonnet
    if (usageData.weeklySonnet) {
      const pct = usageData.weeklySonnet.percent || 0;
      this.updateElement('cup-weekly-sonnet-pct', pct + '%');
      this.colorizeElement('cup-weekly-sonnet-pct', pct);
    }
  }
  
  updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  
  colorizeElement(id, percent) {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (percent >= 90) {
      el.style.color = '#ef4444'; // red
    } else if (percent >= 70) {
      el.style.color = '#f59e0b'; // yellow
    } else {
      el.style.color = '#22c55e'; // green
    }
  }
  
  checkAndReinject() {
    if (!document.getElementById('cup-input-stats')) {
      this.injectInputStats();
      if (this.currentUsageData) {
        this.updateUsage(this.currentUsageData);
      }
    }
  }
}

window.ChatUI = ChatUI;
window.CUP.log('ChatUI loaded');
