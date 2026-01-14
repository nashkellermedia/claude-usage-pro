/**
 * Claude Usage Pro - Main Content Script
 * 
 * Orchestrates all the content script components
 */

class ClaudeUsagePro {
  constructor() {
    this.sidebarUI = null;
    this.chatUI = null;
    this.usageData = null;
    this.conversationData = null;
    this.currentModel = 'claude-sonnet-4';
    this.currentConversationId = null;
    
    // Update loop state
    this.isRunning = false;
    this.lastHighUpdate = 0;
    this.lastMedUpdate = 0;
    this.lastLowUpdate = 0;
  }
  
  /**
   * Initialize the extension
   */
  async initialize() {
    window.CUP.log('=== Initializing Claude Usage Pro ===');
    
    try {
      // Inject page-world fetch interceptor FIRST
      window.CUP.log('Injecting fetch interceptor into page...');
      this.injectPageScript();
      
      // Setup listener for events from page script
      this.setupPageEventListener();
      
      // Wait for page to be somewhat ready
      window.CUP.log('Waiting for page to load...');
      await window.CUP.sleep(1500);
      
      // Initialize UI components
      window.CUP.log('Creating UI components...');
      this.sidebarUI = new window.SidebarUI();
      this.chatUI = new window.ChatUI();
      
      // Initialize chat UI (creates elements)
      this.chatUI.initialize();
      
      // Initialize sidebar UI
      window.CUP.log('Initializing sidebar UI...');
      await this.sidebarUI.initialize();
      
      // Inject chat UI
      window.CUP.log('Injecting chat UI...');
      await this.chatUI.injectUI();
      
      // Request initial data from background
      window.CUP.log('Requesting initial data...');
      await this.requestData();
      
      // Start update loop
      window.CUP.log('Starting update loop...');
      this.startUpdateLoop();
      
      // Listen for messages from background
      this.setupMessageListener();
      
      window.CUP.log('=== Claude Usage Pro initialized! ===');
      
    } catch (error) {
      window.CUP.logError('Failed to initialize:', error);
    }
  }
  
