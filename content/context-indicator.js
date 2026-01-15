/**
 * Claude Usage Pro - Context Usage Indicator
 * Shows a progress bar indicating how much context is being used in the current chat
 */

class ContextIndicator {
  constructor() {
    this.indicator = null;
    this.progressBar = null;
    this.initialized = false;
    this.updateInterval = null;
  }
  
  initialize() {
    window.CUP.log('ContextIndicator: Initializing...');
    this.initialized = true;
    this.injectIndicator();
    this.startMonitoring();
  }
  
  injectIndicator() {
    if (document.getElementById('cup-context-indicator')) {
      return;
    }
    
    this.indicator = document.createElement('div');
    this.indicator.id = 'cup-context-indicator';
    this.indicator.innerHTML = `
      <div class="cup-context-content">
        <div class="cup-context-info">
          <span class="cup-context-icon">📊</span>
          <span class="cup-context-label">Context Usage:</span>
          <span class="cup-context-percent" id="cup-context-percent">0%</span>
          <span class="cup-context-tokens" id="cup-context-tokens">(0 / 200K tokens)</span>
        </div>
        <div class="cup-context-bar-container">
          <div class="cup-context-bar" id="cup-context-bar"></div>
        </div>
        <div class="cup-context-hint" id="cup-context-hint">
          <span>✓ Good - Plenty of context available</span>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.indicator);
    this.progressBar = document.getElementById('cup-context-bar');
    window.CUP.log('ContextIndicator: Injected');
  }
  
  startMonitoring() {
    // Update every 2 seconds
    this.updateInterval = setInterval(() => {
      this.updateIndicator();
    }, 2000);
    
    // Initial update
    this.updateIndicator();
  }
  
  async updateIndicator() {
    const contextData = await this.estimateContextUsage();
    
    if (!contextData) return;
    
    const percentEl = document.getElementById('cup-context-percent');
    const tokensEl = document.getElementById('cup-context-tokens');
    const hintEl = document.getElementById('cup-context-hint');
    
    if (!percentEl || !tokensEl || !hintEl) return;
    
    const { used, total, percent } = contextData;
    
    // Update text
    percentEl.textContent = `${percent}%`;
    tokensEl.textContent = `(${this.formatTokens(used)} / ${this.formatTokens(total)} tokens)`;
    
    // Update progress bar width
    this.progressBar.style.width = `${Math.min(percent, 100)}%`;
    
    // Remove all state classes
    this.progressBar.classList.remove('good', 'warning', 'danger');
    this.indicator.classList.remove('good', 'warning', 'danger');
    
    // Apply state based on percentage
    if (percent < 60) {
      // Green - Good
      this.progressBar.classList.add('good');
      this.indicator.classList.add('good');
      hintEl.innerHTML = '<span>✓ Good - Plenty of context available</span>';
    } else if (percent < 85) {
      // Yellow - Warning
      this.progressBar.classList.add('warning');
      this.indicator.classList.add('warning');
      hintEl.innerHTML = '<span>⚠️ Getting full - Consider wrapping up soon</span>';
    } else {
      // Red - Danger
      this.progressBar.classList.add('danger');
      this.indicator.classList.add('danger');
      hintEl.innerHTML = '<span>🔴 High usage - Start a new session for best performance</span>';
    }
  }
  
  async estimateContextUsage() {
    try {
      // Strategy 1: Count messages in conversation
      const messages = document.querySelectorAll('[data-testid*="message"], .font-claude-message, [class*="Message"]');
      
      if (messages.length === 0) {
        // New conversation
        return { used: 0, total: 200000, percent: 0 };
      }
      
      // Rough estimation:
      // - Each message pair (user + assistant) ≈ 500-2000 tokens
      // - Average: 1000 tokens per exchange
      // - System prompts: ~5000 tokens
      // - Context window: 200K tokens
      
      const messageCount = messages.length;
      const estimatedTokensPerMessage = 800;
      const systemPromptTokens = 5000;
      
      const estimatedUsed = systemPromptTokens + (messageCount * estimatedTokensPerMessage);
      const total = 200000;
      const percent = Math.min(Math.round((estimatedUsed / total) * 100), 100);
      
      return {
        used: estimatedUsed,
        total: total,
        percent: percent
      };
    } catch (e) {
      window.CUP.log('ContextIndicator: Estimation error:', e);
      return null;
    }
  }
  
  formatTokens(num) {
    if (num >= 1000) {
      return Math.round(num / 1000) + 'K';
    }
    return num.toString();
  }
  
  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.indicator) {
      this.indicator.remove();
    }
  }
}

// Export
window.ContextIndicator = ContextIndicator;
