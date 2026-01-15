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
    if (document.getElementById('cup-input-stats')) {
      window.CUP.log('ChatUI: Input stats already exists');
      return;
    }
    
    // Wait and retry to find the composer area
    for (let attempt = 0; attempt < 20; attempt++) {
      window.CUP.log('ChatUI: Looking for injection point, attempt', attempt);
      
      // Find the contenteditable input
      const contentEditable = document.querySelector('[contenteditable="true"]');
      if (!contentEditable) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      
      // Walk up to find a good container - look for the main chat area
      // Claude's structure: main > div > ... > form area
      let target = contentEditable;
      let container = null;
      
      // Go up until we find a reasonable container
      for (let i = 0; i < 10; i++) {
        target = target.parentElement;
        if (!target) break;
        
        // Look for a container that has the send button area
        // This is typically the grandparent of the form
        if (target.tagName === 'FORM' || target.querySelector('button[type="submit"]')) {
          container = target.parentElement;
          break;
        }
      }
      
      if (!container) {
        // Fallback: just use the form's parent
        const form = contentEditable.closest('form');
        if (form && form.parentElement) {
          container = form.parentElement;
        }
      }
      
      if (container) {
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
        
        // Append to the container
        container.appendChild(this.inputStats);
        window.CUP.log('ChatUI: Input stats injected into', container.tagName, container.className?.substring(0, 50));
        
        // Apply any cached usage data
        if (this.currentUsageData) {
          this.updateUsage(this.currentUsageData);
        }
        return;
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
    
    window.CUP.log('ChatUI: Failed to find injection point after all attempts');
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
    }
  }
}

window.ChatUI = ChatUI;
window.CUP.log('ChatUI loaded');
