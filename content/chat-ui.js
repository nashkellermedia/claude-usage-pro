/**
 * Claude Usage Pro - Chat UI
 * Stats bar below chat input with attachment tracking and color coding
 */

class ChatUI {
  constructor() {
    this.inputStats = null;
    this.initialized = false;
    this.lastDraftTokens = 0;
    this.lastAttachmentCount = 0;
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
      
      // Clear attachments when message is sent
      window.APIInterceptor.on('onMessageSent', () => {
        this.clearTrackedAttachments();
      });
    }
    
    // Intercept file additions
    this.interceptFileInputs();
    document.addEventListener('paste', (e) => this.handlePaste(e), true);
    document.addEventListener('drop', (e) => this.handleDrop(e), true);
    
    // Start watching for attachment changes (additions AND removals)
    this.startAttachmentWatcher();
  }
  
  /**
   * Watch for attachment changes every 200ms
   * This catches when user clicks X to remove an attachment
   */
  startAttachmentWatcher() {
    setInterval(() => {
      this.syncAttachmentsWithDOM();
    }, 200);
    
    window.CUP.log('ChatUI: Attachment watcher started');
  }
  
  /**
   * Sync tracked attachments with what's visible in DOM
   * If visible count decreases, remove tracked attachments
   */
  syncAttachmentsWithDOM() {
    const visibleCount = this.countVisibleAttachments();
    const trackedCount = this.trackedAttachments.size;
    
    // If visible count is less than tracked, some were removed
    if (visibleCount < trackedCount) {
      const toRemove = trackedCount - visibleCount;
      window.CUP.log('ChatUI: Detected', toRemove, 'attachment(s) removed');
      
      // Remove oldest tracked attachments (FIFO order)
      const sorted = Array.from(this.trackedAttachments.entries())
        .sort((a, b) => a[1].addedAt - b[1].addedAt);
      
      for (let i = 0; i < toRemove && i < sorted.length; i++) {
        const [id, data] = sorted[i];
        window.CUP.log('ChatUI: Removing tracked:', data.name, '(', data.tokens, 'tokens)');
        this.trackedAttachments.delete(id);
      }
    }
    
    // If no visible attachments and tracked ones are older than 2 seconds, clear all
    if (visibleCount === 0 && trackedCount > 0) {
      const now = Date.now();
      let hasRecent = false;
      for (const [id, data] of this.trackedAttachments) {
        if (now - data.addedAt < 2000) {
          hasRecent = true;
          break;
        }
      }
      if (!hasRecent) {
        window.CUP.log('ChatUI: No visible attachments, clearing all tracked');
        this.trackedAttachments.clear();
      }
    }
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
    
    // Use unique ID with timestamp to avoid duplicates
    const id = `${file.name}-${file.size}-${file.type}-${Date.now()}`;
    
    let tokens = 1500;
    
    if (file.type.startsWith('image/')) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        URL.revokeObjectURL(url);
        
        const calculatedTokens = this.estimateImageTokens(width, height);
        
        // Update tracked attachment with accurate token count
        if (this.trackedAttachments.has(id)) {
          const data = this.trackedAttachments.get(id);
          data.tokens = calculatedTokens;
          this.trackedAttachments.set(id, data);
        }
        
        window.CUP.log('ChatUI: Image', width, 'x', height, '=', calculatedTokens, 'tokens');
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
            <span class="cup-stat-icon">📎</span>
            <span class="cup-stat-label">Files:</span>
            <span class="cup-stat-value" id="cup-attachment-count">0</span>
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
   */
  countVisibleAttachments() {
    let count = 0;
    const composer = document.querySelector('[contenteditable="true"]');
    if (!composer) return 0;
    
    const composerRect = composer.getBoundingClientRect();
    
    // Strategy 1: Claude API image URLs (uploaded images)
    const apiImages = document.querySelectorAll('img[src*="/api/"][src*="/files/"]');
    for (const img of apiImages) {
      const imgRect = img.getBoundingClientRect();
      if (imgRect.bottom > composerRect.top - 300 && imgRect.top < composerRect.bottom + 50) {
        count++;
      }
    }
    
    // Strategy 2: Blob images (during upload)
    const blobImages = document.querySelectorAll('img[src^="blob:"]');
    for (const img of blobImages) {
      const imgRect = img.getBoundingClientRect();
      if (imgRect.bottom > composerRect.top - 300 && imgRect.top < composerRect.bottom + 50) {
        count++;
      }
    }
    
    // Strategy 3: File preview containers
    const previews = document.querySelectorAll('[data-testid*="file"], [data-testid*="attachment"], [data-testid*="preview"], [class*="attachment"], [class*="file-preview"]');
    for (const preview of previews) {
      const previewRect = preview.getBoundingClientRect();
      if (previewRect.bottom > composerRect.top - 300 && previewRect.top < composerRect.bottom + 50) {
        if (!preview.querySelector('img[src*="/api/"]') && !preview.querySelector('img[src^="blob:"]')) {
          count++;
        }
      }
    }
    
    return count;
  }
  
  getAttachmentTokens() {
    let totalTokens = 0;
    let count = 0;
    
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
        
        if (totalTokens !== this.lastDraftTokens || attachments.count !== this.lastAttachmentCount) {
          this.lastDraftTokens = totalTokens;
          this.lastAttachmentCount = attachments.count;
          this.updateDraftDisplay(totalTokens, textTokens, attachments.tokens, attachments.count);
        }
      }
    }, 300);
  }
  
  updateDraftDisplay(totalTokens, textTokens, attachmentTokens, attachmentCount) {
    const draftEl = document.getElementById('cup-draft-tokens');
    const attachEl = document.getElementById('cup-attachment-count');
    
    if (draftEl) {
      draftEl.textContent = totalTokens.toLocaleString();
      draftEl.title = 'Text: ' + textTokens.toLocaleString() + (attachmentTokens > 0 ? ' + Files: ~' + attachmentTokens.toLocaleString() : '');
      
      if (totalTokens >= 32000) {
        draftEl.style.color = '#ef4444';
      } else if (totalTokens >= 8000) {
        draftEl.style.color = '#f59e0b';
      } else {
        draftEl.style.color = '';
      }
    }
    
    if (attachEl) {
      if (attachmentCount > 0) {
        attachEl.textContent = attachmentCount + ' (~' + attachmentTokens.toLocaleString() + ' tokens)';
        attachEl.style.color = '#a855f7';
      } else {
        attachEl.textContent = '0';
        attachEl.style.color = '';
      }
    }
  }
  
  updateContextUsage() {
    const contextEl = document.getElementById('cup-context-pct');
    const detailEl = document.getElementById('cup-context-detail');
    
    if (!contextEl) return;
    
    const MAX_CONTEXT = 200000;
    const totalTokens = this.conversationTokens + this.lastDraftTokens;
    const percent = Math.round((totalTokens / MAX_CONTEXT) * 100);
    
    contextEl.textContent = percent + '%';
    
    if (detailEl) {
      detailEl.textContent = '(' + totalTokens.toLocaleString() + '/' + MAX_CONTEXT.toLocaleString() + ')';
    }
    
    if (percent >= 90) {
      contextEl.style.color = '#ef4444';
    } else if (percent >= 70) {
      contextEl.style.color = '#f59e0b';
    } else {
      contextEl.style.color = '#22c55e';
    }
  }
  
  updateUsage(usageData) {
    this.currentUsageData = usageData;
    
    // Session
    const sessionEl = document.getElementById('cup-session-pct');
    if (sessionEl && usageData.currentSession) {
      sessionEl.textContent = usageData.currentSession.percent + '%';
      const pct = usageData.currentSession.percent;
      if (pct >= 90) sessionEl.style.color = '#ef4444';
      else if (pct >= 70) sessionEl.style.color = '#f59e0b';
      else sessionEl.style.color = '#22c55e';
    }
    
    // Weekly All
    const weeklyAllEl = document.getElementById('cup-weekly-all-pct');
    if (weeklyAllEl && usageData.weeklyAllModels) {
      weeklyAllEl.textContent = usageData.weeklyAllModels.percent + '%';
      const pct = usageData.weeklyAllModels.percent;
      if (pct >= 90) weeklyAllEl.style.color = '#ef4444';
      else if (pct >= 70) weeklyAllEl.style.color = '#f59e0b';
      else weeklyAllEl.style.color = '#22c55e';
    }
    
    // Timer
    const timerEl = document.getElementById('cup-reset-timer');
    if (timerEl && usageData.currentSession?.resetsIn) {
      timerEl.textContent = usageData.currentSession.resetsIn;
    }
    
    this.updateContextUsage();
  }
}

window.ChatUI = ChatUI;
window.CUP.log('ChatUI loaded');
