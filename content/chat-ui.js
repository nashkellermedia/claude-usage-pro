/**
 * Claude Usage Pro - Chat UI
 * 
 * Embeds usage information into the chat area:
 * - Conversation length and cost near the title
 * - Quota, messages remaining, and reset time near the input
 */

class ChatUI {
  constructor() {
    // Title area displays
    this.titleContainer = null;
    this.lengthDisplay = null;
    this.costDisplay = null;
    this.cachedDisplay = null;
    
    // Input area displays  
    this.inputStatsContainer = null;
    this.quotaDisplay = null;
    this.estimateDisplay = null;
    this.resetDisplay = null;
    this.inputProgressBar = null;
    
    // Tooltips
    this.tooltips = {};
    
    // State
    this.isInjected = false;
    this.lastCachedUntil = null;
  }
  
  /**
   * Initialize the chat UI
   */
  initialize() {
    this.buildTitleUI();
    this.buildInputUI();
    this.createTooltips();
    
    window.CUP.log('Chat UI initialized');
  }
  
  /**
   * Build the title area UI (length, cost, cached)
   */
  buildTitleUI() {
    this.titleContainer = document.createElement('div');
    this.titleContainer.className = 'cup-title-stats text-text-500 text-xs px-1 select-none';
    this.titleContainer.style.marginTop = '2px';
    
    this.lengthDisplay = document.createElement('span');
    this.costDisplay = document.createElement('span');
    this.cachedDisplay = document.createElement('span');
  }
  
  /**
   * Build the input area UI (quota, estimate, reset)
   */
  buildInputUI() {
    this.inputStatsContainer = document.createElement('div');
    this.inputStatsContainer.className = 'cup-input-stats flex items-center gap-2 text-xs py-1';
    
    // Quota display with mini progress bar
    const quotaWrapper = document.createElement('div');
    quotaWrapper.className = 'flex items-center gap-2';
    
    this.quotaDisplay = document.createElement('span');
    this.quotaDisplay.className = 'text-text-400';
    this.quotaDisplay.textContent = 'Quota: --';
    
    // Mini progress bar (desktop only)
    if (!window.CUP.isMobileView()) {
      const progressWrapper = document.createElement('div');
      progressWrapper.className = 'w-16 h-1 bg-bg-300 rounded-full overflow-hidden';
      
      this.inputProgressBar = document.createElement('div');
      this.inputProgressBar.className = 'h-full transition-all duration-300';
      this.inputProgressBar.style.width = '0%';
      this.inputProgressBar.style.backgroundColor = window.CUP.COLORS.BLUE;
      
      progressWrapper.appendChild(this.inputProgressBar);
      quotaWrapper.appendChild(progressWrapper);
    }
    
    quotaWrapper.prepend(this.quotaDisplay);
    
    // Spacer
    const spacer = document.createElement('div');
    spacer.className = 'flex-1';
    
    // Messages remaining estimate
    this.estimateDisplay = document.createElement('span');
    this.estimateDisplay.className = 'text-text-400';
    this.estimateDisplay.textContent = 'Messages left: --';
    
    // Reset time
    this.resetDisplay = document.createElement('span');
    this.resetDisplay.className = 'text-text-400';
    this.resetDisplay.textContent = 'Reset: --';
    
    // Assemble
    this.inputStatsContainer.appendChild(quotaWrapper);
    this.inputStatsContainer.appendChild(spacer);
    
    if (!window.CUP.isMobileView()) {
      this.inputStatsContainer.appendChild(this.estimateDisplay);
    }
    this.inputStatsContainer.appendChild(this.resetDisplay);
  }
  
