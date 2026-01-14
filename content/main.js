/**
 * Claude Usage Pro - Main Content Script
 * 
 * Orchestrates all the content script components:
 * - UI injection (sidebar, top bar, input stats)
 * - API interception for token tracking
 * - Usage scraping for accurate sync
 * - Firebase sync for cross-device
 */

class ClaudeUsagePro {
  constructor() {
    this.sidebarUI = null;
    this.chatUI = null;
    this.usageScraper = null;
    this.usageData = null;
    this.conversationData = null;
    this.currentModel = 'claude-sonnet-4';
    this.currentConversationId = null;
    
    // Update loop state
    this.isRunning = false;
    this.lastUpdate = 0;
  }
  
  /**
   * Initialize the extension
   */
  async initialize() {
    window.CUP.log('=== Initializing Claude Usage Pro ===');
    
    try {
      // Inject page-world fetch interceptor
      window.CUP.log('Injecting fetch interceptor...');
      this.injectPageScript();
      
      // Setup listeners
      this.setupPageEventListener();
      this.setupMessageListener();
      
      // Wait for page to load
      await window.CUP.sleep(1500);
      
      // Initialize components
      window.CUP.log('Creating UI components...');
      this.sidebarUI = new window.SidebarUI();
      this.chatUI = new window.ChatUI();
      this.usageScraper = new window.UsageScraper();
      
      // Initialize UIs
      this.chatUI.initialize();
      await this.sidebarUI.initialize();
      await this.chatUI.injectUI();
      
      // Request initial data
      await this.requestData();
      
      // Start periodic scraping for accurate data
      this.startUsageScraping();
      
      // Start update loop
      this.startUpdateLoop();
      
      window.CUP.log('=== Claude Usage Pro initialized! ===');
      
    } catch (error) {
      window.CUP.logError('Failed to initialize:', error);
    }
  }
  
  /**
   * Inject fetch interceptor into page world
   */
  injectPageScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injections/fetch-interceptor.js');
      script.onload = function() { this.remove(); };
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      window.CUP.logError('Failed to inject page script:', error);
    }
  }
  
  /**
   * Listen for events from page-world script
   */
  setupPageEventListener() {
    window.addEventListener('CUP_API_EVENT', async (event) => {
      const { type, data } = event.detail;
      window.CUP.log('API Event:', type);
      
      try {
        switch (type) {
          case 'MESSAGE_SENT':
            await this.handleMessageSent(data);
            break;
          case 'MESSAGE_RECEIVED':
            await this.handleMessageReceived(data);
            break;
          case 'CONVERSATION_LOADED':
            await this.handleConversationLoaded(data);
            break;
        }
      } catch (error) {
        window.CUP.logError('Error handling event:', error);
      }
    });
  }
  
  /**
   * Handle message sent
   */
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
  
  /**
   * Handle message received
   */
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
  
  /**
   * Handle conversation loaded
   */
  async handleConversationLoaded(data) {
    this.currentConversationId = data.conversationId;
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
  
  /**
   * Update all UI components
   */
  updateUI() {
    if (!this.usageData) return;
    
    if (this.sidebarUI) {
      this.sidebarUI.update(this.usageData);
    }
    if (this.chatUI) {
      this.chatUI.updateUsage(this.usageData, this.conversationData, this.currentModel);
    }
  }
  
  /**
   * Listen for messages from background
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'USAGE_UPDATED' && message.usageData) {
        this.usageData = new window.UsageData(message.usageData);
        this.updateUI();
      }
      
      if (message.type === 'SCRAPE_USAGE') {
        this.triggerScrape();
      }
      
      return true;
    });
  }
  
  /**
   * Start periodic usage scraping
   */
  startUsageScraping() {
    // Initial scrape after short delay
    setTimeout(() => this.triggerScrape(), 3000);
    
    // Scrape every 5 minutes
    setInterval(() => this.triggerScrape(), 5 * 60 * 1000);
  }
  
  /**
   * Trigger a usage scrape
   */
  async triggerScrape() {
    if (!this.usageScraper) return;
    
    const data = await this.usageScraper.scrapeUsage();
    if (data) {
      window.CUP.log('Scraped usage data:', data);
      
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
  
  /**
   * Start update loop
   */
  startUpdateLoop() {
    this.isRunning = true;
    
    const loop = async () => {
      if (!this.isRunning) return;
      
      const now = Date.now();
      
      // Update every 2 seconds
      if (now - this.lastUpdate >= 2000) {
        this.lastUpdate = now;
        
        // Check model from UI
        const model = window.CUP.getCurrentModel();
        if (model && model !== this.currentModel) {
          this.currentModel = model;
          if (this.chatUI) {
            this.chatUI.updateConversation(this.conversationData, model);
          }
        }
        
        // Reinject UI if needed
        if (this.sidebarUI) this.sidebarUI.checkAndReinject();
        if (this.chatUI) this.chatUI.checkAndReinject();
      }
      
      requestAnimationFrame(loop);
    };
    
    requestAnimationFrame(loop);
  }
  
  /**
   * Request data from background
   */
  async requestData() {
    try {
      const response = await window.CUP.sendToBackground({ type: 'GET_USAGE_DATA' });
      if (response?.usageData) {
        this.usageData = new window.UsageData(response.usageData);
        this.updateUI();
      }
    } catch (error) {
      window.CUP.logError('Failed to request data:', error);
    }
  }
}

// Start extension
window.ClaudeUsagePro = ClaudeUsagePro;

async function startExtension() {
  if (document.readyState === 'loading') {
    await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  }
  
  window.CUP.log('Starting extension...');
  const app = new ClaudeUsagePro();
  await app.initialize();
  window.__claudeUsagePro = app;
}

startExtension();
