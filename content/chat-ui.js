/**
 * Claude Usage Pro - Chat UI Components
 */

class ChatUI {
  constructor() {
    this.topBar = null;
    this.inputStats = null;
    this.initialized = false;
    this.lastDraftLength = 0;
    this.typingInterval = null;
  }
  
  initialize() {
    window.CUP.log('ChatUI initialized');
    this.initialized = true;
  }
  
  async injectUI() {
    await this.injectTopBar();
    await this.injectInputStats();
    this.startDraftMonitor();
  }
  
  async injectTopBar() {
    // Find the main content area
    const mainSelectors = [
      'main',
      '[class*="conversation"]',
      '[class*="chat-container"]',
      '.relative.flex.flex-col'
    ];
    
    let mainContent = null;
    for (const sel of mainSelectors) {
      mainContent = document.querySelector(sel);
      if (mainContent) break;
    }
    
    if (!mainContent) {
      window.CUP.log('ChatUI: Main content not found');
      return;
    }
    
    if (document.getElementById('cup-top-bar')) return;
    
    this.topBar = document.createElement('div');
    this.topBar.id = 'cup-top-bar';
    this.topBar.innerHTML = `
      <div class="cup-top-bar-inner">
        <div class="cup-stat" title="Conversation context length">
          <span class="cup-icon">📝</span>
          <span class="cup-label">Context:</span>
          <span class="cup-value" id="cup-conv-tokens">0</span>
          <span class="cup-unit">tokens</span>
        </div>
        <div class="cup-stat" title="Estimated cost for next message">
          <span class="cup-icon">💰</span>
          <span class="cup-label">Next msg:</span>
          <span class="cup-value" id="cup-next-cost">~0</span>
          <span class="cup-unit">tokens</span>
        </div>
        <div class="cup-stat" title="Prompt caching status">
          <span class="cup-icon" id="cup-cache-icon">💾</span>
          <span class="cup-label">Cache:</span>
          <span class="cup-value" id="cup-cache-status">Unknown</span>
        </div>
        <div class="cup-stat cup-model-stat" title="Current model">
          <span class="cup-icon">🤖</span>
          <span class="cup-badge" id="cup-model-badge">Sonnet</span>
          <span class="cup-multiplier" id="cup-model-multiplier">1x</span>
        </div>
      </div>
    `;
    
    mainContent.insertBefore(this.topBar, mainContent.firstChild);
    window.CUP.log('ChatUI: Top bar injected');
  }
  
  async injectInputStats() {
    // Find the composer/input area
    const composerSelectors = [
      '[class*="composer"]',
      '[class*="input-container"]',
      'form',
      '[contenteditable="true"]'
    ];
    
    let composer = null;
    for (const sel of composerSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        composer = el.closest('form') || el.closest('[class*="composer"]') || el.parentElement?.parentElement;
        if (composer) break;
      }
    }
    
