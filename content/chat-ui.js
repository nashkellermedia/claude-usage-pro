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
    
    // Track attachments persistently (backup tracking via events)
    this.trackedAttachments = new Map();
    
    // Start attachment watcher for DOM-based detection
    this.attachmentWatcherInterval = null;
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
      
      // Clear attachments when message sent
      window.APIInterceptor.on('onMessageSent', () => {
        this.clearTrackedAttachments();
      });
    }
    
    // Intercept file additions (backup method)
    this.interceptFileInputs();
    document.addEventListener('paste', (e) => this.handlePaste(e), true);
    document.addEventListener('drop', (e) => this.handleDrop(e), true);
    
    // Start DOM-based attachment watcher
    this.startAttachmentWatcher();
  }
  
  /**
   * DOM-based attachment watcher - primary detection method
   * Scans for visible attachments and estimates their tokens
   */
  startAttachmentWatcher() {
    if (this.attachmentWatcherInterval) {
      clearInterval(this.attachmentWatcherInterval);
    }
    
    window.CUP.log('ChatUI: Attachment watcher started');
    
    this.attachmentWatcherInterval = setInterval(() => {
      this.syncAttachmentsFromDOM();
    }, 500);
  }
  
  /**
   * Synchronize tracked attachments with what's visible in the DOM
   */
  syncAttachmentsFromDOM() {
    const visibleAttachments = this.findVisibleAttachments();
    const visibleCount = visibleAttachments.length;
    const trackedCount = this.trackedAttachments.size;
    
    window.CUP.log('ChatUI: Sync - visible:', visibleCount, 'tracked:', trackedCount);
    
    // If we see attachments in DOM that aren't tracked, add them
    if (visibleCount > 0) {
      for (const att of visibleAttachments) {
        const id = att.id;
        if (!this.trackedAttachments.has(id)) {
          this.trackedAttachments.set(id, {
            name: att.name || 'attachment',
            type: att.type,
            tokens: att.tokens,
            addedAt: Date.now(),
            source: 'dom'
          });
          window.CUP.log('ChatUI: Auto-tracked from DOM:', att.name, att.tokens, 'tokens');
        }
      }
      
      // Remove tracked items that are no longer visible
      const visibleIds = new Set(visibleAttachments.map(a => a.id));
      for (const [id, data] of this.trackedAttachments) {
        if (!visibleIds.has(id)) {
          window.CUP.log('ChatUI: Removing tracked:', data.name, '(', data.tokens, 'tokens)');
          this.trackedAttachments.delete(id);
        }
      }
    } else if (trackedCount > 0) {
      // No visible attachments but we have tracked ones
      // Check if they're stale (added more than 2 seconds ago)
      const now = Date.now();
      let hasStale = false;
      for (const [id, data] of this.trackedAttachments) {
        if (now - data.addedAt > 2000) {
          hasStale = true;
          break;
        }
      }
      if (hasStale) {
        window.CUP.log('ChatUI: Detected attachment removal, clearing tracked');
        this.trackedAttachments.clear();
      }
    }
  }
  
  /**
   * Find all visible attachments in the composer area
   * Returns array of { id, name, type, tokens, element }
   */
  findVisibleAttachments() {
    const attachments = [];
    const composer = document.querySelector('[contenteditable="true"]');
    
    if (!composer) return attachments;
    
    const composerRect = composer.getBoundingClientRect();
    
    // Helper to check if element is near composer
    const isNearComposer = (el) => {
      const rect = el.getBoundingClientRect();
      // Attachment previews appear above the composer input
      return rect.bottom > composerRect.top - 300 && 
             rect.top < composerRect.bottom + 50 &&
             rect.width > 20 && rect.height > 20;
    };
    
    // Strategy 1: Find images with Claude API URLs (uploaded images)
    const apiImages = document.querySelectorAll('img[src*="/api/"][src*="/files/"]');
    for (const img of apiImages) {
      if (isNearComposer(img)) {
        const tokens = this.estimateImageTokens(img.naturalWidth || img.width, img.naturalHeight || img.height);
        const id = `api-img-${img.src.split('/').pop()?.substring(0, 20) || Date.now()}`;
        attachments.push({
          id,
          name: img.alt || 'uploaded image',
          type: 'image',
          tokens,
          element: img
        });
        window.CUP.log('ChatUI: Found API image:', img.naturalWidth, 'x', img.naturalHeight, '=', tokens, 'tokens');
      }
    }
    
    // Strategy 2: Find blob images (during/after upload)
    const blobImages = document.querySelectorAll('img[src^="blob:"]');
    for (const img of blobImages) {
      if (isNearComposer(img)) {
        const tokens = this.estimateImageTokens(img.naturalWidth || img.width, img.naturalHeight || img.height);
        const id = `blob-${img.src.substring(5, 30)}`;
        attachments.push({
          id,
          name: 'pasted image',
          type: 'image',
          tokens,
          element: img
        });
        window.CUP.log('ChatUI: Found blob image:', img.naturalWidth, 'x', img.naturalHeight, '=', tokens, 'tokens');
      }
    }
    
    // Strategy 3: Find data URL images
    const dataImages = document.querySelectorAll('img[src^="data:"]');
    for (const img of dataImages) {
      if (isNearComposer(img)) {
        const tokens = this.estimateImageTokens(img.naturalWidth || img.width, img.naturalHeight || img.height);
        const id = `data-img-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        // Avoid duplicates
        if (!attachments.some(a => a.element === img)) {
          attachments.push({
            id,
            name: 'embedded image',
            type: 'image',
            tokens,
            element: img
          });
        }
      }
    }
    
    // Strategy 4: Look for file preview containers
    const previewContainers = document.querySelectorAll('[data-testid*="file"], [data-testid*="attachment"], [class*="preview"], [class*="Preview"]');
    for (const container of previewContainers) {
      if (!isNearComposer(container)) continue;
      
      // Skip if we already found an image inside this container
      const hasImage = container.querySelector('img');
      if (hasImage && attachments.some(a => a.element === hasImage)) continue;
      
      // Look for file info (non-image files like PDFs, docs)
      const textContent = container.textContent || '';
      const fileName = textContent.trim().substring(0, 50);
      
      if (fileName && !fileName.includes('Add content') && fileName.length > 2) {
        const id = `file-${fileName.replace(/\s+/g, '-').substring(0, 30)}`;
        
        // Estimate tokens based on file type
        let tokens = 1500;
        if (fileName.match(/\.pdf$/i)) {
          tokens = 3000; // Rough estimate for PDF
        } else if (fileName.match(/\.(txt|md|json|csv)$/i)) {
          tokens = 1000;
        } else if (fileName.match(/\.(doc|docx)$/i)) {
          tokens = 2000;
        }
        
        if (!attachments.some(a => a.id === id)) {
          attachments.push({
            id,
            name: fileName,
            type: 'file',
            tokens,
            element: container
          });
          window.CUP.log('ChatUI: Found file preview:', fileName);
        }
      }
    }
    
    // Strategy 5: Look for thumbnail-style previews (small images in attachment bar)
    const thumbnails = document.querySelectorAll('[class*="thumbnail"], [class*="Thumbnail"]');
    for (const thumb of thumbnails) {
      if (!isNearComposer(thumb)) continue;
      
      const img = thumb.querySelector('img');
      if (img && !attachments.some(a => a.element === img)) {
        const tokens = this.estimateImageTokens(img.naturalWidth || 200, img.naturalHeight || 200);
        const id = `thumb-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        attachments.push({
          id,
          name: 'image attachment',
          type: 'image',
          tokens,
          element: img
        });
      }
    }
    
    return attachments;
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
    
    const id = `file-${file.name}-${file.size}`;
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
          type: file.type,
          tokens: tokens,
          addedAt: Date.now(),
          source: 'event'
        });
        
        window.CUP.log('ChatUI: Tracked file:', file.name, width, 'x', height, '=', tokens, 'tokens');
      };
      img.src = url;
      
      // Initial estimate while loading
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
      type: file.type,
      tokens: tokens,
      addedAt: Date.now(),
      source: 'event'
    });
    
    window.CUP.log('ChatUI: Tracked file:', file.name, tokens, 'tokens');
  }
  
  estimateImageTokensFromSize(size) {
    const estimatedPixels = Math.sqrt(size * 10);
    return this.estimateImageTokens(estimatedPixels, estimatedPixels);
  }
  
  estimateImageTokens(width, height) {
    if (!width || !height || width < 10 || height < 10) {
      // Default for unknown dimensions
      return 1500;
    }
    
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
    
    const tokens = tilesX * tilesY * 765;
    window.CUP.log('ChatUI: Image', width, 'x', height, '=', tokens, 'tokens');
    return tokens;
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
            <span class="cup-stat-value" id="cup-files-count">0</span>
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
        // Get text and trim whitespace, also filter out placeholder text
        let text = input.innerText || '';
        text = text.trim();
        
        // Ignore common placeholder patterns
        if (text.match(/^(Reply to Claude|Type a message|Ask Claude|How can I help|Message Claude)/i)) {
          text = '';
        }
        
        const textTokens = text.length > 0 && window.TokenCounter ? 
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
    const filesEl = document.getElementById('cup-files-count');
    
    if (draftEl) {
      draftEl.textContent = totalTokens.toLocaleString();
      
      if (attachmentTokens > 0) {
        draftEl.title = 'Text: ' + textTokens.toLocaleString() + ' + Files: ~' + attachmentTokens.toLocaleString() + ' tokens';
      } else {
        draftEl.title = 'Estimated tokens in your message';
      }
      
      if (totalTokens >= 32000) {
        draftEl.style.color = '#ef4444';
      } else if (totalTokens >= 8000) {
        draftEl.style.color = '#f97316';
      } else if (totalTokens >= 2000) {
        draftEl.style.color = '#eab308';
      } else {
        draftEl.style.color = '#a1a1aa';
      }
    }
    
    if (filesEl) {
      filesEl.textContent = attachmentCount;
      filesEl.title = attachmentCount > 0 
        ? `${attachmentCount} file(s) attached (~${attachmentTokens.toLocaleString()} tokens)`
        : 'No files attached';
      
      if (attachmentCount > 0) {
        filesEl.style.color = '#60a5fa';
      } else {
        filesEl.style.color = '#a1a1aa';
      }
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
    
    this.updateContextUsage();
  }
  
  checkAndReinject() {
    if (!document.getElementById('cup-input-stats')) {
      this.injectInputStats();
    }
  }
}

window.ChatUI = ChatUI;
window.CUP.log('ChatUI loaded');
