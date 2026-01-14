/**
 * Claude Usage Pro - Chat UI
 * 
 * Embeds usage information into the chat area:
 * - Conversation stats bar at top of chat
 * - Live token counter as you type
 * - Model cost indicators
 */

class ChatUI {
  constructor() {
    // Top stats bar
    this.topBar = null;
    this.conversationLength = null;
    this.messageCost = null;
    this.cacheStatus = null;
    this.modelIndicator = null;
    
    // Input area stats
    this.inputStats = null;
    this.draftCounter = null;
    this.quotaBar = null;
    this.messagesLeft = null;
    this.resetTimer = null;
    
    // State
    this.isInjected = false;
    this.draftTokens = 0;
    this.lastInputLength = 0;
  }
  
  initialize() {
    this.buildTopBar();
    this.buildInputStats();
    this.setupDraftCounter();
    window.CUP.log('ChatUI initialized');
  }
  
  buildTopBar() {
    this.topBar = document.createElement('div');
    this.topBar.id = 'cup-top-bar';
    this.topBar.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: linear-gradient(to right, rgba(44, 132, 219, 0.1), rgba(139, 92, 246, 0.1));
      border-bottom: 1px solid rgba(44, 132, 219, 0.2);
      font-size: 12px;
      font-family: inherit;
      gap: 16px;
      flex-wrap: wrap;
    `;
    
    // Left section - conversation info
    const leftSection = document.createElement('div');
    leftSection.style.cssText = 'display: flex; align-items: center; gap: 12px;';
    
    this.conversationLength = document.createElement('span');
    this.conversationLength.innerHTML = '📝 <strong>0</strong> tokens';
    
    this.messageCost = document.createElement('span');
    this.messageCost.innerHTML = '💰 Next: <strong>~0</strong>';
    
    this.cacheStatus = document.createElement('span');
    this.cacheStatus.style.cssText = 'color: #22c55e; display: none;';
    this.cacheStatus.innerHTML = '⚡ Cached';
    
    leftSection.appendChild(this.conversationLength);
    leftSection.appendChild(this.messageCost);
    leftSection.appendChild(this.cacheStatus);
    
    // Right section - model info
    const rightSection = document.createElement('div');
    rightSection.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    
    this.modelIndicator = document.createElement('span');
    this.modelIndicator.style.cssText = 'padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;';
    this.modelIndicator.textContent = 'Sonnet (1x)';
    this.setModelStyle('sonnet');
    
    rightSection.appendChild(this.modelIndicator);
    
    this.topBar.appendChild(leftSection);
    this.topBar.appendChild(rightSection);
  }
  
  buildInputStats() {
    this.inputStats = document.createElement('div');
    this.inputStats.id = 'cup-input-stats';
    this.inputStats.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: rgba(0,0,0,0.03);
      border-radius: 8px;
      margin: 8px 0;
      font-size: 11px;
      gap: 12px;
    `;
    
    // Draft counter
    this.draftCounter = document.createElement('span');
    this.draftCounter.style.cssText = 'color: #6b7280;';
    this.draftCounter.innerHTML = '✏️ Draft: <strong>0</strong> tokens';
    
    // Mini quota bar
    const quotaSection = document.createElement('div');
    quotaSection.style.cssText = 'display: flex; align-items: center; gap: 8px; flex: 1; max-width: 200px;';
    
    const quotaLabel = document.createElement('span');
    quotaLabel.style.cssText = 'color: #6b7280; white-space: nowrap;';
    quotaLabel.textContent = 'Quota:';
    
    const quotaBarContainer = document.createElement('div');
    quotaBarContainer.style.cssText = 'flex: 1; height: 4px; background: rgba(0,0,0,0.1); border-radius: 2px; overflow: hidden;';
    
    this.quotaBar = document.createElement('div');
    this.quotaBar.style.cssText = 'height: 100%; width: 0%; background: #2c84db; transition: width 0.3s;';
    
    quotaBarContainer.appendChild(this.quotaBar);
    quotaSection.appendChild(quotaLabel);
    quotaSection.appendChild(quotaBarContainer);
    
    // Messages left
    this.messagesLeft = document.createElement('span');
    this.messagesLeft.style.cssText = 'color: #6b7280; white-space: nowrap;';
    this.messagesLeft.innerHTML = '💬 <strong>--</strong> msgs left';
    
    // Reset timer
    this.resetTimer = document.createElement('span');
    this.resetTimer.style.cssText = 'color: #6b7280; white-space: nowrap;';
    this.resetTimer.innerHTML = '🔄 <strong>--</strong>';
    
    this.inputStats.appendChild(this.draftCounter);
    this.inputStats.appendChild(quotaSection);
    this.inputStats.appendChild(this.messagesLeft);
    this.inputStats.appendChild(this.resetTimer);
  }
  
