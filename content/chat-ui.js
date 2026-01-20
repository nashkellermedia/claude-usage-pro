/**
 * Claude Usage Pro - Chat UI
 * Stats bar below chat input with attachment tracking
 */

class ChatUI {
  constructor() {
    this.inputStats = null;
    this.initialized = false;
    this.lastDraftTokens = 0;
    this.manualAttachmentCount = 0;  // Manual override for attachments
    this.manualAttachmentTokens = 0;
    this.typingInterval = null;
    this.currentUsageData = null;
    
    // Token counting state
    this.lastText = '';
    this.tokenCountDebounce = null;
    this.useAccurateCount = false;
    this.lastAccurateTextTokens = 0;
  }
  
  initialize() {
    window.CUP.log('ChatUI: Initializing...');
    this.initialized = true;
    this.checkTokenCountingAvailable();
  }
  
  async checkTokenCountingAvailable() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      this.useAccurateCount = !!(response?.settings?.anthropicApiKey);
      window.CUP.log('ChatUI: Accurate token counting:', this.useAccurateCount ? 'ENABLED' : 'disabled');
    } catch (e) {
      this.useAccurateCount = false;
    }
  }
  
  /**
   * Find attachments in the composer area - ULTRA CONSERVATIVE
   * Only detect things we are 100% certain are attachments
   */
  findAttachments() {
    const attachments = [];
    
    // Find the composer
    const composer = document.querySelector('[contenteditable="true"]');
    if (!composer) return attachments;
    
    const composerRect = composer.getBoundingClientRect();
    
    // Find the form container
    let form = composer.closest('form');
    if (!form) {
      // Walk up to find form
      let el = composer;
      for (let i = 0; i < 10; i++) {
        if (!el.parentElement) break;
        el = el.parentElement;
        if (el.tagName === 'FORM') {
          form = el;
          break;
        }
      }
    }
    if (!form) return attachments;
    
    // Helper: is element actually visible and in composer area
    const isValidAttachment = (el) => {
      if (!el) return false;
      
      // Must be visible
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      
      const rect = el.getBoundingClientRect();
      
      // Must have real size
      if (rect.width < 20 || rect.height < 20) return false;
      
      // Must be above the composer text (attachments appear above where you type)
      // and within reasonable bounds
      if (rect.bottom > composerRect.top + 20) return false;  // Must be ABOVE composer
      if (rect.top < composerRect.top - 200) return false;    // Not too far up
      
      return true;
    };
    
    // METHOD 1: Images with Claude API file URLs - these are DEFINITELY uploads
    const apiImages = form.querySelectorAll('img[src*="/api/"][src*="/files/"]');
    for (const img of apiImages) {
      if (isValidAttachment(img)) {
        const tokens = this.estimateImageTokens(img.naturalWidth || img.width || 400, img.naturalHeight || img.height || 400);
        attachments.push({
          id: img.src,
          name: 'uploaded image',
          type: 'image',
          tokens
        });
        window.CUP.log('ChatUI: Found API image attachment');
      }
    }
    
    // METHOD 2: Blob images that have an X/remove button as a DIRECT sibling or parent sibling
    const blobImages = form.querySelectorAll('img[src^="blob:"]');
    for (const img of blobImages) {
      if (!isValidAttachment(img)) continue;
      
      // Must have a remove button very close (sibling or parent's sibling)
      let hasRemove = false;
      
      // Check siblings
      const parent = img.parentElement;
      if (parent) {
        const buttons = parent.querySelectorAll('button');
        for (const btn of buttons) {
          const label = (btn.getAttribute('aria-label') || '').toLowerCase();
          if (label.includes('remove') || label.includes('delete') || label.includes('close')) {
            hasRemove = true;
            break;
          }
        }
      }
      
      if (hasRemove) {
        const tokens = this.estimateImageTokens(img.naturalWidth || img.width || 400, img.naturalHeight || img.height || 400);
        attachments.push({
          id: img.src,
          name: 'pasted image',
          type: 'image',
          tokens
        });
        window.CUP.log('ChatUI: Found blob image with remove button');
      }
    }
    
    // METHOD 3: ONLY elements with data-testid containing "attachment" (very specific)
    // DO NOT use class*="attachment" as this matches too many things
    const attachmentTestIds = form.querySelectorAll('[data-testid*="attachment"]');
    for (const el of attachmentTestIds) {
      if (!isValidAttachment(el)) continue;
      
      // Look for filename with extension in text content
      const text = el.textContent || '';
      const fileMatch = text.match(/([^\s\/\\<>]+\.(pdf|txt|md|csv|json|doc|docx|xlsx|py|js|ts|html|css|xml))/i);
      if (fileMatch) {
        const fileName = fileMatch[1];
        if (!attachments.some(a => a.name === fileName)) {
          const ext = fileMatch[2].toLowerCase();
          let tokens = 1500;
          if (ext === 'pdf') tokens = 3000;
          else if (['txt', 'md', 'csv', 'json'].includes(ext)) tokens = 1000;
          else if (['doc', 'docx'].includes(ext)) tokens = 2000;
          
          attachments.push({
            id: `file-${fileName}`,
            name: fileName,
            type: 'file',
            tokens
          });
          window.CUP.log('ChatUI: Found file via data-testid:', fileName);
        }
      }
    }
    
    return attachments;
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
  
  clearManualAttachments() {
    this.manualAttachmentCount = 0;
    this.manualAttachmentTokens = 0;
    window.CUP.log('ChatUI: Manually cleared attachments');
    
    // Force UI update
    const textTokens = this.lastAccurateTextTokens || 0;
    this.updateDraftDisplay(textTokens, textTokens, 0, 0, this.useAccurateCount);
  }
  
  async injectUI() {
    await this.injectInputStats();
    this.startDraftMonitor();
  }
  
  async injectInputStats() {
    if (document.getElementById('cup-input-stats')) return;
    
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
            <span class="cup-clear-files" id="cup-clear-files" title="Clear file count" style="display:none; cursor:pointer; margin-left:2px; font-size:10px; color:#888;">✕</span>
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
          if (container.parentElement) container = container.parentElement;
        }
        
        if (container && container.parentElement) {
          container.parentElement.insertBefore(this.inputStats, container.nextSibling);
          window.CUP.log('ChatUI: Input stats injected');
          
          // Add click handler for clear button
          const clearBtn = document.getElementById('cup-clear-files');
          if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.clearManualAttachments();
            });
          }
          
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
    
    return Math.ceil(text.length / 4);
  }
  
  scheduleAccurateCount(text) {
    if (this.tokenCountDebounce) {
      clearTimeout(this.tokenCountDebounce);
    }
    
    // Show estimate immediately
    const estimate = Math.ceil(text.length / 4);
    const attachments = this.findAttachments();
    const attachmentTokens = attachments.reduce((sum, a) => sum + a.tokens, 0);
    this.updateDraftDisplay(estimate + attachmentTokens, estimate, attachmentTokens, attachments.length, false);
    
    // Get accurate count after typing stops
    this.tokenCountDebounce = setTimeout(async () => {
      if (text === this.lastText) {
        const accurate = await this.getAccurateTokenCount(text);
        this.lastAccurateTextTokens = accurate;
        const attachments = this.findAttachments();
        const attachmentTokens = attachments.reduce((sum, a) => sum + a.tokens, 0);
        const isFullyAccurate = attachments.length === 0;
        this.updateDraftDisplay(accurate + attachmentTokens, accurate, attachmentTokens, attachments.length, isFullyAccurate);
        window.CUP.log('ChatUI: Accurate text count:', accurate);
      }
    }, 500);
  }
  
  startDraftMonitor() {
    if (this.typingInterval) clearInterval(this.typingInterval);
    
    this.typingInterval = setInterval(() => {
      const input = document.querySelector('[contenteditable="true"]');
      if (!input) return;
      
      let text = input.innerText || '';
      text = text.trim();
      
      // Ignore placeholder text
      if (text.match(/^(Reply to Claude|Type a message|Ask Claude|How can I help|Message Claude)/i)) {
        text = '';
      }
      
      // Get current attachments from DOM (or use manual override if set)
      const detectedAttachments = this.findAttachments();
      const attachmentCount = this.manualAttachmentCount > 0 ? 0 : detectedAttachments.length;
      const attachmentTokens = this.manualAttachmentCount > 0 ? 0 : detectedAttachments.reduce((sum, a) => sum + a.tokens, 0);
      
      const textChanged = text !== this.lastText;
      
      if (textChanged || attachmentCount !== this.lastAttachmentCount) {
        this.lastText = text;
        this.lastAttachmentCount = attachmentCount;
        
        if (this.useAccurateCount && text.length > 0) {
          this.scheduleAccurateCount(text);
        } else {
          const textTokens = text.length > 0 ? Math.ceil(text.length / 4) : 0;
          this.lastAccurateTextTokens = textTokens;
          this.updateDraftDisplay(textTokens + attachmentTokens, textTokens, attachmentTokens, attachmentCount, false);
        }
      }
    }, 500);
  }
  
  updateDraftDisplay(totalTokens, textTokens, attachmentTokens, attachmentCount, isAccurate) {
    const draftEl = document.getElementById('cup-draft-tokens');
    const filesEl = document.getElementById('cup-files-count');
    const accuracyEl = document.getElementById('cup-accuracy');
    const clearBtn = document.getElementById('cup-clear-files');
    
    if (draftEl) {
      draftEl.textContent = totalTokens.toLocaleString();
      
      if (attachmentTokens > 0) {
        draftEl.title = `Text: ${textTokens.toLocaleString()} + Files: ~${attachmentTokens.toLocaleString()} tokens`;
      } else {
        draftEl.title = isAccurate ? 'Accurate count via Anthropic API' : 'Estimated (~4 chars/token)';
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
    
    if (accuracyEl) {
      if (isAccurate) {
        accuracyEl.textContent = '✓';
        accuracyEl.title = 'Accurate (via Anthropic API)';
        accuracyEl.style.color = '#22c55e';
      } else {
        accuracyEl.textContent = '~';
        accuracyEl.title = attachmentCount > 0 
          ? 'Estimated (files are always approximate)'
          : 'Estimated (~4 chars/token)';
        accuracyEl.style.color = '#6b7280';
      }
    }
    
    if (filesEl) {
      filesEl.textContent = attachmentCount;
      filesEl.title = attachmentCount > 0 
        ? `${attachmentCount} file(s) (~${attachmentTokens.toLocaleString()} tokens)`
        : 'No files attached';
      filesEl.style.color = attachmentCount > 0 ? '#60a5fa' : '#a1a1aa';
    }
    
    // Show/hide clear button
    if (clearBtn) {
      clearBtn.style.display = attachmentCount > 0 ? 'inline' : 'none';
    }
  }
  
  updateUsage(usageData) {
    if (!usageData) return;
    this.currentUsageData = usageData;
    
    const sessionEl = document.getElementById('cup-session-pct');
    if (sessionEl && usageData.currentSession) {
      sessionEl.textContent = usageData.currentSession.percent + '%';
      const pct = usageData.currentSession.percent;
      if (pct >= 90) sessionEl.style.color = '#ef4444';
      else if (pct >= 70) sessionEl.style.color = '#f59e0b';
      else sessionEl.style.color = '#22c55e';
    }
    
    const resetEl = document.getElementById('cup-reset-timer');
    if (resetEl) {
      const resetTime = usageData.currentSession?.resetsIn || '--';
      resetEl.textContent = resetTime;
      resetEl.title = resetTime === '--' ? 'Click refresh to sync' : `Resets in ${resetTime}`;
    }
    
    const weeklyAllEl = document.getElementById('cup-weekly-all-pct');
    if (weeklyAllEl && usageData.weeklyAllModels) {
      weeklyAllEl.textContent = usageData.weeklyAllModels.percent + '%';
      const pct = usageData.weeklyAllModels.percent;
      if (pct >= 90) weeklyAllEl.style.color = '#ef4444';
      else if (pct >= 70) weeklyAllEl.style.color = '#f59e0b';
      else weeklyAllEl.style.color = '#22c55e';
    }
    
    const weeklySonnetEl = document.getElementById('cup-weekly-sonnet-pct');
    if (weeklySonnetEl && usageData.weeklySonnet) {
      weeklySonnetEl.textContent = usageData.weeklySonnet.percent + '%';
      const pct = usageData.weeklySonnet.percent;
      if (pct >= 90) weeklySonnetEl.style.color = '#ef4444';
      else if (pct >= 70) weeklySonnetEl.style.color = '#f59e0b';
      else weeklySonnetEl.style.color = '#a855f7';
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
