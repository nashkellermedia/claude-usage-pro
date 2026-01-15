/**
 * Claude Usage Pro - Chat UI
 * Stats bar below chat input with attachment tracking and color coding
 */

class ChatUI {
  constructor() {
    this.inputStats = null;
    this.initialized = false;
    this.lastDraftTokens = 0;
    this.typingInterval = null;
    this.currentUsageData = null;
    this.conversationTokens = 0;
    this.attachmentTokens = 0;
    this.cachedConversationData = null;
    
    // Track attachments that have been added (persists after upload completes)
    this.trackedAttachments = new Map(); // id -> { name, tokens, addedAt }
  }
  
  initialize() {
    window.CUP.log('ChatUI: Initializing...');
    this.initialized = true;
    
    // Listen for conversation data from API interceptor
    if (window.APIInterceptor) {
      window.APIInterceptor.on('onConversationLoaded', (data) => {
        this.cachedConversationData = data;
        this.conversationTokens = data.totalTokens || 0;
        window.CUP.log('ChatUI: Conversation loaded, tokens:', this.conversationTokens);
        this.updateContextUsage();
      });
    }
    
    // Set up mutation observer to track attachment additions/removals
    this.setupAttachmentObserver();
  }
  
  setupAttachmentObserver() {
    // Watch for DOM changes in the composer area to detect attachments
    const observer = new MutationObserver((mutations) => {
      this.detectAttachments();
    });
    
    // Start observing once composer is found
    const startObserving = () => {
      const composer = document.querySelector('[contenteditable="true"]')?.closest('form') ||
                       document.querySelector('[contenteditable="true"]')?.closest('[class*="composer"]') ||
                       document.querySelector('[contenteditable="true"]')?.parentElement?.parentElement?.parentElement?.parentElement;
      
      if (composer) {
        observer.observe(composer, { 
          childList: true, 
          subtree: true,
          attributes: true,
          attributeFilter: ['src', 'data-testid', 'class']
        });
        window.CUP.log('ChatUI: Attachment observer started');
      } else {
        // Retry
        setTimeout(startObserving, 1000);
      }
    };
    
    startObserving();
  }
  
  async injectUI() {
    await this.injectInputStats();
    this.startDraftMonitor();
  }
  
