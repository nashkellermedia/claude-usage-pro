/**
 * Claude Usage Pro - Chat UI Components
 * 
 * Features:
 * - Top stats bar (conversation length, cost estimate, cache status, model)
 * - Input area stats (live draft counter, quota bar, messages remaining, reset timer)
 * - Live typing token counter
 */

class ChatUI {
  constructor() {
    this.topBar = null;
    this.inputStats = null;
    this.draftCounter = null;
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
  
  /**
   * TOP STATS BAR - Shows conversation info near the title
   */
  async injectTopBar() {
    // Find the main chat header area
    const headerSelectors = [
      'header',
      '[class*="sticky"][class*="top"]',
      '.sticky.top-0',
      '[data-testid="conversation-header"]'
    ];
    
    let header = null;
    for (const sel of headerSelectors) {
      header = document.querySelector(sel);
      if (header) break;
    }
    
    if (!header) {
      window.CUP.log('ChatUI: Header not found, will retry');
      return;
    }
    
    // Don't inject twice
    if (document.getElementById('cup-top-bar')) return;
    
    this.topBar = document.createElement('div');
    this.topBar.id = 'cup-top-bar';
    this.topBar.innerHTML = `
      <div class="cup-top-bar-inner">
        <div class="cup-stat cup-conv-length" title="Conversation context length">
          <span class="cup-icon">📝</span>
          <span class="cup-label">Context:</span>
          <span class="cup-value" id="cup-conv-tokens">0</span>
          <span class="cup-unit">tokens</span>
        </div>
        <div class="cup-stat cup-next-cost" title="Estimated cost for next message">
          <span class="cup-icon">💰</span>
          <span class="cup-label">Next msg:</span>
          <span class="cup-value" id="cup-next-cost">~0</span>
          <span class="cup-unit">tokens</span>
        </div>
        <div class="cup-stat cup-cache-status" title="Prompt caching status">
          <span class="cup-icon" id="cup-cache-icon">💾</span>
          <span class="cup-label">Cache:</span>
          <span class="cup-value" id="cup-cache-status">Unknown</span>
        </div>
        <div class="cup-stat cup-model-info" title="Current model and cost multiplier">
          <span class="cup-icon">🤖</span>
          <span class="cup-badge" id="cup-model-badge">Sonnet</span>
          <span class="cup-multiplier" id="cup-model-multiplier">1x</span>
        </div>
      </div>
    `;
    
    // Insert after header or at top of main content
    const mainContent = document.querySelector('main') || document.querySelector('[class*="conversation"]');
    if (mainContent) {
      mainContent.insertBefore(this.topBar, mainContent.firstChild);
    } else {
      header.parentNode.insertBefore(this.topBar, header.nextSibling);
    }
    
    window.CUP.log('ChatUI: Top bar injected');
  }
  
  /**
   * INPUT AREA STATS - Shows stats below the text input
   */
  async injectInputStats() {
    // Find the input container
    const inputSelectors = [
      '[class*="ProseMirror"]',
      '[contenteditable="true"]',
      'textarea',
      '[class*="composer"]',
      '[class*="input-area"]'
    ];
    
    let inputArea = null;
    for (const sel of inputSelectors) {
      inputArea = document.querySelector(sel);
      if (inputArea) break;
    }
    
    if (!inputArea) {
      window.CUP.log('ChatUI: Input area not found');
      return;
    }
    
    // Find the container to append to
    const inputContainer = inputArea.closest('[class*="composer"]') || 
                          inputArea.closest('form') || 
                          inputArea.parentElement?.parentElement;
    
    if (!inputContainer) return;
    if (document.getElementById('cup-input-stats')) return;
    
    this.inputStats = document.createElement('div');
    this.inputStats.id = 'cup-input-stats';
    this.inputStats.innerHTML = `
      <div class="cup-input-stats-inner">
        <div class="cup-draft-section">
          <span class="cup-draft-icon">✏️</span>
          <span class="cup-draft-label">Draft:</span>
          <span class="cup-draft-tokens" id="cup-draft-tokens">0</span>
          <span class="cup-draft-unit">tokens</span>
        </div>
        <div class="cup-quota-section">
          <div class="cup-mini-progress-container">
            <div class="cup-mini-progress-bar" id="cup-mini-progress"></div>
          </div>
          <span class="cup-quota-percent" id="cup-quota-percent">0%</span>
        </div>
        <div class="cup-remaining-section">
          <span class="cup-remaining-icon">📊</span>
          <span class="cup-remaining-value" id="cup-msgs-remaining">~450</span>
          <span class="cup-remaining-label">msgs left</span>
        </div>
        <div class="cup-reset-section">
          <span class="cup-reset-icon">⏱️</span>
          <span class="cup-reset-value" id="cup-reset-timer">--:--</span>
        </div>
      </div>
    `;
    
    inputContainer.appendChild(this.inputStats);
    window.CUP.log('ChatUI: Input stats injected');
  }
  
  /**
   * Start monitoring draft text for live token counting
   */
  startDraftMonitor() {
    if (this.typingInterval) clearInterval(this.typingInterval);
    
    this.typingInterval = setInterval(() => {
      this.updateDraftCounter();
    }, 500);
  }
  
  /**
   * Update the draft token counter
   */
  updateDraftCounter() {
    const inputSelectors = [
      '[class*="ProseMirror"]',
      '[contenteditable="true"]',
      'textarea'
    ];
    
    let text = '';
    for (const sel of inputSelectors) {
      const input = document.querySelector(sel);
      if (input) {
        text = input.innerText || input.value || '';
        break;
      }
    }
    
    // Estimate tokens (~4 chars per token)
    const tokens = Math.ceil(text.length / 4);
    
    const draftEl = document.getElementById('cup-draft-tokens');
    if (draftEl && tokens !== this.lastDraftLength) {
      draftEl.textContent = tokens.toLocaleString();
      this.lastDraftLength = tokens;
      
      // Color based on length
      if (tokens > 10000) {
        draftEl.style.color = '#ef4444';
      } else if (tokens > 5000) {
        draftEl.style.color = '#f59e0b';
      } else {
        draftEl.style.color = '#22c55e';
      }
    }
  }
  
  /**
   * Update conversation stats
   */
  updateConversation(conversationData, model) {
    if (!conversationData) return;
    
    // Update context tokens
    const convTokensEl = document.getElementById('cup-conv-tokens');
    if (convTokensEl) {
      const tokens = conversationData.length || 0;
      convTokensEl.textContent = this.formatNumber(tokens);
      
      // Color based on context length (200K max for most models)
      if (tokens > 150000) {
        convTokensEl.style.color = '#ef4444';
      } else if (tokens > 100000) {
        convTokensEl.style.color = '#f59e0b';
      } else {
        convTokensEl.style.color = '#22c55e';
      }
    }
    
    // Update next message cost estimate (context + estimated response)
    const nextCostEl = document.getElementById('cup-next-cost');
    if (nextCostEl) {
      const contextCost = conversationData.length || 0;
      const estimatedResponse = 1000; // Average response
      nextCostEl.textContent = '~' + this.formatNumber(contextCost + estimatedResponse);
    }
    
    // Update model badge
    this.updateModelBadge(model);
  }
  
  /**
   * Update model badge and multiplier
   */
  updateModelBadge(model) {
    const badgeEl = document.getElementById('cup-model-badge');
    const multEl = document.getElementById('cup-model-multiplier');
    
    if (!badgeEl || !multEl) return;
    
    const modelLower = (model || '').toLowerCase();
    
    if (modelLower.includes('opus')) {
      badgeEl.textContent = 'Opus';
      badgeEl.className = 'cup-badge cup-badge-opus';
      multEl.textContent = '5x';
      multEl.className = 'cup-multiplier cup-mult-opus';
    } else if (modelLower.includes('haiku')) {
      badgeEl.textContent = 'Haiku';
      badgeEl.className = 'cup-badge cup-badge-haiku';
      multEl.textContent = '0.2x';
      multEl.className = 'cup-multiplier cup-mult-haiku';
    } else {
      badgeEl.textContent = 'Sonnet';
      badgeEl.className = 'cup-badge cup-badge-sonnet';
      multEl.textContent = '1x';
      multEl.className = 'cup-multiplier cup-mult-sonnet';
    }
  }
  
  /**
   * Update cache status indicator
   */
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
      statusEl.textContent = 'Not cached';
      statusEl.style.color = '#71717a';
    }
  }
  
  /**
   * Update usage display in input area
   */
  updateUsage(usageData, conversationData, model) {
    if (!usageData) return;
    
    // Calculate weighted usage
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
      
      if (percentage >= 90) {
        progressEl.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
      } else if (percentage >= 70) {
        progressEl.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
      } else {
        progressEl.style.background = 'linear-gradient(90deg, #2563eb, #3b82f6)';
      }
    }
    
    // Update percentage
    const percentEl = document.getElementById('cup-quota-percent');
    if (percentEl) {
      percentEl.textContent = percentage.toFixed(1) + '%';
    }
    
    // Estimate messages remaining
    const msgsRemainingEl = document.getElementById('cup-msgs-remaining');
    if (msgsRemainingEl) {
      const avgTokensPerMsg = usageData.messagesCount > 0 
        ? weightedTotal / usageData.messagesCount 
        : 100000; // Default estimate
      const remaining = Math.floor((cap - weightedTotal) / avgTokensPerMsg);
      msgsRemainingEl.textContent = '~' + Math.max(0, remaining);
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
    
    // Update conversation stats if available
    if (conversationData) {
      this.updateConversation(conversationData, model);
    }
    
    // Update model badge
    this.updateModelBadge(model);
  }
  
  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  }
  
  checkAndReinject() {
    if (!document.getElementById('cup-top-bar')) {
      this.injectTopBar();
    }
    if (!document.getElementById('cup-input-stats')) {
      this.injectInputStats();
    }
  }
}

window.ChatUI = ChatUI;
window.CUP.log('ChatUI class loaded');
