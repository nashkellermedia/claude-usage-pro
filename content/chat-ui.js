/**
 * Claude Usage Pro - Chat UI
 * Stats bar below chat input with attachment tracking and color coding
 * Now with accurate Anthropic API token counting!
 */

class ChatUI {
  constructor() {
    this.inputStats = null;
    this.initialized = false;
    this.lastDraftTokens = 0;
    this.lastAttachmentCount = 0;
    this.typingInterval = null;
    this.currentUsageData = null;
    
    // Track attachments via events only
    this.trackedAttachments = new Map();
    
    // Token counting state
    this.lastText = '';
    this.pendingTokenCount = null;
    this.tokenCountDebounce = null;
    this.useAccurateCount = false; // Will be set based on API key availability
  }
  
  initialize() {
    window.CUP.log('ChatUI: Initializing...');
    this.initialized = true;
    
    // Check if accurate token counting is available
    this.checkTokenCountingAvailable();
    
    if (window.APIInterceptor) {
      // Clear attachments when message sent
      window.APIInterceptor.on('onMessageSent', () => {
        this.clearTrackedAttachments();
      });
    }
    
    // Track file additions via events
    this.interceptFileInputs();
    document.addEventListener('paste', (e) => this.handlePaste(e), true);
    document.addEventListener('drop', (e) => this.handleDrop(e), true);
  }
  