  async injectInputStats() {
    if (document.getElementById('cup-input-stats')) {
      return;
    }
    
    for (let attempt = 0; attempt < 10; attempt++) {
      const contentEditable = document.querySelector('[contenteditable="true"]');
      
      if (contentEditable) {
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
            <span class="cup-stat-detail" id="cup-context-detail"></span>
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
        
        let container = contentEditable;
        for (let i = 0; i < 6; i++) {
          if (container.parentElement) {
            container = container.parentElement;
          }
        }
        
        if (container && container.parentElement) {
          container.parentElement.insertBefore(this.inputStats, container.nextSibling);
          window.CUP.log('ChatUI: Input stats injected');
          
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
  
  /**
   * Detect attachments in the composer using multiple strategies
   */
  detectAttachments() {
    const currentAttachments = new Set();
    
    // Strategy 1: Look for file input with files
    const fileInputs = document.querySelectorAll('input[type="file"]');
    for (const input of fileInputs) {
      if (input.files && input.files.length > 0) {
        for (const file of input.files) {
          const id = `file-${file.name}-${file.size}`;
          currentAttachments.add(id);
          if (!this.trackedAttachments.has(id)) {
            const tokens = window.TokenCounter ? 
              window.TokenCounter.estimateFileTokens(file) : 
              this.estimateFileTokens(file);
            this.trackedAttachments.set(id, {
              name: file.name,
              tokens: tokens,
              addedAt: Date.now()
            });
            window.CUP.log('ChatUI: Tracked new file from input:', file.name, tokens);
          }
        }
      }
    }
    
    // Strategy 2: Look for attachment preview elements (thumbnails, pills, etc.)
    const composerArea = document.querySelector('[contenteditable="true"]')?.closest('form') ||
                         document.querySelector('[contenteditable="true"]')?.closest('[class*="ProseMirror"]')?.parentElement?.parentElement?.parentElement ||
                         document.querySelector('[contenteditable="true"]')?.parentElement?.parentElement?.parentElement?.parentElement;
    
    if (composerArea) {
      // Look for various attachment indicators
      const selectors = [
        // Image thumbnails
        'img[src^="blob:"]',
        'img[src*="thumbnail"]',
        'img[src*="preview"]',
        // Data-testid patterns
        '[data-testid*="file"]',
        '[data-testid*="attachment"]',
        '[data-testid*="upload"]',
        '[data-testid*="image"]',
        // Class patterns
        '[class*="attachment"]',
        '[class*="file-preview"]',
        '[class*="uploaded"]',
        '[class*="thumbnail"]',
        '[class*="FilePreview"]',
        '[class*="ImagePreview"]',
        // Button with close/remove (indicates attached item)
        'button[aria-label*="Remove"]',
        'button[aria-label*="Delete"]',
        // SVG icons that might indicate files
        '[class*="file-icon"]'
      ];
      
      for (const selector of selectors) {
        try {
          const elements = composerArea.querySelectorAll(selector);
          for (const el of elements) {
            // Try to get a unique identifier for this attachment
            const src = el.src || el.getAttribute('data-src') || '';
            const testId = el.getAttribute('data-testid') || '';
            const ariaLabel = el.getAttribute('aria-label') || '';
            const title = el.getAttribute('title') || el.getAttribute('alt') || '';
            const className = el.className || '';
            
            // Skip if this looks like UI chrome, not an attachment
            if (className.includes('icon') && !className.includes('file')) continue;
            if (el.tagName === 'BUTTON' && !ariaLabel.includes('Remove')) continue;
            
            // Generate ID
            let id = src || testId || title || `element-${selector}-${el.outerHTML.slice(0, 50)}`;
            id = id.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 100);
            
            if (id && id.length > 5) {
              currentAttachments.add(id);
              
              if (!this.trackedAttachments.has(id)) {
                // Determine file type and estimate tokens
                let tokens = 1500; // Default for unknown (assume image)
                let name = title || 'attachment';
                
                if (el.tagName === 'IMG' || src.includes('blob:') || className.includes('image') || className.includes('Image')) {
                  // It's an image
                  const width = el.naturalWidth || el.width || 1000;
                  const height = el.naturalHeight || el.height || 1000;
                  tokens = window.TokenCounter ? 
                    window.TokenCounter.estimateImageTokens(width, height) :
                    this.estimateImageTokens(width, height);
                  name = title || 'image';
                } else if (title.match(/\.pdf$/i) || className.includes('pdf')) {
                  tokens = 2000;
                  name = title || 'document.pdf';
                } else if (title.match(/\.(doc|docx|txt|md)$/i)) {
                  tokens = 1000;
                  name = title;
                }
                
                this.trackedAttachments.set(id, {
                  name: name,
                  tokens: tokens,
                  addedAt: Date.now()
                });
                window.CUP.log('ChatUI: Tracked attachment from DOM:', name, tokens);
              }
            }
          }
        } catch (e) {
          // Selector might be invalid, skip
        }
      }
    }
    
    // Strategy 3: Check for remove buttons which indicate attachments exist
    const removeButtons = document.querySelectorAll('button[aria-label*="Remove"], button[aria-label*="remove"], [class*="remove"], [class*="close"][class*="attachment"]');
    if (removeButtons.length > 0 && this.trackedAttachments.size === 0) {
      // There are attachments but we couldn't identify them specifically
      // Add a generic tracker
      for (let i = 0; i < removeButtons.length; i++) {
        const id = `unknown-attachment-${i}`;
        if (!this.trackedAttachments.has(id)) {
          this.trackedAttachments.set(id, {
            name: 'attachment',
            tokens: 1500, // Assume image
            addedAt: Date.now()
          });
          currentAttachments.add(id);
        }
      }
    }
    
    // Clean up old attachments that are no longer in the DOM
    // But give a grace period to avoid flickering
    const now = Date.now();
    for (const [id, data] of this.trackedAttachments) {
      if (!currentAttachments.has(id) && now - data.addedAt > 2000) {
        // Attachment was removed
        this.trackedAttachments.delete(id);
        window.CUP.log('ChatUI: Removed tracked attachment:', data.name);
      }
    }
  }
  
  /**
   * Get total tokens from tracked attachments
   */
  getAttachmentTokens() {
    // First, detect any new attachments
    this.detectAttachments();
    
    let totalTokens = 0;
    let count = 0;
    
    for (const [id, data] of this.trackedAttachments) {
      totalTokens += data.tokens;
      count++;
    }
    
    return { tokens: totalTokens, count: count };
  }
  
  estimateFileTokens(file) {
    if (!file) return 0;
    
    const name = file.name || '';
    const size = file.size || 0;
    const type = file.type || '';
    
    if (type.startsWith('image/') || name.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i)) {
      return 1500; // Default image estimate
    } else if (type === 'application/pdf' || name.match(/\.pdf$/i)) {
      const estimatedPages = Math.max(1, Math.ceil(size / 100000));
      return estimatedPages * 800;
    } else if (type.startsWith('text/') || name.match(/\.(txt|md|csv|json|xml|html|css|js|ts|py)$/i)) {
      return Math.ceil(size / 4);
    } else if (name.match(/\.(doc|docx)$/i)) {
      return Math.ceil(size * 0.8);
    }
    return Math.ceil(size / 6);
  }
  
  estimateImageTokens(width, height) {
    if (!width || !height) return 1500;
    
    const MAX_DIM = 1568;
    let w = width;
    let h = height;
    
    if (w > MAX_DIM || h > MAX_DIM) {
      const scale = MAX_DIM / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    
    const TILE_SIZE = 768;
    const tilesX = Math.ceil(w / TILE_SIZE);
    const tilesY = Math.ceil(h / TILE_SIZE);
    
    return tilesX * tilesY * 765;
  }
  
  startDraftMonitor() {
    if (this.typingInterval) clearInterval(this.typingInterval);
    
    this.typingInterval = setInterval(() => {
      const input = document.querySelector('[contenteditable="true"]');
      if (input) {
        const text = input.innerText || '';
        const textTokens = window.TokenCounter ? 
          window.TokenCounter.estimateTokens(text) : 
          Math.ceil(text.length / 4);
        
        const attachments = this.getAttachmentTokens();
        const totalTokens = textTokens + attachments.tokens;
        
        if (totalTokens !== this.lastDraftTokens || attachments.tokens !== this.attachmentTokens) {
          this.lastDraftTokens = totalTokens;
          this.attachmentTokens = attachments.tokens;
          this.updateDraftDisplay(totalTokens, textTokens, attachments.tokens, attachments.count);
        }
      }
    }, 300);
  }
  
  updateDraftDisplay(totalTokens, textTokens, attachmentTokens, attachmentCount) {
    const el = document.getElementById('cup-draft-tokens');
    if (!el) return;
    
    if (attachmentTokens > 0) {
      el.textContent = totalTokens.toLocaleString();
      el.title = 'Text: ' + textTokens.toLocaleString() + ' + ' + attachmentCount + ' file(s): ~' + attachmentTokens.toLocaleString() + ' tokens';
    } else {
      el.textContent = totalTokens.toLocaleString();
      el.title = 'Estimated tokens in your message';
    }
    
    if (totalTokens >= 32000) {
      el.style.color = '#ef4444';
      el.title += ' - Very large! Consider breaking up.';
    } else if (totalTokens >= 8000) {
      el.style.color = '#f97316';
      el.title += ' - Large message';
    } else if (totalTokens >= 2000) {
      el.style.color = '#eab308';
      el.title += ' - Moderate size';
    } else {
      el.style.color = '#a1a1aa';
    }
  }
  
  /**
   * Clear tracked attachments (call when message is sent)
   */
  clearTrackedAttachments() {
    this.trackedAttachments.clear();
    this.attachmentTokens = 0;
    window.CUP.log('ChatUI: Cleared tracked attachments');
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
    
    this.updateContextUsage();
  }
  
  async updateContextUsage() {
    try {
      let totalTokens = 0;
      let breakdown = [];
      
      if (this.cachedConversationData) {
        totalTokens = this.cachedConversationData.totalTokens || 0;
        
        if (this.cachedConversationData.projectTokens > 0) {
          breakdown.push('Project: ' + this.formatTokens(this.cachedConversationData.projectTokens));
        }
        if (this.cachedConversationData.fileTokens > 0) {
          breakdown.push('Files: ' + this.formatTokens(this.cachedConversationData.fileTokens));
        }
      }
      
      if (totalTokens === 0) {
        const estimate = await this.estimateContextFromDOM();
        totalTokens = estimate.tokens;
        breakdown = estimate.breakdown;
      }
      
      const systemPromptTokens = 5000;
      totalTokens += systemPromptTokens;
      
      const contextLimit = 200000;
      const percent = Math.min(Math.round((totalTokens / contextLimit) * 100), 100);
      
      const pctEl = document.getElementById('cup-context-pct');
      const detailEl = document.getElementById('cup-context-detail');
      
      if (pctEl) {
        pctEl.textContent = percent + '%';
        pctEl.title = this.formatTokens(totalTokens) + ' / ' + this.formatTokens(contextLimit) + ' tokens\n' +
                      'System: ~' + this.formatTokens(systemPromptTokens) + '\n' +
                      breakdown.join('\n');
        this.colorize('cup-context-pct', percent);
      }
      
      if (detailEl) {
        detailEl.textContent = ' (' + this.formatTokens(totalTokens) + ')';
      }
      
    } catch (e) {
      window.CUP.log('Chat context update error:', e);
    }
  }
  
  async estimateContextFromDOM() {
    let totalTokens = 0;
    const breakdown = [];
    
    const messageContainers = document.querySelectorAll('[data-testid*="message"], [class*="Message"]');
    let messageTokens = 0;
    
    for (const container of messageContainers) {
      const textContent = container.innerText || '';
      const tokens = window.TokenCounter ? 
        window.TokenCounter.estimateTokens(textContent) :
        Math.ceil(textContent.length / 4);
      messageTokens += tokens;
    }
    
    if (messageTokens > 0) {
      totalTokens += messageTokens;
      breakdown.push('Messages: ' + this.formatTokens(messageTokens));
    }
    
    const fileElements = document.querySelectorAll('[data-testid*="file"], [class*="attachment"]');
    if (fileElements.length > 0) {
      const fileTokens = fileElements.length * 1000;
      totalTokens += fileTokens;
      breakdown.push('Files: ~' + this.formatTokens(fileTokens) + ' (' + fileElements.length + ' files)');
    }
    
    const projectBadge = document.querySelector('[class*="project"], [data-testid*="project"]');
    if (projectBadge) {
      const projectTokens = 3000;
      totalTokens += projectTokens;
      breakdown.push('Project: ~' + this.formatTokens(projectTokens));
    }
    
    return { tokens: totalTokens, breakdown: breakdown };
  }
  
  formatTokens(num) {
    if (num >= 1000) {
      return Math.round(num / 1000) + 'K';
    }
    return num.toString();
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