    if (!composer) {
      window.CUP.log('ChatUI: Composer not found');
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
          <span class="cup-input-value" id="cup-msgs-remaining">~999</span>
          <span class="cup-input-label">msgs left</span>
        </div>
        <div class="cup-input-stat">
          <span class="cup-input-icon">⏱️</span>
          <span class="cup-input-value" id="cup-reset-timer">--:--</span>
        </div>
      </div>
    `;
    
    composer.parentElement.appendChild(this.inputStats);
    window.CUP.log('ChatUI: Input stats injected');
  }
  
  startDraftMonitor() {
    if (this.typingInterval) clearInterval(this.typingInterval);
    
    this.typingInterval = setInterval(() => {
      this.updateDraftCounter();
    }, 500);
  }
  
  updateDraftCounter() {
    const inputSelectors = ['[class*="ProseMirror"]', '[contenteditable="true"]', 'textarea'];
    
    let text = '';
    for (const sel of inputSelectors) {
      const input = document.querySelector(sel);
      if (input) {
        text = input.innerText || input.value || '';
        break;
      }
    }
    
    const tokens = Math.ceil(text.length / 4);
    const draftEl = document.getElementById('cup-draft-tokens');
    
    if (draftEl && tokens !== this.lastDraftLength) {
      draftEl.textContent = tokens.toLocaleString();
      this.lastDraftLength = tokens;
      
      if (tokens > 10000) draftEl.style.color = '#ef4444';
      else if (tokens > 5000) draftEl.style.color = '#f59e0b';
      else draftEl.style.color = '#22c55e';
    }
  }
  
  updateConversation(conversationData, model) {
    if (!conversationData) return;
    
    const convTokensEl = document.getElementById('cup-conv-tokens');
    if (convTokensEl) {
      const tokens = conversationData.length || 0;
      convTokensEl.textContent = this.formatNumber(tokens);
      
      if (tokens > 150000) convTokensEl.style.color = '#ef4444';
      else if (tokens > 100000) convTokensEl.style.color = '#f59e0b';
      else convTokensEl.style.color = '#22c55e';
    }
    
    const nextCostEl = document.getElementById('cup-next-cost');
    if (nextCostEl) {
      const contextCost = conversationData.length || 0;
      nextCostEl.textContent = '~' + this.formatNumber(contextCost + 1000);
    }
    
    this.updateModelBadge(model);
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
      multEl.className = 'cup-multiplier cup-mult-opus';
    } else if (modelLower.includes('haiku')) {
      badgeEl.textContent = 'HAIKU';
      badgeEl.className = 'cup-badge cup-badge-haiku';
      multEl.textContent = '0.2x';
      multEl.className = 'cup-multiplier cup-mult-haiku';
    } else {
      badgeEl.textContent = 'SONNET';
      badgeEl.className = 'cup-badge cup-badge-sonnet';
      multEl.textContent = '1x';
      multEl.className = 'cup-multiplier cup-mult-sonnet';
    }
  }
  
  updateCacheStatus(isCached, expiresIn) {
    const iconEl = document.getElementById('cup-cache-icon');
    const statusEl = document.getElementById('cup-cache-status');
    if (!iconEl || !statusEl) return;
    
    if (isCached) {
      iconEl.textContent = '✅';
      statusEl.textContent = expiresIn ? `Active (${expiresIn}m)` : 'Active';
      statusEl.style.color = '#22c55e';
    } else {
      iconEl.textContent = '💾';
      statusEl.textContent = 'Unknown';
      statusEl.style.color = '#71717a';
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
    
    // Update mini progress bar
    const progressEl = document.getElementById('cup-mini-progress');
    if (progressEl) {
      progressEl.style.width = Math.min(percentage, 100) + '%';
      
      if (percentage >= 90) progressEl.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
      else if (percentage >= 70) progressEl.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
      else progressEl.style.background = 'linear-gradient(90deg, #2563eb, #3b82f6)';
    }
    
    // Update percentage
    const percentEl = document.getElementById('cup-quota-percent');
    if (percentEl) {
      percentEl.textContent = percentage.toFixed(1) + '%';
    }
    
    // Estimate messages remaining - FIX: use reasonable defaults
    const msgsRemainingEl = document.getElementById('cup-msgs-remaining');
    if (msgsRemainingEl) {
      const remaining = cap - weightedTotal;
      
      // Use average of 100K tokens per message if no history, otherwise calculate
      let avgTokensPerMsg = 100000;
      if (usageData.messagesCount > 0 && weightedTotal > 0) {
        avgTokensPerMsg = Math.max(10000, weightedTotal / usageData.messagesCount);
      }
      
      const msgsLeft = Math.max(0, Math.floor(remaining / avgTokensPerMsg));
      msgsRemainingEl.textContent = '~' + msgsLeft.toLocaleString();
    }
    
    // Update reset timer
    const resetEl = document.getElementById('cup-reset-timer');
    if (resetEl && usageData.resetTimestamp) {
      const msRemaining = usageData.resetTimestamp - Date.now();
      if (msRemaining > 0) {
        const hours = Math.floor(msRemaining / (1000 * 60 * 60));
        const mins = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
        resetEl.textContent = `${hours}h ${mins}m`;
      } else {
        resetEl.textContent = 'Now!';
      }
    }
    
    if (conversationData) this.updateConversation(conversationData, model);
    this.updateModelBadge(model);
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
window.CUP.log('ChatUI class loaded');
