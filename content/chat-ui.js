/**
 * Claude Usage Pro - Chat UI
 * Top bar and input stats overlay
 */

class ChatUI {
  constructor() {
    this.topBar = null;
    this.inputStats = null;
    this.initialized = false;
    this.lastDraftLength = 0;
    this.typingInterval = null;
    this.currentModel = 'claude-sonnet-4';
  }
  
  initialize() {
    window.CUP.log('ChatUI: Initializing...');
    this.initialized = true;
    
    // Detect initial model
    this.currentModel = this.detectModel();
    
    // Watch for model changes
    this.startModelWatcher();
  }
  
  async injectUI() {
    await this.injectTopBar();
    await this.injectInputStats();
    this.startDraftMonitor();
  }
  
  /**
   * Detect current model from page
   */
  detectModel() {
    // Check the model selector/dropdown
    const modelButton = document.querySelector('[data-testid="model-selector"]') ||
                       document.querySelector('button[class*="model"]') ||
                       document.querySelector('[class*="ModelSelect"]');
    
    if (modelButton) {
      const text = modelButton.textContent?.toLowerCase() || '';
      if (text.includes('opus')) return 'claude-opus-4';
      if (text.includes('haiku')) return 'claude-haiku-4';
      if (text.includes('sonnet')) return 'claude-sonnet-4';
    }
    
    // Check for model name anywhere in bottom area (near submit button)
    const bottomArea = document.querySelector('[class*="composer"]') ||
                      document.querySelector('form');
    if (bottomArea) {
      const text = bottomArea.textContent?.toLowerCase() || '';
      if (text.includes('opus')) return 'claude-opus-4';
      if (text.includes('haiku')) return 'claude-haiku-4';
    }
    
    // Check full page for model references
    const allText = document.body?.innerText?.toLowerCase() || '';
    
    // Look for specific model version strings
    if (allText.includes('opus 4.5') || allText.includes('opus-4')) return 'claude-opus-4';
    if (allText.includes('haiku 4.5') || allText.includes('haiku-4')) return 'claude-haiku-4';
    
    return 'claude-sonnet-4';
  }
  
  /**
   * Watch for model selector changes
   */
  startModelWatcher() {
    setInterval(() => {
      const newModel = this.detectModel();
      if (newModel !== this.currentModel) {
        this.currentModel = newModel;
        this.updateModelBadge(newModel);
        window.CUP.log('ChatUI: Model changed to', newModel);
      }
    }, 2000);
  }
  
  async injectTopBar() {
    // Wait for main content area
    await new Promise(r => setTimeout(r, 500));
    
    const mainSelectors = [
      'main',
      '[class*="conversation"]',
      '[class*="ConversationView"]',
      '.relative.flex.h-full.flex-col'
    ];
    
    let mainContent = null;
    for (const sel of mainSelectors) {
      mainContent = document.querySelector(sel);
      if (mainContent) break;
    }
    
    if (!mainContent) {
      window.CUP.log('ChatUI: Main content not found for top bar');
      return;
    }
    
    if (document.getElementById('cup-top-bar')) return;
    
    this.topBar = document.createElement('div');
    this.topBar.id = 'cup-top-bar';
    this.topBar.innerHTML = `
      <div class="cup-top-bar-inner">
        <div class="cup-stat">
          <span class="cup-icon">📝</span>
          <span class="cup-label">Context:</span>
          <span class="cup-value" id="cup-conv-tokens">0</span>
          <span class="cup-unit">tokens</span>
        </div>
        <div class="cup-stat">
          <span class="cup-icon">💰</span>
          <span class="cup-label">Next:</span>
          <span class="cup-value" id="cup-next-cost">~0</span>
        </div>
        <div class="cup-stat">
          <span class="cup-icon">💾</span>
          <span class="cup-label">Cache:</span>
          <span class="cup-value" id="cup-cache-status">—</span>
        </div>
        <div class="cup-stat">
          <span class="cup-icon">🤖</span>
          <span class="cup-badge" id="cup-model-badge">SONNET</span>
          <span class="cup-multiplier" id="cup-model-multiplier">1x</span>
        </div>
      </div>
    `;
    
    mainContent.insertBefore(this.topBar, mainContent.firstChild);
    
    // Set initial model
    this.updateModelBadge(this.currentModel);
    
    window.CUP.log('ChatUI: Top bar injected');
  }
  
