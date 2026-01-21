/**
 * Claude Usage Pro - Auto Continue
 * Automatically clicks the "Continue" button when Claude's response is truncated
 */

class AutoContinue {
  constructor() {
    this.enabled = false;
    this.delay = 1500;  // ms before clicking continue
    this.maxContinues = 3;  // max auto-continues per response chain
    this.continueCount = 0;
    this.lastMessageId = null;
    this.observer = null;
    this.pendingClick = null;
  }
  
  async initialize() {
    window.CUP.log('AutoContinue: Initializing...');
    
    // Load settings
    try {
      const response = await window.CUP.sendToBackground({ type: 'GET_SETTINGS' });
      if (response?.settings) {
        this.enabled = response.settings.enableAutoContinue || false;
        this.delay = response.settings.autoContinueDelay || 1500;
        this.maxContinues = response.settings.maxAutoContinues || 3;
      }
    } catch (e) {
      window.CUP.logError('AutoContinue: Failed to load settings:', e);
    }
    
    if (this.enabled) {
      this.startObserver();
    }
    
    window.CUP.log('AutoContinue: Initialized, enabled:', this.enabled);
  }
  
  updateSettings(settings) {
    const wasEnabled = this.enabled;
    this.enabled = settings.enableAutoContinue || false;
    this.delay = settings.autoContinueDelay || 1500;
    this.maxContinues = settings.maxAutoContinues || 3;
    
    if (this.enabled && !wasEnabled) {
      this.startObserver();
    } else if (!this.enabled && wasEnabled) {
      this.stopObserver();
    }
    
    window.CUP.log('AutoContinue: Settings updated, enabled:', this.enabled);
  }
  
