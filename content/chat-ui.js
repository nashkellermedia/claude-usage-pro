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
    this.currentModel = 'sonnet';
  }
  
  initialize() {
    window.CUP.log('ChatUI: Initializing...');
    this.initialized = true;
    this.currentModel = this.detectModel();
    this.startModelWatcher();
  }
  
  async injectUI() {
    await this.injectTopBar();
    await this.injectInputStats();
    this.startDraftMonitor();
  }
  
  detectModel() {
    const modelButton = document.querySelector('[data-testid="model-selector"]') ||
                       document.querySelector('button[class*="model"]');
    
    if (modelButton) {
      const text = modelButton.textContent?.toLowerCase() || '';
      if (text.includes('opus')) return 'opus';
      if (text.includes('haiku')) return 'haiku';
    }
    
    const pageText = document.body?.innerText?.toLowerCase() || '';
    if (pageText.includes('opus 4.5')) return 'opus';
    if (pageText.includes('haiku 4.5')) return 'haiku';
    
    return 'sonnet';
  }
  
  startModelWatcher() {
    setInterval(() => {
      const newModel = this.detectModel();
      if (newModel !== this.currentModel) {
        this.currentModel = newModel;
        this.updateModelBadge(newModel);
      }
    }, 2000);
  }
  
  async injectTopBar() {
    await new Promise(r => setTimeout(r, 500));
    
    const mainSelectors = ['main', '[class*="conversation"]', '.relative.flex.h-full.flex-col'];
    let mainContent = null;
    
    for (const sel of mainSelectors) {
      mainContent = document.querySelector(sel);
      if (mainContent) break;
    }
    
    if (!mainContent || document.getElementById('cup-top-bar')) return;
    
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
    this.updateModelBadge(this.currentModel);
    window.CUP.log('ChatUI: Top bar injected');
  }
  
  async injectInputStats() {
    await new Promise(r => setTimeout(r, 500));
    
    // Find composer
    let composer = document.querySelector('[class*="composer"]') ||
                  document.querySelector('form:has([contenteditable])');
    
    if (!composer) {
      const editable = document.querySelector('[contenteditable="true"]');
      if (editable) {
        composer = editable.closest('form') || editable.parentElement?.parentElement?.parentElement;
      }
    }
    
    if (!composer || document.getElementById('cup-input-stats')) {
      window.CUP.log('ChatUI: Composer not found or input stats already exists');
      return;
    }
    
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
          <span class="cup-input-icon">⏱️</span>
          <span class="cup-input-value" id="cup-reset-timer">--</span>
        </div>
      </div>
    `;
    
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
            el.style.color = tokens > 10000 ? 'var(--cup-danger)' : 
                            tokens > 5000 ? 'var(--cup-warning)' : 
                            'var(--cup-success)';
          }
        }
      }
    }, 300);
  }
  
  updateModelBadge(model) {
    const badgeEl = document.getElementById('cup-model-badge');
    const multEl = document.getElementById('cup-model-multiplier');
    
    if (!badgeEl || !multEl) return;
    
    const m = (model || 'sonnet').toLowerCase();
    
    if (m.includes('opus')) {
      badgeEl.textContent = 'OPUS';
      badgeEl.className = 'cup-badge cup-badge-opus';
      multEl.textContent = '5x';
    } else if (m.includes('haiku')) {
      badgeEl.textContent = 'HAIKU';
      badgeEl.className = 'cup-badge cup-badge-haiku';
      multEl.textContent = '0.2x';
    } else {
      badgeEl.textContent = 'SONNET';
      badgeEl.className = 'cup-badge cup-badge-sonnet';
      multEl.textContent = '1x';
    }
  }
  
  /**
   * Update with percentage-based usage data
   */
  updateUsage(usageData, conversationData, model) {
    if (!usageData) return;
    
    // Update progress bar with current session percentage
    const percent = usageData.currentSession?.percent || 0;
    
    const progressEl = document.getElementById('cup-mini-progress');
    if (progressEl) {
      progressEl.style.width = Math.min(percent, 100) + '%';
      progressEl.style.background = percent >= 90 ? 'var(--cup-danger)' : 
                                    percent >= 70 ? 'var(--cup-warning)' : 
                                    'var(--cup-accent)';
    }
    
    // Update percentage text
    this.updateElement('cup-quota-percent', percent + '%');
    
    // Update reset timer
    const resetTime = usageData.currentSession?.resetsIn;
    if (resetTime && resetTime !== '--') {
      this.updateElement('cup-reset-timer', resetTime);
    }
    
    // Update model badge
    if (model) {
      this.updateModelBadge(model);
    } else if (usageData.currentModel) {
      this.updateModelBadge(usageData.currentModel);
    }
  }
  
  updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  
  checkAndReinject() {
    if (!document.getElementById('cup-top-bar')) this.injectTopBar();
    if (!document.getElementById('cup-input-stats')) this.injectInputStats();
  }
}

window.ChatUI = ChatUI;
window.CUP.log('ChatUI loaded');
