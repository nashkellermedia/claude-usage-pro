/**
 * Claude Usage Pro - Main Content Script
 * Coordinates all UI components and data flow
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
  }
  
  async initialize() {
    window.CUP.log('=== Initializing Claude Usage Pro ===');
    
    try {
      // Inject fetch interceptor for API monitoring
      this.injectPageScript();
      
      // Setup event listeners
      this.setupPageEventListener();
      this.setupMessageListener();
      
      // Wait for page to stabilize
      await window.CUP.sleep(1000);
      
      // Initialize components
      this.usageScraper = new window.UsageScraper();
      this.sidebarUI = new window.SidebarUI();
      this.chatUI = new window.ChatUI();
      
      // Initialize UI
      this.chatUI.initialize();
      await this.sidebarUI.initialize();
      
      // Inject chat UI elements
      await this.chatUI.injectUI();
      
      // Get initial data from storage
      await this.loadInitialData();
      
      // Start background scraping
      this.startBackgroundScraping();
      
      // Start update loop
      this.startUpdateLoop();
      
      window.CUP.log('=== Claude Usage Pro Ready ===');
      
    } catch (error) {
      window.CUP.logError('Initialization failed:', error);
    }
  }
  
  injectPageScript() {
    try {
      if (!window.CUP.isExtensionValid()) return;
      
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injections/fetch-interceptor.js');
      script.onload = function() { this.remove(); };
      (document.head || document.documentElement).appendChild(script);
      window.CUP.log('Fetch interceptor injected');
    } catch (e) {
      window.CUP.logError('Failed to inject page script:', e);
    }
  }
  
  setupPageEventListener() {
    window.addEventListener('CUP_API_EVENT', async (event) => {
      if (!window.CUP.isExtensionValid()) return;
      
      const { type, data } = event.detail;
      window.CUP.log('API Event:', type, data);
      
      try {
        switch (type) {
          case 'MESSAGE_SENT':
            await this.handleMessageSent(data);
            break;
          case 'MESSAGE_RECEIVED':
            await this.handleMessageReceived(data);
            break;
          case 'CONVERSATION_LOADED':
            this.handleConversationLoaded(data);
            break;
          case 'MODEL_DETECTED':
            this.handleModelDetected(data);
            break;
        }
      } catch (e) {
        window.CUP.logError('Event handler error:', e);
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
      this.usageData = response.usageData;
      this.updateAllUI();
    }
  }
  
  async handleMessageReceived(data) {
    if (data.model) this.currentModel = data.model;
    
    const response = await window.CUP.sendToBackground({
      type: 'MESSAGE_RECEIVED',
      tokens: data.totalTokens || data.tokens || 0,
      model: this.currentModel
    });
    
    if (response?.usageData) {
      this.usageData = response.usageData;
      this.updateAllUI();
    }
  }
  
  handleConversationLoaded(data) {
    if (data.model) this.currentModel = data.model;
    
    this.conversationData = {
      length: data.totalTokens || 0,
      messageCount: data.messageCount || 0
    };
    
    this.updateAllUI();
  }
  
  handleModelDetected(data) {
    if (data.model) {
      this.currentModel = data.model;
      this.updateAllUI();
    }
  }
  
  setupMessageListener() {
    if (!window.CUP.isExtensionValid()) return;
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (message.type === 'USAGE_UPDATED' && message.usageData) {
          this.usageData = message.usageData;
          this.updateAllUI();
        }
        if (message.type === 'SCRAPE_USAGE') {
          this.performScrape();
        }
      } catch (e) {}
      sendResponse({ received: true });
      return false;
    });
  }
  
  async loadInitialData() {
    if (!window.CUP.isExtensionValid()) return;
    
    try {
      const response = await window.CUP.sendToBackground({ type: 'GET_USAGE_DATA' });
      
      if (response?.usageData) {
        this.usageData = response.usageData;
        this.updateAllUI();
        window.CUP.log('Loaded initial usage data');
      }
    } catch (e) {
      window.CUP.logError('Failed to load initial data:', e);
    }
  }
  
  updateAllUI() {
    try {
      if (this.sidebarUI) {
        this.sidebarUI.update(this.usageData);
      }
      if (this.chatUI) {
        this.chatUI.updateUsage(this.usageData, this.conversationData, this.currentModel);
      }
    } catch (e) {
      window.CUP.logError('UI update error:', e);
    }
  }
  
  startBackgroundScraping() {
    // Initial scrape after 3 seconds
    setTimeout(() => this.performScrape(), 3000);
    
    // Periodic scrape every 2 minutes
    setInterval(() => this.performScrape(), 2 * 60 * 1000);
  }
  
  async performScrape() {
    if (!this.usageScraper || !window.CUP.isExtensionValid()) return;
    
    try {
      // Detect current model
      const detectedModel = this.usageScraper.detectCurrentModel();
      if (detectedModel && detectedModel !== this.currentModel) {
        this.currentModel = detectedModel;
        window.CUP.log('Model detected:', detectedModel);
      }
      
      // Scrape usage
      const data = await this.usageScraper.scrapeUsage();
      if (data) {
        window.CUP.log('Scraped data:', data);
        
        const response = await window.CUP.sendToBackground({
          type: 'SYNC_SCRAPED_DATA',
          data: data
        });
        
        if (response?.usageData) {
          this.usageData = response.usageData;
          this.updateAllUI();
        }
      }
    } catch (e) {
      // Silent fail
    }
  }
  
  startUpdateLoop() {
    this.isRunning = true;
    
    const loop = () => {
      if (!this.isRunning || !window.CUP.isExtensionValid()) return;
      
      try {
        // Re-inject UI if removed
        if (this.sidebarUI) this.sidebarUI.checkAndReinject();
        if (this.chatUI) this.chatUI.checkAndReinject();
      } catch (e) {}
      
      setTimeout(loop, 5000);
    };
    
    loop();
  }
}

// Make available globally
window.ClaudeUsagePro = ClaudeUsagePro;

// Start extension
async function startExtension() {
  // Wait for DOM
  if (document.readyState === 'loading') {
    await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  }
  
  window.CUP.log('Starting extension...');
  
  const app = new ClaudeUsagePro();
  await app.initialize();
  window.__claudeUsagePro = app;
}

startExtension();
