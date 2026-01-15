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
    this.cachedConversationData = null;
    
    // Track attachments persistently
    this.trackedAttachments = new Map();
  }
  
  initialize() {
    window.CUP.log('ChatUI: Initializing...');
    this.initialized = true;
    
    if (window.APIInterceptor) {
      window.APIInterceptor.on('onConversationLoaded', (data) => {
        this.cachedConversationData = data;
        this.conversationTokens = data.totalTokens || 0;
        window.CUP.log('ChatUI: Conversation loaded, tokens:', this.conversationTokens);
        this.updateContextUsage();
      });
    }
    
    // Intercept file additions
    this.interceptFileInputs();
    document.addEventListener('paste', (e) => this.handlePaste(e), true);
    document.addEventListener('drop', (e) => this.handleDrop(e), true);
  }
  
  interceptFileInputs() {
    const self = this;
    setInterval(() => {
      const fileInputs = document.querySelectorAll('input[type="file"]');
      for (const input of fileInputs) {
        if (input.files && input.files.length > 0 && !input._cupTracked) {
          input._cupTracked = true;
          for (const file of input.files) {
            self.trackFile(file);
          }
          const checkCleared = setInterval(() => {
            if (!input.files || input.files.length === 0) {
              clearInterval(checkCleared);
              input._cupTracked = false;
            }
          }, 100);
        }
      }
    }, 200);
    
    window.CUP.log('ChatUI: File input interception active');
  }
  
  handlePaste(e) {
    if (e.clipboardData && e.clipboardData.files) {
      for (const file of e.clipboardData.files) {
        this.trackFile(file);
        window.CUP.log('ChatUI: Tracked pasted file:', file.name || 'clipboard image');
      }
    }
  }
  
  handleDrop(e) {
    if (e.dataTransfer && e.dataTransfer.files) {
      for (const file of e.dataTransfer.files) {
        this.trackFile(file);
        window.CUP.log('ChatUI: Tracked dropped file:', file.name);
      }
    }
  }
  
  trackFile(file) {
    if (!file) return;
    
    const id = `${file.name}-${file.size}-${file.type}`;
    if (this.trackedAttachments.has(id)) return;
    
    let tokens = 1500;
    
    if (file.type.startsWith('image/')) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        URL.revokeObjectURL(url);
        
        tokens = this.estimateImageTokens(width, height);
        this.trackedAttachments.set(id, {
          name: file.name || 'image',
          size: file.size,
          type: file.type,
          tokens: tokens,
          addedAt: Date.now()
        });
        
        window.CUP.log('ChatUI: Image dimensions:', width, 'x', height, '=', tokens, 'tokens');
      };
      img.src = url;
      tokens = this.estimateImageTokensFromSize(file.size);
    } else if (file.type === 'application/pdf') {
      const pages = Math.max(1, Math.ceil(file.size / 100000));
      tokens = pages * 800;
    } else if (file.type.startsWith('text/') || file.name?.match(/\.(txt|md|json|csv|xml|html|css|js|ts|py)$/i)) {
      tokens = Math.ceil(file.size / 4);
    } else {
      tokens = Math.ceil(file.size / 4);
    }
    
    this.trackedAttachments.set(id, {
      name: file.name || 'file',
      size: file.size,
      type: file.type,
      tokens: tokens,
      addedAt: Date.now()
    });
    
    window.CUP.log('ChatUI: Tracked file:', file.name, tokens, 'tokens');
  }
  
  estimateImageTokensFromSize(size) {
    const estimatedPixels = Math.sqrt(size * 10);
    return this.estimateImageTokens(estimatedPixels, estimatedPixels);
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
   * Count attachments visible in the composer area
   * Uses multiple strategies to find them
   */
  countVisibleAttachments() {
    let count = 0;
    
    // Strategy 1: Look for images with Claude API URLs (uploaded images)
    const apiImages = document.querySelectorAll('img[src*="/api/"][src*="/files/"]');
    for (const img of apiImages) {
      // Make sure it's not in the message history (check if near contenteditable)
      const composer = document.querySelector('[contenteditable="true"]');
      if (composer) {
        // Check if this image is in the same general area as the composer
        const composerRect = composer.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();
        
        // Image should be above or at same level as composer (not way below in history)
        if (imgRect.bottom > composerRect.top - 200 && imgRect.top < composerRect.bottom + 100) {
          count++;
          window.CUP.log('ChatUI: Found API image attachment');
        }
      }
    }
    
    // Strategy 2: Look for blob images (during upload)
    const blobImages = document.querySelectorAll('img[src^="blob:"]');
    count += blobImages.length;
    
    // Strategy 3: Look for file preview containers with specific data-testid
    const previews = document.querySelectorAll('[data-testid*="file"], [data-testid*="attachment"], [data-testid*="preview"]');
    for (const preview of previews) {
      const composer = document.querySelector('[contenteditable="true"]');
      if (composer) {
        const composerRect = composer.getBoundingClientRect();
        const previewRect = preview.getBoundingClientRect();
        if (previewRect.bottom > composerRect.top - 200 && previewRect.top < composerRect.bottom + 100) {
          // Avoid double counting if we already found an image
          if (!preview.querySelector('img[src*="/api/"]') && !preview.querySelector('img[src^="blob:"]')) {
            count++;
          }
        }
      }
    }
    
    return count;
  }
  
  getAttachmentTokens() {
    let totalTokens = 0;
    let count = 0;
    
    // Check if visible attachments match our tracked count
    const visibleCount = this.countVisibleAttachments();
    
    // If we see no attachments and our tracked ones are old, clear them
    if (visibleCount === 0 && this.trackedAttachments.size > 0) {
      const now = Date.now();
      let allOld = true;
      for (const [id, data] of this.trackedAttachments) {
        if (now - data.addedAt < 5000) {
          allOld = false;
          break;
        }
      }
      if (allOld) {
        window.CUP.log('ChatUI: No visible attachments, clearing old tracked ones');
        this.trackedAttachments.clear();
      }
    }
    
    for (const [id, data] of this.trackedAttachments) {
      totalTokens += data.tokens;
      count++;
    }
    
    return { tokens: totalTokens, count: count };
  }
  
  clearTrackedAttachments() {
    this.trackedAttachments.clear();
    window.CUP.log('ChatUI: Cleared tracked attachments (message sent)');
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
        
        if (totalTokens !== this.lastDraftTokens) {
          this.lastDraftTokens = totalTokens;
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
    } else if (totalTokens >= 8000) {
      el.style.color = '#f97316';
    } else if (totalTokens >= 2000) {
      el.style.color = '#eab308';
    } else {
      el.style.color = '#a1a1aa';
    }
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