  async injectInputStats() {
    await new Promise(r => setTimeout(r, 500));
    
    // Find composer area
    const composerSelectors = [
      '[class*="composer"]',
      '[class*="Composer"]',
      'form:has([contenteditable])',
      'form:has(textarea)'
    ];
    
    let composer = null;
    for (const sel of composerSelectors) {
      try {
        composer = document.querySelector(sel);
        if (composer) break;
      } catch (e) {}
    }
    
    // Fallback: find by contenteditable
    if (!composer) {
      const editable = document.querySelector('[contenteditable="true"]');
      if (editable) {
        composer = editable.closest('form') || editable.parentElement?.parentElement?.parentElement;
      }
    }
    
    if (!composer) {
      window.CUP.log('ChatUI: Composer not found for input stats');
      return;
    }
    
    if (document.getElementById('cup-input-stats')) return;
    
    this.inputStats = document.createElement('div');
    this.inputStats.id = 'cup-input-stats';
    this.inputStats.innerHTML = `
      <div class="cup-input-stats-inner">
        <div class="cup-input-stat">
          <span class="cup-input-icon">✏️</span>
          <span class="cup-input-label">Draft:</span>
          <span class="cup-input-value" id="cup-draft-tokens">0</span>
          <span class="cup-input-unit">tokens</span>
        </div>
        <div class="cup-input-progress">
          <div class="cup-input-progress-bg">
            <div class="cup-input-progress-bar" id="cup-mini-progress"></div>
          </div>
          <span class="cup-input-percent" id="cup-quota-percent">0%</span>
        </div>
        <div class="cup-input-stat">
          <span class="cup-input-icon">📊</span>
          <span class="cup-input-value" id="cup-msgs-remaining">~450</span>
          <span class="cup-input-label">left</span>
        </div>
        <div class="cup-input-stat">
          <span class="cup-input-icon">⏱️</span>
          <span class="cup-input-value" id="cup-reset-timer">—</span>
        </div>
      </div>
    `;
    
    // Insert after composer
    if (composer.parentElement) {
      composer.parentElement.appendChild(this.inputStats);
    } else {
      composer.appendChild(this.inputStats);
    }
    
    window.CUP.log('ChatUI: Input stats injected');
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
          const el = document.getElementById('cup-draft-tokens');
          if (el) {
            el.textContent = tokens.toLocaleString();
            
            // Color based on length
            if (tokens > 10000) el.style.color = 'var(--cup-danger)';
            else if (tokens > 5000) el.style.color = 'var(--cup-warning)';
            else el.style.color = 'var(--cup-success)';
          }
        }
      }
    }, 300);
  }
  
  updateModelBadge(model) {
    const badgeEl = document.getElementById('cup-model-badge');
    const multEl = document.getElementById('cup-model-multiplier');
    
    if (!badgeEl || !multEl) return;
    
    const modelLower = (model || '').toLowerCase();
    
    if (modelLower.includes('opus')) {
      badgeEl.textContent = 'OPUS';
      badgeEl.className = 'cup-badge cup-badge-opus';
      multEl.textContent = '5x';
    } else if (modelLower.includes('haiku')) {
      badgeEl.textContent = 'HAIKU';
      badgeEl.className = 'cup-badge cup-badge-haiku';
      multEl.textContent = '0.2x';
    } else {
      badgeEl.textContent = 'SONNET';
      badgeEl.className = 'cup-badge cup-badge-sonnet';
      multEl.textContent = '1x';
    }
  }
  
  updateConversation(conversationData, model) {
    if (conversationData) {
      const tokens = conversationData.length || 0;
      this.updateElement('cup-conv-tokens', this.formatNumber(tokens));
      this.updateElement('cup-next-cost', '~' + this.formatNumber(tokens + 1000));
    }
    
    if (model) {
      this.updateModelBadge(model);
    }
  }
  
  updateUsage(usageData, conversationData, model) {
    if (!usageData) return;
    
    const modelUsage = usageData.modelUsage || {};
    const multipliers = {
      'claude-sonnet-4': 1.0,
      'claude-haiku-4': 0.2,
      'claude-opus-4': 5.0
    };
    
    let weightedTotal = 0;
    for (const [m, tokens] of Object.entries(modelUsage)) {
      weightedTotal += tokens * (multipliers[m] || 1.0);
    }
    
    const cap = usageData.usageCap || 45000000;
    const percentage = (weightedTotal / cap) * 100;
    const remaining = cap - weightedTotal;
    
    // Progress bar
    const progressEl = document.getElementById('cup-mini-progress');
    if (progressEl) {
      progressEl.style.width = Math.min(percentage, 100) + '%';
    }
    
    // Percentage
    this.updateElement('cup-quota-percent', percentage.toFixed(1) + '%');
    
    // Messages remaining (estimate ~100K per message)
    const avgPerMsg = usageData.messagesCount > 0 
      ? Math.max(50000, weightedTotal / usageData.messagesCount)
      : 100000;
    const msgsLeft = Math.max(0, Math.floor(remaining / avgPerMsg));
    this.updateElement('cup-msgs-remaining', '~' + msgsLeft);
    
    // Reset timer
    if (usageData.resetTimestamp) {
      const ms = usageData.resetTimestamp - Date.now();
      if (ms > 0) {
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        this.updateElement('cup-reset-timer', `${h}h ${m}m`);
      } else {
        this.updateElement('cup-reset-timer', 'Now!');
      }
    }
    
    // Update model badge
    this.updateModelBadge(model || this.currentModel);
  }
  
  updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  
  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  }
  
  checkAndReinject() {
    if (!document.getElementById('cup-top-bar')) this.injectTopBar();
    if (!document.getElementById('cup-input-stats')) this.injectInputStats();
  }
}

window.ChatUI = ChatUI;
window.CUP.log('ChatUI loaded');