  async checkTokenCountingAvailable() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      this.useAccurateCount = !!(response?.settings?.anthropicApiKey);
      window.CUP.log('ChatUI: Accurate token counting:', this.useAccurateCount ? 'ENABLED' : 'disabled (no API key)');
    } catch (e) {
      this.useAccurateCount = false;
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
        }
      }
    }, 500);
    
    window.CUP.log('ChatUI: File input interception active');
  }
  
  handlePaste(e) {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      for (const file of e.clipboardData.files) {
        this.trackFile(file);
        window.CUP.log('ChatUI: Tracked pasted file:', file.name || 'clipboard image');
      }
    }
  }
  
  handleDrop(e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
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
          addedAt: Date.now()
        });
        
        window.CUP.log('ChatUI: Tracked image:', file.name, width, 'x', height, '=', tokens, 'tokens');
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
    if (!width || !height || width < 10 || height < 10) {
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
            <span class="cup-accuracy-indicator" id="cup-accuracy" title="Estimated">~</span>
          </span>
          <span class="cup-stat-divider">│</span>
          <span class="cup-stat-item">
            <span class="cup-stat-icon">📎</span>
            <span class="cup-stat-label">Files:</span>
            <span class="cup-stat-value" id="cup-files-count">0</span>
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
  
  // Get accurate token count from Anthropic API
  async getAccurateTokenCount(text) {
    if (!text || text.length === 0) return 0;
    
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'COUNT_TOKENS', 
        text: text 
      });
      
      if (response?.tokens) {
        return response.tokens;
      }
    } catch (e) {
      window.CUP.log('ChatUI: Token count API error:', e.message);
    }
    
    // Fallback to estimate
    return Math.ceil(text.length / 4);
  }
  
  // Debounced accurate token counting
  scheduleAccurateCount(text) {
    if (this.tokenCountDebounce) {
      clearTimeout(this.tokenCountDebounce);
    }
    
    // Show estimate immediately with ~ indicator
    const estimate = Math.ceil(text.length / 4);
    this.updateDraftDisplay(estimate + this.getAttachmentTokens().tokens, estimate, this.getAttachmentTokens().tokens, this.getAttachmentTokens().count, false);
    
    // Schedule accurate count after 500ms of no typing
    this.tokenCountDebounce = setTimeout(async () => {
      if (text === this.lastText) {
        const accurate = await this.getAccurateTokenCount(text);
        const attachments = this.getAttachmentTokens();
        this.updateDraftDisplay(accurate + attachments.tokens, accurate, attachments.tokens, attachments.count, true);
        window.CUP.log('ChatUI: Accurate count:', accurate, 'tokens');
      }
    }, 500);
  }
  
  startDraftMonitor() {
    if (this.typingInterval) clearInterval(this.typingInterval);
    
    this.typingInterval = setInterval(() => {
      const input = document.querySelector('[contenteditable="true"]');
      if (input) {
        let text = input.innerText || '';
        text = text.trim();
        
        // Ignore common placeholder patterns
        if (text.match(/^(Reply to Claude|Type a message|Ask Claude|How can I help|Message Claude)/i)) {
          text = '';
        }
        
        // Only process if text changed
        if (text !== this.lastText) {
          this.lastText = text;
          
          if (this.useAccurateCount && text.length > 0) {
            // Use accurate API counting with debounce
            this.scheduleAccurateCount(text);
          } else {
            // Use estimate
            const textTokens = text.length > 0 ? Math.ceil(text.length / 4) : 0;
            const attachments = this.getAttachmentTokens();
            const totalTokens = textTokens + attachments.tokens;
            
            if (totalTokens !== this.lastDraftTokens || attachments.count !== this.lastAttachmentCount) {
              this.lastDraftTokens = totalTokens;
              this.lastAttachmentCount = attachments.count;
              this.updateDraftDisplay(totalTokens, textTokens, attachments.tokens, attachments.count, false);
            }
          }
        }
      }
    }, 300);
  }
  
  updateDraftDisplay(totalTokens, textTokens, attachmentTokens, attachmentCount, isAccurate) {
    const draftEl = document.getElementById('cup-draft-tokens');
    const filesEl = document.getElementById('cup-files-count');
    const accuracyEl = document.getElementById('cup-accuracy');
    
    if (draftEl) {
      draftEl.textContent = totalTokens.toLocaleString();
      
      if (attachmentTokens > 0) {
        draftEl.title = 'Text: ' + textTokens.toLocaleString() + ' + Files: ~' + attachmentTokens.toLocaleString() + ' tokens';
      } else {
        draftEl.title = isAccurate ? 'Accurate token count via Anthropic API' : 'Estimated tokens (~4 chars per token)';
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
    
    // Update accuracy indicator
    if (accuracyEl) {
      if (isAccurate) {
        accuracyEl.textContent = '✓';
        accuracyEl.title = 'Accurate (via Anthropic API)';
        accuracyEl.style.color = '#22c55e';
      } else {
        accuracyEl.textContent = '~';
        accuracyEl.title = 'Estimated (~4 chars per token)';
        accuracyEl.style.color = '#6b7280';
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
    
    this.lastDraftTokens = totalTokens;
    this.lastAttachmentCount = attachmentCount;
  }
  
  updateUsage(usageData) {
    if (!usageData) return;
    this.currentUsageData = usageData;
    
    // Session percentage
    const sessionEl = document.getElementById('cup-session-pct');
    if (sessionEl && usageData.currentSession) {
      sessionEl.textContent = usageData.currentSession.percent + '%';
      const pct = usageData.currentSession.percent;
      if (pct >= 90) sessionEl.style.color = '#ef4444';
      else if (pct >= 70) sessionEl.style.color = '#f59e0b';
      else sessionEl.style.color = '#22c55e';
    }
    
    // Reset timer
    const resetEl = document.getElementById('cup-reset-timer');
    if (resetEl) {
      const resetTime = usageData.currentSession?.resetsIn || '--';
      resetEl.textContent = resetTime;
      
      if (resetTime === '--') {
        resetEl.title = 'Visit Settings > Usage to sync reset time';
        resetEl.style.cursor = 'pointer';
        resetEl.style.textDecoration = 'underline';
        resetEl.onclick = () => window.open('https://claude.ai/settings/usage', '_blank');
      } else {
        resetEl.title = 'Session resets in ' + resetTime;
        resetEl.style.cursor = 'default';
        resetEl.style.textDecoration = 'none';
        resetEl.onclick = null;
      }
    }
    
    // Weekly All Models
    const weeklyAllEl = document.getElementById('cup-weekly-all-pct');
    if (weeklyAllEl && usageData.weeklyAllModels) {
      weeklyAllEl.textContent = usageData.weeklyAllModels.percent + '%';
      const pct = usageData.weeklyAllModels.percent;
      if (pct >= 90) weeklyAllEl.style.color = '#ef4444';
      else if (pct >= 70) weeklyAllEl.style.color = '#f59e0b';
      else weeklyAllEl.style.color = '#22c55e';
    }
    
    // Weekly Sonnet
    const weeklySonnetEl = document.getElementById('cup-weekly-sonnet-pct');
    if (weeklySonnetEl && usageData.weeklySonnet) {
      weeklySonnetEl.textContent = usageData.weeklySonnet.percent + '%';
      const pct = usageData.weeklySonnet.percent;
      if (pct >= 90) weeklySonnetEl.style.color = '#ef4444';
      else if (pct >= 70) weeklySonnetEl.style.color = '#f59e0b';
      else weeklySonnetEl.style.color = '#a855f7';  // Purple for Sonnet
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
