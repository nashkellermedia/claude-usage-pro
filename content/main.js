/**
 * Claude Usage Pro - Main Content Script
 */

class ClaudeUsagePro {
  constructor() {
    this.sidebarUI = null;
    this.chatUI = null;
    this.usageScraper = null;
    this.usageData = null;
    this.conversationData = null;
    this.currentModel = 'claude-sonnet-4';
    this.isRunning = false;
    this.lastUpdate = 0;
  }
  
  async initialize() {
    window.CUP.log('=== Initializing Claude Usage Pro ===');
    
    try {
      // Inject fetch interceptor
      this.injectPageScript();
      
      // Setup listeners
      this.setupPageEventListener();
      this.setupMessageListener();
      
      // Wait for page to be ready
      await window.CUP.sleep(1500);
      
      // Create UI components
      this.sidebarUI = new window.SidebarUI();
      this.chatUI = new window.ChatUI();
      this.usageScraper = new window.UsageScraper();
      
      // Initialize UIs
      this.chatUI.initialize();
      await this.sidebarUI.initialize();
      
      // Inject chat UI (top bar + input stats)
      setTimeout(() => {
        if (this.chatUI) this.chatUI.injectUI();
      }, 2000);
      
      // Get initial data
      await this.requestData();
      
      // Start scraping
      this.startUsageScraping();
      
      // Start update loop
      this.startUpdateLoop();
      
      window.CUP.log('=== Claude Usage Pro Ready ===');
      
    } catch (error) {
      window.CUP.logError('Init failed:', error);
    }
  }
  
  injectPageScript() {
    try {
      if (!window.CUP.isExtensionValid()) return;
      
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injections/fetch-interceptor.js');
      script.onload = function() { this.remove(); };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      window.CUP.logError('Inject failed:', e);
    }
  }
  
  setupPageEventListener() {
    window.addEventListener('CUP_API_EVENT', async (event) => {
      if (!window.CUP.isExtensionValid()) return;
      
      const { type, data } = event.detail;
      window.CUP.log('API Event:', type);
      
      try {
        if (type === 'MESSAGE_SENT') {
          await this.handleMessageSent(data);
        } else if (type === 'MESSAGE_RECEIVED') {
          await this.handleMessageReceived(data);
        } else if (type === 'CONVERSATION_LOADED') {
          this.handleConversationLoaded(data);
        }
      } catch (e) {
        window.CUP.logError('Error handling page event:', e);
      }
    });
  }
  
  async handleMessageSent(data) {
    if (data.model) this.currentModel = data.model;
    
    const response = await window.CUP.sendToBackground({
      type: 'MESSAGE_SENT',
      tokens: data.tokens || 0,
      model: this.currentModel
    });
    
    if (response?.usageData) {
      this.usageData = new window.UsageData(response.usageData);
      this.updateUI();
    }
  }
  
  async handleMessageReceived(data) {
    if (data.model) this.currentModel = data.model;
    
    const response = await window.CUP.sendToBackground({
      type: 'MESSAGE_RECEIVED',
      tokens: data.totalTokens || 0,
      model: this.currentModel
    });
    
    if (response?.usageData) {
      this.usageData = new window.UsageData(response.usageData);
      this.updateUI();
    }
  }
  
  handleConversationLoaded(data) {
    if (data.model) this.currentModel = data.model;
    
    this.conversationData = new window.ConversationData({
      conversationId: data.conversationId,
      length: data.totalTokens || 0,
      messageCount: data.messageCount || 0,
      model: data.model
    });
    
    // Update chat UI with conversation context
    if (this.chatUI && typeof this.chatUI.updateConversation === 'function') {
      this.chatUI.updateConversation(this.conversationData, this.currentModel);
    }
  }
  
  updateUI() {
    if (!this.usageData) return;
    
    try {
      if (this.sidebarUI && typeof this.sidebarUI.update === 'function') {
        this.sidebarUI.update(this.usageData);
      }
      if (this.chatUI && typeof this.chatUI.updateUsage === 'function') {
        this.chatUI.updateUsage(this.usageData, this.conversationData, this.currentModel);
      }
    } catch (e) {
      window.CUP.logError('UI update error:', e);
    }
  }
  
  setupMessageListener() {
    if (!window.CUP.isExtensionValid()) return;
    
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
          if (message.type === 'USAGE_UPDATED' && message.usageData) {
            this.usageData = new window.UsageData(message.usageData);
            this.updateUI();
          }
          if (message.type === 'SCRAPE_USAGE') {
            this.triggerScrape();
          }
        } catch (e) {
          // Silently handle errors
        }
        sendResponse({ received: true });
        return false;
      });
    } catch (e) {
      // Extension context may be invalidated
    }
  }
  
  startUsageScraping() {
    setTimeout(() => this.triggerScrape(), 5000);
    setInterval(() => this.triggerScrape(), 5 * 60 * 1000);
  }
  
  async triggerScrape() {
    if (!this.usageScraper) return;
    if (!window.CUP.isExtensionValid()) return;
    
    try {
      const data = await this.usageScraper.scrapeUsage();
      if (data) {
        window.CUP.log('Scraped:', data);
        const response = await window.CUP.sendToBackground({
          type: 'SYNC_SCRAPED_DATA',
          data: data
        });
        
        if (response?.usageData) {
          this.usageData = new window.UsageData(response.usageData);
          this.updateUI();
        }
      }
    } catch (e) {
      // Silently handle scrape errors
    }
  }
  
  startUpdateLoop() {
    this.isRunning = true;
    
    const loop = () => {
      if (!this.isRunning) return;
      if (!window.CUP.isExtensionValid()) {
        this.isRunning = false;
        return;
      }
      
      const now = Date.now();
      if (now - this.lastUpdate >= 3000) {
        this.lastUpdate = now;
        
        try {
          // Check for model changes
          const model = window.CUP.getCurrentModel();
          if (model && model !== this.currentModel) {
            this.currentModel = model;
            if (this.chatUI && typeof this.chatUI.updateModelBadge === 'function') {
              this.chatUI.updateModelBadge(model);
            }
          }
          
          // Re-inject UI if needed
          if (this.sidebarUI && typeof this.sidebarUI.checkAndReinject === 'function') {
            this.sidebarUI.checkAndReinject();
          }
          if (this.chatUI && typeof this.chatUI.checkAndReinject === 'function') {
            this.chatUI.checkAndReinject();
          }
        } catch (e) {
          // Silently handle loop errors
        }
      }
      
      requestAnimationFrame(loop);
    };
    
    requestAnimationFrame(loop);
  }
  
  async requestData() {
    if (!window.CUP.isExtensionValid()) return;
    
    try {
      const response = await window.CUP.sendToBackground({ type: 'GET_USAGE_DATA' });
      
      if (response && response.usageData) {
        this.usageData = new window.UsageData(response.usageData);
        this.updateUI();
        window.CUP.log('Got initial data');
      } else {
        window.CUP.log('No initial data yet - will update on first message');
      }
    } catch (e) {
      // Silently handle request errors
    }
  }
}

window.ClaudeUsagePro = ClaudeUsagePro;

async function startExtension() {
  if (document.readyState === 'loading') {
    await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  }
  
  window.CUP.log('Starting...');
  const app = new ClaudeUsagePro();
  await app.initialize();
  window.__claudeUsagePro = app;
}

startExtension();
