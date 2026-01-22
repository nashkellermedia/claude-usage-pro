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
    this.previousNonEmptyText = "";  // For detecting message sends
    this.useAccurateCount = false;
    this.lastAccurateTextTokens = 0;
    
    // Alert thresholds (loaded from settings)
    this.thresholdWarning = 70;
    this.thresholdDanger = 90;
    
    // Stats bar visibility settings
    this.statsBarSettings = {
      showDraft: true,
      showFiles: true,
      showSession: true,
      showWeekly: true,
      showSonnet: true,
      showTimer: true
    };
    this.loadThresholds();
    this.rateLimitState = null;
  }
  
  initialize() {
    window.CUP.log('ChatUI: Initializing...');
    this.initialized = true;
    this.checkTokenCountingAvailable();
  }
  
  async checkTokenCountingAvailable() {
    try {
      const response = await window.CUP.sendToBackground({ type: 'GET_SETTINGS' });
      this.useAccurateCount = !!(response?.settings?.anthropicApiKey);
      window.CUP.log('ChatUI: Accurate token counting:', this.useAccurateCount ? 'ENABLED' : 'disabled');
    } catch (e) {
      this.useAccurateCount = false;
    }
  }
  
  async loadThresholds() {
    try {
      const response = await window.CUP.sendToBackground({ type: 'GET_SETTINGS' });
      if (response?.settings) {
        this.thresholdWarning = response.settings.thresholdWarning || 70;
        this.thresholdDanger = response.settings.thresholdDanger || 90;
        
        // Load stats bar visibility settings
        this.statsBarSettings = {
          showDraft: response.settings.statsBarShowDraft !== false,
          showFiles: response.settings.statsBarShowFiles !== false,
          showSession: response.settings.statsBarShowSession !== false,
          showWeekly: response.settings.statsBarShowWeekly !== false,
          showSonnet: response.settings.statsBarShowSonnet !== false,
          showTimer: response.settings.statsBarShowTimer !== false
        };
        
        window.CUP.log('ChatUI: Settings loaded - Thresholds:', this.thresholdWarning + '/' + this.thresholdDanger);
      }
    } catch (e) {}
  }
  
  getColorForPercent(pct) {
    if (pct >= this.thresholdDanger) return '#ef4444';
    if (pct >= this.thresholdWarning) return '#f59e0b';
    return '#22c55e';
  }
  
  buildStatsBarHTML() {
    const parts = [];
    const s = this.statsBarSettings;
    
    if (s.showDraft) {
      parts.push(`
        <span class="cup-stat-item">
          <span class="cup-stat-icon">✏️</span>
          <span class="cup-stat-label">Draft:</span>
          <span class="cup-stat-value" id="cup-draft-tokens">0</span>
          <span class="cup-stat-unit">tokens</span>
          <span class="cup-accuracy-indicator" id="cup-accuracy" title="Estimated">~</span>
        </span>
      `);
    }
    
    if (s.showFiles) {
      parts.push(`
        <span class="cup-stat-item">
          <span class="cup-stat-icon">📎</span>
          <span class="cup-stat-label">Files:</span>
          <span class="cup-stat-value" id="cup-files-count">0</span>
          <span class="cup-clear-files" id="cup-clear-files" title="Clear file count" style="display:none; cursor:pointer; margin-left:2px; font-size:10px; color:#888;">✕</span>
        </span>
      `);
    }
    
    if (s.showSession) {
      parts.push(`
        <span class="cup-stat-item">
          <span class="cup-stat-label">Session:</span>
          <span class="cup-stat-value" id="cup-session-pct">--%</span>
        </span>
      `);
    }
    
    if (s.showWeekly) {
      parts.push(`
        <span class="cup-stat-item">
          <span class="cup-stat-label">Weekly:</span>
          <span class="cup-stat-value" id="cup-weekly-all-pct">--%</span>
        </span>
      `);
    }
    
    if (s.showSonnet) {
      parts.push(`
        <span class="cup-stat-item">
          <span class="cup-stat-label">Sonnet:</span>
          <span class="cup-stat-value" id="cup-weekly-sonnet-pct">--%</span>
        </span>
      `);
    }
    
    if (s.showTimer) {
      parts.push(`
        <span class="cup-stat-item">
          <span class="cup-stat-icon">⏱️</span>
          <span class="cup-stat-value" id="cup-reset-timer">--</span>
        </span>
      `);
    }
    
    // Join with dividers
    return parts.join('<span class="cup-stat-divider">│</span>');
  }
  
  /**
   * Find attachments in the composer area - ULTRA CONSERVATIVE
   * Only detect things we are 100% certain are attachments
   */
  /**
   * Find attachments in the composer area - SMART DETECTION
   * Looks for file chips with remove buttons + filename patterns
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
    
    // File extension pattern
    const fileExtensions = 'pdf|txt|md|csv|json|doc|docx|xlsx|xls|py|js|ts|html|css|xml|zip|c|cpp|h|java|rb|go|rs|swift|kt|png|jpg|jpeg|gif|webp|svg|bmp|ico';
    const fileRegex = new RegExp(`([^\\s\\/\\\\<>"']+\\.(${fileExtensions}))`, 'i');
    
    // Helper: is element actually visible and in composer area
    const isValidAttachment = (el) => {
      if (!el) return false;
      
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      
      const rect = el.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) return false;
      
      // Check if element is reasonably near the composer (within 400px above or 100px below)
      // Claude's UI may position attachments above OR within the form area
      if (rect.top < composerRect.top - 400) return false;
      if (rect.top > composerRect.bottom + 100) return false;
      
      return true;
    };
    
    // METHOD 0: Any image in the form that has a remove/close button as sibling or in parent
    // This is the most reliable way to detect uploaded images regardless of src format
    const allFormImages = form.querySelectorAll('img');
    for (const img of allFormImages) {
      if (!isValidAttachment(img)) continue;
      if (attachments.some(a => a.id === img.src)) continue;
      
      // Check for remove button in parent hierarchy (up to 3 levels)
      let hasRemove = false;
      let container = img.parentElement;
      for (let i = 0; i < 3 && container && container !== form; i++) {
        const buttons = container.querySelectorAll('button');
        for (const btn of buttons) {
          const label = (btn.getAttribute('aria-label') || btn.textContent || '').toLowerCase();
          const svg = btn.querySelector('svg');
          const hasX = svg && (btn.innerHTML.includes('M6') || btn.innerHTML.includes('close') || btn.innerHTML.includes('x'));
          if (label.includes('remove') || label.includes('delete') || label.includes('close') || hasX) {
            hasRemove = true;
            break;
          }
        }
        if (hasRemove) break;
        container = container.parentElement;
      }
      
      if (hasRemove) {
        const tokens = this.estimateImageTokens(img.naturalWidth || img.width || 400, img.naturalHeight || img.height || 400);
        attachments.push({
          id: img.src,
          name: 'uploaded image',
          type: 'image',
          tokens
        });
        window.CUP.log('ChatUI: Found image with remove button:', img.src.substring(0, 50));
      }
    }
    
    // METHOD 1: Images with Claude API file URLs - these are DEFINITELY uploads (backup)
    const apiImages = form.querySelectorAll('img[src*="/api/"][src*="/files/"]');
    for (const img of apiImages) {
      if (isValidAttachment(img) && !attachments.some(a => a.id === img.src)) {
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
    
    // METHOD 2: Blob images that have an X/remove button nearby
    const blobImages = form.querySelectorAll('img[src^="blob:"]');
    for (const img of blobImages) {
      if (!isValidAttachment(img)) continue;
      
      let hasRemove = false;
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
    
    // METHOD 3: Find file chips by looking for remove buttons + nearby filename
    // This catches .md, .doc, .pdf, etc files shown as chips
    const allButtons = form.querySelectorAll('button');
    for (const btn of allButtons) {
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      
      // Must be a remove/close/delete button
      if (!ariaLabel.includes('remove') && !ariaLabel.includes('delete') && !ariaLabel.includes('close')) {
        continue;
      }
      
      // Check if button itself or its container is in valid position
      if (!isValidAttachment(btn)) continue;
      
      // Search up the DOM for a filename pattern
      let container = btn.parentElement;
      for (let depth = 0; depth < 5 && container && container !== form; depth++) {
        const text = container.textContent || '';
        const fileMatch = text.match(fileRegex);
        
        if (fileMatch) {
          const fileName = fileMatch[1];
          
          // Don't double-count
          if (attachments.some(a => a.name === fileName)) break;
          
          const ext = fileMatch[2].toLowerCase();
          let tokens = 1500;
          
          // Token estimates by file type
          if (ext === 'pdf') tokens = 3000;
          else if (['txt', 'md', 'csv', 'json', 'xml'].includes(ext)) tokens = 1000;
          else if (['doc', 'docx'].includes(ext)) tokens = 2000;
          else if (['xlsx', 'xls'].includes(ext)) tokens = 2500;
          else if (['py', 'js', 'ts', 'html', 'css', 'c', 'cpp', 'java', 'rb', 'go', 'rs', 'swift', 'kt', 'h'].includes(ext)) tokens = 1200;
          
          attachments.push({
            id: `file-${fileName}-${Date.now()}`,
            name: fileName,
            type: 'file',
            tokens
          });
          window.CUP.log('ChatUI: Found file via remove button:', fileName);
          break; // Found a file for this button, stop searching up
        }
        
        container = container.parentElement;
      }
    }
    
    // METHOD 4: Backup - check data-testid attributes
    const testIdElements = form.querySelectorAll('[data-testid*="attachment"], [data-testid*="file-preview"], [data-testid*="upload"]');
    for (const el of testIdElements) {
      if (!isValidAttachment(el)) continue;
      
      const text = el.textContent || '';
      const fileMatch = text.match(fileRegex);
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
    
    // Always load fresh settings before building stats bar
    await this.loadThresholds();
    this.rateLimitState = null;
    
    for (let attempt = 0; attempt < 10; attempt++) {
      const contentEditable = document.querySelector('[contenteditable="true"]');
      
      if (contentEditable) {
        this.inputStats = document.createElement('div');
        this.inputStats.id = 'cup-input-stats';
        
        // Build stats bar HTML based on settings
        this.inputStats.innerHTML = this.buildStatsBarHTML();
        
        // Find the input box container (walk up ~4 levels to find the rounded box)
        let container = contentEditable;
        for (let i = 0; i < 4; i++) {
          if (container.parentElement) container = container.parentElement;
        }
        
        if (container) {
          // Inject INSIDE the container at the bottom
          container.appendChild(this.inputStats);
          window.CUP.log('ChatUI: Input stats injected inside container');
          
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
      const response = await window.CUP.sendToBackground({ 
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
      
      // Detect message send: input went from having text to empty
      if (this.previousNonEmptyText.length > 10 && text.length === 0) {
        this.onMessageSent(this.previousNonEmptyText);
      }
      // Track non-empty text for send detection
      if (text.length > 0) {
        this.previousNonEmptyText = text;
      }
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
      sessionEl.style.color = this.getColorForPercent(pct);
      
      // Add prediction tooltip
      if (usageData.predictions?.session?.formatted) {
        const pred = usageData.predictions.session.formatted;
        const rate = usageData.predictions.burnRate?.tokensPerHour;
        let tooltip = `At current rate, limit in ~${pred}`;
        if (rate) tooltip += ` (${Math.round(rate).toLocaleString()} tokens/hr)`;
        sessionEl.title = tooltip;
        sessionEl.style.cursor = 'help';
      } else {
        sessionEl.title = 'Session usage';
        sessionEl.style.cursor = 'default';
      }
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
      const weeklyPct = usageData.weeklyAllModels.percent;
      weeklyAllEl.style.color = this.getColorForPercent(weeklyPct);
    }
    
    const weeklySonnetEl = document.getElementById('cup-weekly-sonnet-pct');
    if (weeklySonnetEl && usageData.weeklySonnet) {
      weeklySonnetEl.textContent = usageData.weeklySonnet.percent + '%';
      const sonnetPct = usageData.weeklySonnet.percent;
      weeklySonnetEl.style.color = this.getColorForPercent(sonnetPct);
    }
  }
  
  checkAndReinject() {
    if (!document.getElementById('cup-input-stats')) {
      this.injectInputStats();
    }
  }
  
  handleRateLimitUpdate(state) {
    // Add rate limit indicator to stats bar
    const statsBar = document.getElementById("cup-input-stats");
    if (!statsBar) return;
    
    let indicator = document.getElementById("cup-stats-rate-limit");
    
    if (!state || !state.isLimited) {
      // Remove indicator if exists
      if (indicator) indicator.remove();
      return;
    }
    
    // Create or update indicator
    if (!indicator) {
      indicator = document.createElement("span");
      indicator.id = "cup-stats-rate-limit";
      indicator.className = "cup-stat-item cup-stat-rate-limited";
      // Insert at the beginning of stats bar
      statsBar.insertBefore(indicator, statsBar.firstChild);
    }
    
    let timeStr = "";
    if (state.resetTime) {
      const remaining = state.resetTime - Date.now();
      if (remaining > 0) {
        const minutes = Math.floor(remaining / 60000);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) {
          timeStr = ` (${hours}h ${minutes % 60}m)`;
        } else {
          timeStr = ` (${minutes}m)`;
        }
      }
    }
    
    indicator.innerHTML = `<span class="cup-stat-icon">⛔</span> RATE LIMITED${timeStr}`;
  }

  /**
   * Called when we detect a message was sent (input cleared after having text)
   */
  onMessageSent(text) {
    const model = this.getCurrentModelFromUI();
    const extendedThinking = this.isExtendedThinkingEnabled();
    const inputTokens = this.lastAccurateTextTokens || Math.ceil(text.length / 4);
    
    window.CUP.log("ChatUI: Message sent! Model:", model, "ET:", extendedThinking, "Tokens:", inputTokens);
    
    // Send to background for model tracking with multipliers
    try {
      window.CUP.sendToBackground({
        type: "ADD_TOKEN_DELTA",
        inputTokens: inputTokens,
        outputTokens: 0,
        model: model,
        extendedThinking: extendedThinking
      }).catch(e => window.CUP.logError("Failed to send token delta:", e));
    } catch (e) {
      window.CUP.logError("ChatUI: Failed to record message send:", e);
    }
    
    // Reset for next message
    this.previousNonEmptyText = "";
  }

  /**
   * Get current model from the UI model selector
   */
  getCurrentModelFromUI() {
    try {
      const modelButton = document.querySelector("[data-testid='model-selector-dropdown']") ||
                         document.querySelector("button[aria-label*='model']") ||
                         document.querySelector("[class*='model-selector']");
      
      if (modelButton) {
        const text = (modelButton.textContent || modelButton.innerText || "").toLowerCase();
        window.CUP.log("ChatUI: Model selector text:", text);
        
        if (text.includes("4.5") || text.includes("4-5")) {
          if (text.includes("opus")) return "claude-opus-4-5";
          if (text.includes("sonnet")) return "claude-sonnet-4-5";
          if (text.includes("haiku")) return "claude-haiku-4-5";
        }
        if (text.includes("opus")) return "claude-opus-4";
        if (text.includes("sonnet")) return "claude-sonnet-4";
        if (text.includes("haiku")) return "claude-haiku-4";
      }
    } catch (e) {
      window.CUP.logError("ChatUI: Failed to get model from UI:", e);
    }
    window.CUP.log('ChatUI: No model button found, using default');
    return "claude-sonnet-4";
  }

  /**
   * Detect if extended thinking is currently enabled in the UI
   */
  isExtendedThinkingEnabled() {
    try {
      // Look for extended thinking toggle button or indicator
      const thinkingToggle = document.querySelector(
        "[data-testid='extended-thinking-toggle']," +
        "[data-testid='thinking-toggle']," +
        "[aria-label*='thinking' i]," +
        "[aria-label*='extended' i]," +
        "button[class*='thinking']"
      );
      
      if (thinkingToggle) {
        const isOn = thinkingToggle.getAttribute('data-state') === 'on' ||
                     thinkingToggle.getAttribute('aria-pressed') === 'true' ||
                     thinkingToggle.classList.contains('active') ||
                     thinkingToggle.classList.contains('on');
        window.CUP.log('ChatUI: Extended thinking toggle found, enabled:', isOn);
        return isOn;
      }
      
      // Check for thinking indicator near model selector
      const thinkingIndicator = document.querySelector(
        "[class*='thinking-enabled']," +
        "[class*='extended-thinking']," +
        ".thinking-mode"
      );
      if (thinkingIndicator) {
        window.CUP.log('ChatUI: Extended thinking indicator found');
        return true;
      }
      
      return false;
    } catch (e) {
      window.CUP.logError('ChatUI: Error detecting extended thinking:', e);
      return false;
    }
  }
}

window.ChatUI = ChatUI;
window.CUP.log('ChatUI loaded');