  startObserver() {
    if (this.observer) return;
    
    window.CUP.log('AutoContinue: Starting DOM observer...');
    
    this.observer = new MutationObserver((mutations) => {
      if (!this.enabled) return;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.checkForContinueButton(node);
            }
          }
        }
      }
    });
    
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Also check immediately for existing button
    this.checkForContinueButton(document.body);
  }
  
  stopObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.pendingClick) {
      clearTimeout(this.pendingClick);
      this.pendingClick = null;
    }
    window.CUP.log('AutoContinue: Observer stopped');
  }
  
  checkForContinueButton(node) {
    if (!this.enabled) return;
    
    // Look for the continue button - Claude uses various selectors
    // Common patterns: button with "Continue" text, or specific data attributes
    const continuePatterns = [
      // Button with "Continue" text
      'button',
      // Specific Claude UI elements
      '[data-testid*="continue"]',
      '[class*="continue"]'
    ];
    
    let continueBtn = null;
    
    // First, check if the node itself is a button
    if (node.tagName === 'BUTTON') {
      if (this.isContinueButton(node)) {
        continueBtn = node;
      }
    }
    
    // Then check children
    if (!continueBtn) {
      const buttons = node.querySelectorAll ? node.querySelectorAll('button') : [];
      for (const btn of buttons) {
        if (this.isContinueButton(btn)) {
          continueBtn = btn;
          break;
        }
      }
    }
    
    if (continueBtn && !this.pendingClick) {
      this.scheduleContinueClick(continueBtn);
    }
  }
  
  isContinueButton(btn) {
    if (!btn) return false;
    
    const text = btn.textContent?.toLowerCase().trim() || '';
    const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
    const className = btn.className?.toLowerCase() || '';
    
    // Check for "Continue" or "Continue generating" text
    const isContinueText = 
      text === 'continue' ||
      text.includes('continue generating') ||
      text.includes('keep going') ||
      ariaLabel.includes('continue');
    
    // Make sure it's not a navigation button or other unrelated button
    const isNotNavigation = 
      !text.includes('cancel') &&
      !text.includes('stop') &&
      !text.includes('close') &&
      !className.includes('nav');
    
    // Check if button is visible
    const isVisible = btn.offsetParent !== null && 
                     btn.offsetWidth > 0 && 
                     btn.offsetHeight > 0;
    
    return isContinueText && isNotNavigation && isVisible;
  }
  
  scheduleContinueClick(btn) {
    // Get current message context to track continue chain
    const messageContainer = btn.closest('[data-message-id]') || 
                            btn.closest('[class*="message"]') ||
                            btn.closest('article');
    const messageId = messageContainer?.getAttribute('data-message-id') || 
                     messageContainer?.id ||
                     Date.now().toString();
    
    // Reset count if this is a new message chain
    if (messageId !== this.lastMessageId) {
      this.continueCount = 0;
      this.lastMessageId = messageId;
    }
    
    // Check if we've hit the limit
    if (this.continueCount >= this.maxContinues) {
      window.CUP.log('AutoContinue: Max continues reached (' + this.maxContinues + '), stopping');
      this.showMaxContinuesNotice();
      return;
    }
    
    window.CUP.log('AutoContinue: Continue button detected, clicking in', this.delay + 'ms (count:', this.continueCount + 1 + '/' + this.maxContinues + ')');
    
    // Show visual indicator
    this.showAutoClickIndicator(btn);
    
    this.pendingClick = setTimeout(() => {
      this.pendingClick = null;
      
      // Verify button still exists and is visible
      if (!document.body.contains(btn) || !this.isContinueButton(btn)) {
        window.CUP.log('AutoContinue: Button no longer valid, skipping');
        return;
      }
      
      // Click the button
      this.continueCount++;
      window.CUP.log('AutoContinue: Clicking continue button');
      
      try {
        btn.click();
        
        // Also try dispatching events in case click doesn't work
        btn.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
      } catch (e) {
        window.CUP.logError('AutoContinue: Click failed:', e);
      }
      
      // Remove indicator
      this.removeAutoClickIndicator();
      
    }, this.delay);
  }
  
  showAutoClickIndicator(btn) {
    // Remove any existing indicator
    this.removeAutoClickIndicator();
    
    // Create indicator overlay on the button
    const indicator = document.createElement('div');
    indicator.id = 'cup-auto-continue-indicator';
    indicator.innerHTML = `
      <div class="cup-auto-continue-inner">
        <span class="cup-auto-continue-icon">🔄</span>
        <span class="cup-auto-continue-text">Auto-continuing in ${(this.delay / 1000).toFixed(1)}s...</span>
        <button class="cup-auto-continue-cancel" title="Cancel auto-continue">✕</button>
      </div>
    `;
    
    // Position near the button
    const rect = btn.getBoundingClientRect();
    indicator.style.cssText = `
      position: fixed;
      top: ${rect.top - 40}px;
      left: ${rect.left}px;
      z-index: 10000;
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      color: white;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      animation: cup-fade-in 0.2s ease;
    `;
    
    // Add cancel handler
    indicator.querySelector('.cup-auto-continue-cancel').addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelPendingClick();
    });
    
    document.body.appendChild(indicator);
  }
  
  removeAutoClickIndicator() {
    const indicator = document.getElementById('cup-auto-continue-indicator');
    if (indicator) {
      indicator.remove();
    }
  }
  
  cancelPendingClick() {
    if (this.pendingClick) {
      clearTimeout(this.pendingClick);
      this.pendingClick = null;
      window.CUP.log('AutoContinue: Cancelled by user');
    }
    this.removeAutoClickIndicator();
  }
  
  showMaxContinuesNotice() {
    // Show a notice that max continues was reached
    const notice = document.createElement('div');
    notice.id = 'cup-max-continues-notice';
    notice.innerHTML = `
      <div class="cup-notice-inner">
        <span>⚠️ Auto-continue limit reached (${this.maxContinues}). Click Continue manually if needed.</span>
        <button class="cup-notice-close">✕</button>
      </div>
    `;
    notice.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      background: #f59e0b;
      color: #1a1a1a;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;
    
    notice.querySelector('.cup-notice-close').addEventListener('click', () => {
      notice.remove();
    });
    
    document.body.appendChild(notice);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (document.body.contains(notice)) {
        notice.remove();
      }
    }, 5000);
  }
  
  // Reset continue count (called when user sends a new message)
  resetCount() {
    this.continueCount = 0;
    this.lastMessageId = null;
  }
}

window.AutoContinue = AutoContinue;
window.CUP.log('AutoContinue loaded');
