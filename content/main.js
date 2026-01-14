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
      
      // Wait for page
      await window.CUP.sleep(1500);
      
      // Create UI components
      this.sidebarUI = new window.SidebarUI();
      this.chatUI = new window.ChatUI();
      this.usageScraper = new window.UsageScraper();
      
      // Initialize UIs
      this.chatUI.initialize();
      await this.sidebarUI.initialize();
      await this.chatUI.injectUI();
      
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
      const { type, data } = event.detail;
      window.CUP.log('API Event:', type);
      
      try {
        if (type === 'MESSAGE_SENT') await this.handleMessageSent(data);
        else if (type === 'MESSAGE_RECEIVED') await this.handleMessageReceived(data);
        else if (type === 'CONVERSATION_LOADED') await this.handleConversationLoaded(data);
      } catch (e) {
        window.CUP.logError('Event error:', e);
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
  
  async handleConversationLoaded(data) {
    if (data.model) this.currentModel = data.model;
    
    this.conversationData = new window.ConversationData({
      conversationId: data.conversationId,
      length: data.totalTokens || 0,
      messageCount: data.messageCount || 0,
      model: data.model
    });
    
    if (this.chatUI) {
      this.chatUI.updateConversation(this.conversationData, this.currentModel);
    }
  }
  
  updateUI() {
    if (!this.usageData) return;
    
    if (this.sidebarUI) this.sidebarUI.update(this.usageData);
    if (this.chatUI) this.chatUI.updateUsage(this.usageData, this.conversationData, this.currentModel);
  }
  
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'USAGE_UPDATED' && message.usageData) {
        this.usageData = new window.UsageData(message.usageData);
        this.updateUI();
      }
      if (message.type === 'SCRAPE_USAGE') {
        this.triggerScrape();
      }
      sendResponse({ received: true });
      return false;
    });
  }
  
  startUsageScraping() {
    setTimeout(() => this.triggerScrape(), 5000);
    setInterval(() => this.triggerScrape(), 5 * 60 * 1000);
  }
  
  async triggerScrape() {
    if (!this.usageScraper) return;
    
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
  }
  
  startUpdateLoop() {
    this.isRunning = true;
    
    const loop = async () => {
      if (!this.isRunning) return;
      
      const now = Date.now();
      if (now - this.lastUpdate >= 2000) {
        this.lastUpdate = now;
        
        const model = window.CUP.getCurrentModel();
        if (model && model !== this.currentModel) {
          this.currentModel = model;
          if (this.chatUI) this.chatUI.updateConversation(this.conversationData, model);
        }
        
        if (this.sidebarUI) this.sidebarUI.checkAndReinject();
        if (this.chatUI) this.chatUI.checkAndReinject();
      }
      
      requestAnimationFrame(loop);
    };
    
    requestAnimationFrame(loop);
  }
  
  async requestData() {
    try {
      const response = await window.CUP.sendToBackground({ type: 'GET_USAGE_DATA' });
      
      if (response && response.usageData) {
        this.usageData = new window.UsageData(response.usageData);
        this.updateUI();
        window.CUP.log('Got initial data');
      } else {
        window.CUP.log('No initial data yet - will get on first message');
      }
    } catch (e) {
      window.CUP.logError('Request data error:', e);
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