  /**
   * Create tooltips
   */
  createTooltips() {
    const createTooltip = (text) => {
      const tooltip = document.createElement('div');
      tooltip.className = 'cup-tooltip fixed bg-bg-500 text-text-100 text-xs px-2 py-1 rounded shadow-lg opacity-0 pointer-events-none transition-opacity z-50 max-w-xs';
      tooltip.style.whiteSpace = 'pre-line';
      tooltip.textContent = text;
      document.body.appendChild(tooltip);
      return tooltip;
    };
    
    this.tooltips = {
      length: createTooltip('Total tokens in this conversation.\nLonger conversations use more of your quota.'),
      cost: createTooltip('Estimated cost to send the next message.\nCost = length × model multiplier ÷ cache factor'),
      cached: createTooltip('Conversation is cached!\nFollow-up messages cost ~90% less.'),
      estimate: createTooltip('Estimated messages remaining\nbased on current conversation cost.'),
      quota: createTooltip('How much of your daily quota you\'ve used.'),
      reset: createTooltip('When your usage quota resets to full.')
    };
  }
  
  /**
   * Inject UI into the page
   */
  async injectUI() {
    await this.injectTitleUI();
    await this.injectInputUI();
    this.isInjected = true;
  }
  
  /**
   * Inject title area UI
   */
  async injectTitleUI() {
    // Find the chat menu button
    const chatMenu = document.querySelector(window.CUP.SELECTORS.CHAT_MENU);
    if (!chatMenu) return;
    
    // Find the title line container
    const titleLine = chatMenu.closest('.flex.min-w-0.flex-1');
    if (!titleLine) return;
    
    // Adjust layout to accommodate our stats
    titleLine.classList.remove('md:flex-row');
    titleLine.classList.add('md:flex-col');
    titleLine.classList.remove('md:items-center');
    titleLine.classList.add('md:items-start');
    
    // Insert our container after the chat menu's parent
    const menuParent = chatMenu.parentElement;
    if (menuParent && menuParent.nextElementSibling !== this.titleContainer) {
      menuParent.after(this.titleContainer);
    }
  }
  
  /**
   * Inject input area UI
   */
  async injectInputUI() {
    // Find the model selector
    const modelSelector = document.querySelector(window.CUP.SELECTORS.MODEL_SELECTOR);
    if (!modelSelector) return;
    
    // Find the row containing the model selector
    const selectorLine = modelSelector?.parentElement?.parentElement;
    if (!selectorLine) return;
    
    // Insert our stats after the selector line
    if (selectorLine.nextElementSibling !== this.inputStatsContainer) {
      selectorLine.after(this.inputStatsContainer);
    }
  }
  
  /**
   * Check and reinject if needed
   */
  async checkAndReinject() {
    const menuExists = document.querySelector(window.CUP.SELECTORS.CHAT_MENU);
    const modelExists = document.querySelector(window.CUP.SELECTORS.MODEL_SELECTOR);
    
    if (menuExists && !document.contains(this.titleContainer)) {
      await this.injectTitleUI();
    }
    
    if (modelExists && !document.contains(this.inputStatsContainer)) {
      await this.injectInputUI();
    }
  }
  
  /**
   * Update title area with conversation data
   */
  updateConversation(conversationData, currentModel) {
    if (!conversationData) {
      this.clearTitleDisplay();
      return;
    }
    
    const length = conversationData.length;
    const cost = conversationData.getWeightedFutureCost(currentModel);
    const isCached = conversationData.isCurrentlyCached();
    
    // Length display
    const lengthColor = conversationData.isLong() ? window.CUP.COLORS.RED : window.CUP.COLORS.BLUE;
    this.lengthDisplay.innerHTML = `Length: <span style="color: ${lengthColor}">${window.CUP.formatNumber(length)}</span>`;
    
    // Cost display (desktop only)
    if (!window.CUP.isMobileView()) {
      const costColor = isCached ? window.CUP.COLORS.GREEN : (conversationData.isExpensive() ? window.CUP.COLORS.RED : window.CUP.COLORS.BLUE);
      this.costDisplay.innerHTML = ` | Cost: <span style="color: ${costColor}">${window.CUP.formatNumber(cost)}</span>`;
    } else {
      this.costDisplay.innerHTML = '';
    }
    
    // Cached display
    if (isCached) {
      this.lastCachedUntil = conversationData.cachedUntil;
      const cacheTime = conversationData.getTimeUntilCacheExpires();
      this.cachedDisplay.innerHTML = ` | <span style="color: ${window.CUP.COLORS.GREEN}">Cached: ${cacheTime.minutes}m</span>`;
    } else {
      this.lastCachedUntil = null;
      this.cachedDisplay.innerHTML = '';
    }
    
    // Update container
    this.updateTitleContainer();
    
    // Setup tooltips
    window.CUP.setupTooltip(this.lengthDisplay, this.tooltips.length);
    window.CUP.setupTooltip(this.costDisplay, this.tooltips.cost);
    if (isCached) {
      window.CUP.setupTooltip(this.cachedDisplay, this.tooltips.cached);
    }
  }
  