  /**
   * Inject fetch interceptor script into page's main world
   */
  injectPageScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injections/fetch-interceptor.js');
      script.onload = function() {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(script);
      window.CUP.log('Page script injection initiated');
    } catch (error) {
      window.CUP.logError('Failed to inject page script:', error);
    }
  }
  
  /**
   * Listen for events from the page-world script
   */
  setupPageEventListener() {
    window.addEventListener('CUP_API_EVENT', async (event) => {
      const { type, data } = event.detail;
      
      window.CUP.log('Received page event:', type, data);
      
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
        window.CUP.logError('Error handling page event:', error);
      }
    });
    
    window.CUP.log('Page event listener setup complete');
  }
  
  /**
   * Handle message sent event
   */
  async handleMessageSent(data) {
    window.CUP.log('Message sent:', data);
    
    // Update model if provided
    if (data.model) {
      this.currentModel = data.model;
    }
    
    // Send to background
    window.CUP.log('Sending MESSAGE_SENT to background...');
    const response = await window.CUP.sendToBackground({
      type: 'MESSAGE_SENT',
      tokens: data.tokens,
      model: this.currentModel
    });
    
    window.CUP.log('Background response for MESSAGE_SENT:', response);
    
    if (response?.usageData) {
      this.usageData = new window.UsageData(response.usageData);
      window.CUP.log('Updating UI with usage data:', this.usageData);
      this.updateUI();
    } else {
      window.CUP.log('No usageData in response');
    }
  }
  
  /**
   * Handle message received event
   */
  async handleMessageReceived(data) {
    window.CUP.log('Message received:', data);
    
    // Update model if provided
    if (data.model) {
      this.currentModel = data.model;
    }
    
    // Send to background
    window.CUP.log('Sending MESSAGE_RECEIVED to background...');
    const response = await window.CUP.sendToBackground({
      type: 'MESSAGE_RECEIVED',
      tokens: data.totalTokens,
      model: this.currentModel
    });
    
    window.CUP.log('Background response for MESSAGE_RECEIVED:', response);
    
    if (response?.usageData) {
      this.usageData = new window.UsageData(response.usageData);
      window.CUP.log('Updating UI with usage data:', this.usageData);
      this.updateUI();
    } else {
      window.CUP.log('No usageData in response');
    }
  }
  
  /**
   * Handle conversation loaded event
   */
  async handleConversationLoaded(data) {
    window.CUP.log('Conversation loaded:', data);
    
    this.currentConversationId = data.conversationId;
    
    if (data.model) {
      this.currentModel = data.model;
    }
    
    // Create conversation data object
    this.conversationData = new window.ConversationData({
      conversationId: data.conversationId,
      length: data.totalTokens,
      totalTokens: data.totalTokens,
      messageCount: data.messageCount,
      projectTokens: data.projectTokens,
      fileTokens: data.fileTokens
    });
    
    // Update chat UI with conversation context
    if (this.chatUI) {
      this.chatUI.updateConversation(this.conversationData, this.currentModel);
    }
  }
  
  /**
   * Update all UI components
   */
  updateUI() {
    window.CUP.log('updateUI called, usageData exists:', !!this.usageData);
    
    if (this.usageData) {
      const percentage = this.usageData.getUsagePercentage();
      window.CUP.log('Usage percentage:', percentage.toFixed(2) + '%');
      window.CUP.log('Weighted total:', this.usageData.getWeightedTotal());
      window.CUP.log('Usage cap:', this.usageData.usageCap);
      
      if (this.sidebarUI) {
        window.CUP.log('Calling sidebarUI.update()...');
        this.sidebarUI.update(this.usageData);
      } else {
        window.CUP.logWarn('sidebarUI is null!');
      }
      
      if (this.chatUI) {
        this.chatUI.updateUsage(this.usageData, this.conversationData, this.currentModel);
      }
    } else {
      window.CUP.logWarn('usageData is null in updateUI');
    }
  }
  
  /**
   * Setup message listener for background script
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'USAGE_UPDATED' && message.usageData) {
        window.CUP.log('Received USAGE_UPDATED from background');
        this.usageData = new window.UsageData(message.usageData);
        this.updateUI();
      }
      return true;
    });
  }
  
  /**
   * Start the update loop
   */
  startUpdateLoop() {
    this.isRunning = true;
    
    const loop = async () => {
      if (!this.isRunning) return;
      
      const now = Date.now();
      
      try {
        // High frequency updates (every 1s) - progress bar animations
        if (now - this.lastHighUpdate >= window.CUP.CONFIG.HIGH_FREQ_UPDATE) {
          this.lastHighUpdate = now;
          // Smooth progress bar updates handled by CSS
        }
        
        // Medium frequency updates (every 2s) - check model, reinject if needed
        if (now - this.lastMedUpdate >= window.CUP.CONFIG.MED_FREQ_UPDATE) {
          this.lastMedUpdate = now;
          
          // Check current model from UI
          const modelFromUI = window.CUP.getCurrentModel();
          if (modelFromUI && modelFromUI !== this.currentModel) {
            this.currentModel = modelFromUI;
            window.CUP.log('Model changed to:', modelFromUI);
          }
          
          // Ensure UI is still injected
          if (this.sidebarUI) this.sidebarUI.checkAndReinject();
          if (this.chatUI) this.chatUI.checkAndReinject();
        }
        
        // Low frequency updates (every 5s) - sync with background
        if (now - this.lastLowUpdate >= window.CUP.CONFIG.LOW_FREQ_UPDATE) {
          this.lastLowUpdate = now;
          await this.requestData();
        }
        
      } catch (error) {
        window.CUP.logError('Update loop error:', error);
      }
      
      // Schedule next iteration
      requestAnimationFrame(loop);
    };
    
    requestAnimationFrame(loop);
  }
  
  /**
   * Request data from background script
   */
  async requestData() {
    try {
      window.CUP.log('Requesting data from background...');
      const response = await window.CUP.sendToBackground({ type: 'GET_USAGE_DATA' });
      
      window.CUP.log('requestData response:', response);
      
      if (response && response.usageData) {
        this.usageData = new window.UsageData(response.usageData);
        window.CUP.log('Got usage data, updating UI...');
        this.updateUI();
      } else {
        window.CUP.logWarn('No usageData in requestData response');
      }
    } catch (error) {
      window.CUP.logError('Failed to request data:', error);
    }
  }
}

// Make class available globally
window.ClaudeUsagePro = ClaudeUsagePro;

window.CUP.log('Main script loaded, waiting for page...');

/**
 * Start the extension
 */
async function startExtension() {
  // Wait for document to be ready
  if (document.readyState === 'loading') {
    await new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', resolve);
    });
  }
  
  window.CUP.log('Starting extension...');
  
  const app = new window.ClaudeUsagePro();
  await app.initialize();
  
  // Store reference for debugging
  window.__claudeUsagePro = app;
}

// Start when ready
startExtension();