  setupDraftCounter() {
    // Monitor input changes
    setInterval(() => {
      const input = document.querySelector('[contenteditable="true"], textarea[placeholder*="Reply"]');
      if (input) {
        const text = input.textContent || input.value || '';
        if (text.length !== this.lastInputLength) {
          this.lastInputLength = text.length;
          this.draftTokens = Math.ceil(text.length / 4); // ~4 chars per token
          if (this.draftCounter) {
            this.draftCounter.innerHTML = `✏️ Draft: <strong>${this.draftTokens}</strong> tokens`;
          }
        }
      }
    }, 500);
  }
  
  setModelStyle(model) {
    const styles = {
      sonnet: { bg: '#dbeafe', color: '#1e40af', text: 'Sonnet (1x)' },
      opus: { bg: '#fef3c7', color: '#92400e', text: 'Opus (5x)' },
      haiku: { bg: '#d1fae5', color: '#065f46', text: 'Haiku (0.2x)' }
    };
    const s = styles[model] || styles.sonnet;
    this.modelIndicator.style.background = s.bg;
    this.modelIndicator.style.color = s.color;
    this.modelIndicator.textContent = s.text;
  }
  
  async injectUI() {
    await this.injectTopBar();
    await this.injectInputStats();
    this.isInjected = true;
  }
  
  async injectTopBar() {
    // Find the main chat container
    const chatContainer = document.querySelector('main') || document.querySelector('[class*="conversation"]');
    if (chatContainer && !document.getElementById('cup-top-bar')) {
      chatContainer.insertBefore(this.topBar, chatContainer.firstChild);
      window.CUP.log('ChatUI: Top bar injected');
    }
  }
  
  async injectInputStats() {
    // Find the input area
    const inputArea = document.querySelector('[class*="composer"], [class*="input-container"]');
    if (inputArea && !document.getElementById('cup-input-stats')) {
      inputArea.parentElement?.insertBefore(this.inputStats, inputArea);
      window.CUP.log('ChatUI: Input stats injected');
    }
  }
  
  async checkAndReinject() {
    if (!document.getElementById('cup-top-bar')) await this.injectTopBar();
    if (!document.getElementById('cup-input-stats')) await this.injectInputStats();
  }
  
  updateConversation(conversationData, currentModel) {
    if (!conversationData) return;
    
    const length = conversationData.length || 0;
    const cost = conversationData.getWeightedFutureCost ? conversationData.getWeightedFutureCost(currentModel) : length;
    const isCached = conversationData.isCurrentlyCached ? conversationData.isCurrentlyCached() : false;
    
    // Update displays
    if (this.conversationLength) {
      const color = length > 50000 ? '#de2929' : length > 20000 ? '#f59e0b' : '#2c84db';
      this.conversationLength.innerHTML = `📝 <strong style="color:${color}">${this.formatNumber(length)}</strong> tokens`;
    }
    
    if (this.messageCost) {
      this.messageCost.innerHTML = `💰 Next: <strong>~${this.formatNumber(cost)}</strong>`;
    }
    
    if (this.cacheStatus) {
      this.cacheStatus.style.display = isCached ? 'inline' : 'none';
      if (isCached && conversationData.getTimeUntilCacheExpires) {
        const cache = conversationData.getTimeUntilCacheExpires();
        this.cacheStatus.innerHTML = `⚡ Cached (${cache.minutes}m)`;
      }
    }
    
    // Update model indicator
    if (currentModel && this.modelIndicator) {
      if (currentModel.includes('opus')) this.setModelStyle('opus');
      else if (currentModel.includes('haiku')) this.setModelStyle('haiku');
      else this.setModelStyle('sonnet');
    }
  }
  
  updateUsage(usageData, conversationData, currentModel) {
    if (!usageData) return;
    
    const percentage = usageData.getUsagePercentage();
    const resetInfo = usageData.getResetTimeInfo();
    
    // Update quota bar
    if (this.quotaBar) {
      let color = '#2c84db';
      if (percentage >= 95) color = '#de2929';
      else if (percentage >= 80) color = '#f59e0b';
      this.quotaBar.style.width = Math.min(percentage, 100) + '%';
      this.quotaBar.style.backgroundColor = color;
    }
    
    // Update messages left estimate
    if (this.messagesLeft && conversationData) {
      const remaining = usageData.getRemainingTokens();
      const costPerMsg = conversationData.getWeightedFutureCost ? conversationData.getWeightedFutureCost(currentModel) : 1000;
      const msgsLeft = costPerMsg > 0 ? Math.floor(remaining / costPerMsg) : 999;
      const color = msgsLeft < 10 ? '#de2929' : msgsLeft < 50 ? '#f59e0b' : '#22c55e';
      this.messagesLeft.innerHTML = `💬 <strong style="color:${color}">${msgsLeft}</strong> msgs left`;
    }
    
    // Update reset timer
    if (this.resetTimer) {
      if (resetInfo.expired) {
        this.resetTimer.innerHTML = '🔄 <strong style="color:#22c55e">Reset now!</strong>';
      } else {
        this.resetTimer.innerHTML = `🔄 <strong>${resetInfo.formatted}</strong>`;
      }
    }
  }
  
  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }
}

window.ChatUI = ChatUI;
window.CUP.log('ChatUI class loaded');
