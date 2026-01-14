/**
 * Claude Usage Pro - Main Content Script
 * Safe initialization with error handling
 */

class ClaudeUsagePro {
  constructor() {
    this.sidebarUI = null;
    this.chatUI = null;
    this.usageScraper = null;
    this.usageData = null;
    this.currentModel = 'sonnet';
  }
  
  async initialize() {
    window.CUP.log('=== Initializing Claude Usage Pro ===');
    
    try {
      // Wait for page to be ready
      await window.CUP.sleep(1500);
      
      // Initialize components one by one with error handling
      try {
        this.usageScraper = new window.UsageScraper();
        window.CUP.log('UsageScraper created');
      } catch (e) {
        window.CUP.logError('UsageScraper failed:', e);
      }
      
      try {
        this.sidebarUI = new window.SidebarUI();
        await this.sidebarUI.initialize();
        window.CUP.log('SidebarUI initialized');
      } catch (e) {
        window.CUP.logError('SidebarUI failed:', e);
      }
      
      try {
        this.chatUI = new window.ChatUI();
        this.chatUI.initialize();
        await this.chatUI.injectUI();
        window.CUP.log('ChatUI initialized');
      } catch (e) {
        window.CUP.logError('ChatUI failed:', e);
      }
      
      // Setup message listener
      this.setupMessageListener();
      
      // Load initial data
      await this.loadInitialData();
      
      // Start background tasks
      this.startBackgroundTasks();
      
      window.CUP.log('=== Claude Usage Pro Ready ===');
      
    } catch (error) {
      window.CUP.logError('Initialization failed:', error);
    }
  }
  
  setupMessageListener() {
    if (!window.CUP.isExtensionValid()) return;
    
    try {
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
    } catch (e) {}
  }
  
  async loadInitialData() {
    if (!window.CUP.isExtensionValid()) return;
    
    try {
      const response = await window.CUP.sendToBackground({ type: 'GET_USAGE_DATA' });
      if (response?.usageData) {
        this.usageData = response.usageData;
        this.updateAllUI();
      }
    } catch (e) {}
  }
  
  updateAllUI() {
    try {
      // Detect current model
      if (this.usageScraper) {
        this.currentModel = this.usageScraper.detectCurrentModel();
      }
      
      // Add model to usage data
      const dataWithModel = {
        ...this.usageData,
        currentModel: this.currentModel
      };
      
      if (this.sidebarUI) {
        this.sidebarUI.update(dataWithModel);
      }
      if (this.chatUI) {
        this.chatUI.updateUsage(dataWithModel, null, this.currentModel);
      }
    } catch (e) {
      window.CUP.logError('UI update error:', e);
    }
  }
  
  startBackgroundTasks() {
    // Initial scrape
    setTimeout(() => this.performScrape(), 3000);
    
    // Periodic scrape every 2 minutes
    setInterval(() => this.performScrape(), 2 * 60 * 1000);
    
    // Periodic UI check every 10 seconds
    setInterval(() => {
      try {
        if (this.sidebarUI) this.sidebarUI.checkAndReinject();
        if (this.chatUI) this.chatUI.checkAndReinject();
      } catch (e) {}
    }, 10000);
  }
  
  async performScrape() {
    if (!this.usageScraper || !window.CUP.isExtensionValid()) return;
    
    try {
      const data = await this.usageScraper.scrapeUsage();
      if (data) {
        window.CUP.log('Scraped:', data);
        
        const response = await window.CUP.sendToBackground({
          type: 'SYNC_SCRAPED_DATA',
          data: data
        });
        
        if (response?.usageData) {
          this.usageData = response.usageData;
          this.updateAllUI();
        }
      }
    } catch (e) {}
  }
}

window.ClaudeUsagePro = ClaudeUsagePro;

// Safe start
async function startExtension() {
  if (document.readyState === 'loading') {
    await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  }
  
  // Extra safety: wait a bit for Claude UI to initialize
  await new Promise(r => setTimeout(r, 500));
  
  window.CUP.log('Starting extension...');
  
  try {
    const app = new ClaudeUsagePro();
    await app.initialize();
    window.__claudeUsagePro = app;
  } catch (e) {
    window.CUP.logError('Failed to start:', e);
  }
}

startExtension();