  /**
   * Update input area with usage data
   */
  updateUsage(usageData, conversationData, currentModel) {
    if (!usageData) return;
    
    const percentage = usageData.getUsagePercentage();
    const color = window.CUP.getUsageColor(percentage);
    const resetInfo = usageData.getResetTimeInfo();
    
    // Quota display
    this.quotaDisplay.innerHTML = `Quota: <span style="color: ${color}">${percentage.toFixed(1)}%</span>`;
    
    // Progress bar
    if (this.inputProgressBar) {
      this.inputProgressBar.style.width = `${Math.min(percentage, 100)}%`;
      this.inputProgressBar.style.backgroundColor = color;
    }
    
    // Messages remaining estimate
    if (conversationData && !window.CUP.isMobileView()) {
      const estimate = conversationData.estimateMessagesRemaining(usageData, currentModel);
      const estColor = estimate < 15 ? window.CUP.COLORS.RED : window.CUP.COLORS.BLUE;
      
      if (estimate === Infinity || isNaN(estimate)) {
        this.estimateDisplay.textContent = 'Messages left: N/A';
      } else {
        this.estimateDisplay.innerHTML = `Messages left: <span style="color: ${estColor}">${estimate.toFixed(0)}</span>`;
      }
    }
    
    // Reset time
    if (resetInfo.expired) {
      this.resetDisplay.innerHTML = `<span style="color: ${window.CUP.COLORS.GREEN}">Reset: Now!</span>`;
    } else {
      this.resetDisplay.textContent = `Reset: ${resetInfo.formatted}`;
    }
    
    // Setup tooltips
    window.CUP.setupTooltip(this.quotaDisplay, this.tooltips.quota);
    window.CUP.setupTooltip(this.estimateDisplay, this.tooltips.estimate);
    window.CUP.setupTooltip(this.resetDisplay, this.tooltips.reset);
  }
  
  /**
   * Update cached time display (called frequently)
   */
  updateCachedTime() {
    if (!this.lastCachedUntil) return false;
    
    const remaining = this.lastCachedUntil - Date.now();
    
    if (remaining <= 0) {
      this.lastCachedUntil = null;
      this.cachedDisplay.innerHTML = '';
      this.updateTitleContainer();
      return true; // Cache expired
    }
    
    const minutes = Math.ceil(remaining / (1000 * 60));
    this.cachedDisplay.innerHTML = ` | <span style="color: ${window.CUP.COLORS.GREEN}">Cached: ${minutes}m</span>`;
    
    return false;
  }
  
  /**
   * Clear title display
   */
  clearTitleDisplay() {
    this.lengthDisplay.innerHTML = 'Length: <span>--</span>';
    this.costDisplay.innerHTML = '';
    this.cachedDisplay.innerHTML = '';
    this.lastCachedUntil = null;
    this.updateTitleContainer();
  }
  
  /**
   * Update title container content
   */
  updateTitleContainer() {
    this.titleContainer.innerHTML = '';
    this.titleContainer.appendChild(this.lengthDisplay);
    
    if (this.costDisplay.innerHTML) {
      this.titleContainer.appendChild(this.costDisplay);
    }
    
    if (this.cachedDisplay.innerHTML) {
      this.titleContainer.appendChild(this.cachedDisplay);
    }
  }
}

// Expose globally
window.ChatUI = ChatUI;
