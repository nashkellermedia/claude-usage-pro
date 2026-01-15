/**
 * Claude Usage Pro - Chat UI
 * Stats bar below chat input
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
      return;
    }
    
    // Simple approach: wait for contenteditable, then find main content area
    for (let attempt = 0; attempt < 10; attempt++) {
      const contentEditable = document.querySelector('[contenteditable="true"]');
      
      if (contentEditable) {
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
            <span class="cup-stat-icon">💬</span>
            <span class="cup-stat-label">Context:</span>
            <span class="cup-stat-value" id="cup-context-pct">--%</span>
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
        
        // Go up 5-6 levels from contenteditable to find composer container
        let container = contentEditable;
        for (let i = 0; i < 6; i++) {
          if (container.parentElement) {
            container = container.parentElement;
          }
        }
        
        // Insert after the container
        if (container && container.parentElement) {
          container.parentElement.insertBefore(this.inputStats, container.nextSibling);
          window.CUP.log('ChatUI: Input stats injected');
          
          // Apply cached data
          if (this.currentUsageData) {
            this.updateUsage(this.currentUsageData);
          }
          return;
        }
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
    window.CUP.log('ChatUI: Could not inject input stats');
  }
  
  startDraftMonitor() {
    if (this.typingInterval) clearInterval(this.typingInterval);
    
    this.typingInterval = setInterval(() => {
      const input = document.querySelector('[contenteditable="true"]');
      if (input) {
        const text = input.innerText || '';
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
    
    if (usageData.currentSession) {
      const pct = usageData.currentSession.percent || 0;
      this.updateElement('cup-session-pct', pct + '%');
      this.colorize('cup-session-pct', pct);
      
      if (usageData.currentSession.resetsIn) {
        this.updateElement('cup-reset-timer', usageData.currentSession.resetsIn);
      }
    }
    
    if (usageData.weeklyAllModels) {
      const pct = usageData.weeklyAllModels.percent || 0;
      this.updateElement('cup-weekly-all-pct', pct + '%');
      this.colorize('cup-weekly-all-pct', pct);
    }
    
    if (usageData.weeklySonnet) {
      const pct = usageData.weeklySonnet.percent || 0;
      this.updateElement('cup-weekly-sonnet-pct', pct + '%');
      this.colorize('cup-weekly-sonnet-pct', pct);
    }
    
    // Update context usage
    this.updateContextUsage();
  }
  
  async updateContextUsage() {
    try {
      const messages = document.querySelectorAll('[data-testid*="message"], .font-claude-message, [class*="Message"]');
      const messageCount = messages.length;
      
      if (messageCount === 0) {
        this.updateElement('cup-context-pct', '0%');
        this.colorize('cup-context-pct', 0);
        return;
      }
      
      const estimatedTokensPerMessage = 800;
      const systemPromptTokens = 5000;
      const estimatedUsed = systemPromptTokens + (messageCount * estimatedTokensPerMessage);
      const total = 200000;
      const percent = Math.min(Math.round((estimatedUsed / total) * 100), 100);
      
      this.updateElement('cup-context-pct', percent + '%');
      this.colorize('cup-context-pct', percent);
    } catch (e) {
      window.CUP.log('Chat context update error:', e);
    }
  }
  
  updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  
  colorize(id, percent) {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (percent >= 90) {
      el.style.color = '#ef4444';
    } else if (percent >= 70) {
      el.style.color = '#f59e0b';
    } else {
      el.style.color = '#22c55e';
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
