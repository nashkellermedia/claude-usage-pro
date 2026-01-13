/**
 * Claude Usage Pro - Main Content Script
 * 
 * Orchestrates all the content script components:
 * - API Interceptor for tracking usage
 * - Sidebar UI for embedded progress bar
 * - Chat UI for conversation stats
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
    CUP.log('Initializing Claude Usage Pro...');
    
    // Initialize UI components
    this.sidebarUI = new SidebarUI();
    this.chatUI = new ChatUI();
    
    // Initialize chat UI (creates elements)
    this.chatUI.initialize();
    
    // Setup API interceptor callbacks
    this.setupInterceptor();
    
    // Start the API interceptor
    APIInterceptor.start();
    
    // Wait for page to be ready, then inject UI
    await this.waitForPage();
    
    // Initialize sidebar UI
    await this.sidebarUI.initialize();
    
    // Inject chat UI
    await this.chatUI.injectUI();
    
    // Request initial data from background
    await this.requestData();
    
    // Start update loop
    this.startUpdateLoop();
    
    // Listen for messages from background
    this.setupMessageListener();
    
    CUP.log('Claude Usage Pro initialized!');
  }
  
  /**
   * Wait for page to be ready
   */
  async waitForPage() {
    // Wait for sidebar
    await CUP.waitForElement(document, CUP.SELECTORS.SIDEBAR_NAV, 10000);
    
    // Small delay for page to stabilize
    await CUP.sleep(500);
  }
  
  /**
   * Setup API interceptor callbacks
   */
  setupInterceptor() {
    // When a message is sent
    APIInterceptor.on('onMessageSent', (data) => {
      CUP.log('Message sent:', data);
      
      // Update stats via background
      CUP.sendToBackground({
        type: 'MESSAGE_SENT',
        tokens: data.tokens,
        model: data.model || this.currentModel
      });
    });
    
    // When a response is received
    APIInterceptor.on('onMessageReceived', (data) => {
      CUP.log('Message received:', data);
      
      // Update conversation length estimate
      if (this.conversationData) {
        this.conversationData.length += data.totalTokens || 0;
        this.conversationData.messageCount++;
        
        // Update UI
        this.chatUI.updateConversation(this.conversationData, this.currentModel);
      }
      
      // Update usage via background
      CUP.sendToBackground({
        type: 'MESSAGE_RECEIVED',
        tokens: data.totalTokens || 0,
        model: this.currentModel
      });
    });
    
    // When a conversation is loaded
    APIInterceptor.on('onConversationLoaded', (data) => {
      CUP.log('Conversation loaded:', data);
      
      this.conversationData = new ConversationData({
        conversationId: data.conversationId,
        length: data.totalTokens,
        model: data.model,
        messageCount: data.messageCount,
        projectTokens: data.projectTokens,
        fileTokens: data.fileTokens,
        hasProject: data.projectTokens > 0,
        hasFiles: data.fileTokens > 0
      });
      
      this.currentConversationId = data.conversationId;
      
      // Update UI
      this.chatUI.updateConversation(this.conversationData, this.currentModel);
      
      // Notify background
      CUP.sendToBackground({
        type: 'CONVERSATION_LOADED',
        data: this.conversationData.toJSON()
      });
    });
  }
  
  /**
   * Request data from background
   */
  async requestData() {
    const response = await CUP.sendToBackground({ type: 'GET_USAGE_DATA' });
    
    if (response?.usageData) {
      this.usageData = UsageData.fromJSON(response.usageData);
      this.updateAllUI();
    }
  }
  
  /**
   * Setup message listener for background updates
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'USAGE_UPDATED') {
        this.usageData = UsageData.fromJSON(message.usageData);
        this.updateAllUI();
      }
      
      if (message.type === 'GET_CURRENT_MODEL') {
        sendResponse({ model: this.currentModel });
      }
    });
  }
  
  /**
   * Start the update loop
   */
  startUpdateLoop() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    const loop = async (timestamp) => {
      if (!this.isRunning) return;
      
      // High frequency updates (500ms)
      if (timestamp - this.lastHighUpdate >= CUP.CONFIG.HIGH_FREQ_UPDATE) {
        await this.highFrequencyUpdate();
        this.lastHighUpdate = timestamp;
      }
      
      // Medium frequency updates (1500ms)
      if (timestamp - this.lastMedUpdate >= CUP.CONFIG.MED_FREQ_UPDATE) {
        await this.mediumFrequencyUpdate();
        this.lastMedUpdate = timestamp;
      }
      
      // Low frequency updates (5000ms)
      if (timestamp - this.lastLowUpdate >= CUP.CONFIG.LOW_FREQ_UPDATE) {
        await this.lowFrequencyUpdate();
        this.lastLowUpdate = timestamp;
      }
      
      requestAnimationFrame(loop);
    };
    
    requestAnimationFrame(loop);
  }
  
  /**
   * High frequency updates - UI presence, model changes
   */
  async highFrequencyUpdate() {
    // Check model changes
    const newModel = await CUP.getCurrentModel();
    if (newModel && newModel !== this.currentModel) {
      this.currentModel = newModel;
      CUP.log('Model changed to:', this.currentModel);
      
      // Update displays with new model
      if (this.conversationData) {
        this.chatUI.updateConversation(this.conversationData, this.currentModel);
      }
    }
    
    // Update cached time display
    const cacheExpired = this.chatUI.updateCachedTime();
    if (cacheExpired && this.conversationData) {
      this.conversationData.cachedUntil = null;
    }
    
    // Check UI presence
    await this.sidebarUI.checkAndReinject();
    await this.chatUI.checkAndReinject();
  }
  
  /**
   * Medium frequency updates - conversation changes
   */
  async mediumFrequencyUpdate() {
    const newConvId = CUP.getConversationId();
    
    // Check for conversation change
    if (newConvId !== this.currentConversationId) {
      this.currentConversationId = newConvId;
      
      if (newConvId) {
        // Request conversation data
        CUP.log('Conversation changed to:', newConvId);
        await CUP.sendToBackground({
          type: 'REQUEST_CONVERSATION_DATA',
          conversationId: newConvId
        });
      } else {
        // Home page - clear conversation data
        this.conversationData = null;
        this.chatUI.clearTitleDisplay();
      }
    }
    
    // Check for expired usage data
    if (this.usageData?.isExpired()) {
      CUP.log('Usage data expired, requesting reset');
      await CUP.sendToBackground({ type: 'CHECK_RESET' });
    }
  }
  
  /**
   * Low frequency updates - reset timer
   */
  async lowFrequencyUpdate() {
    // Update reset time display
    if (this.usageData) {
      this.chatUI.updateUsage(this.usageData, this.conversationData, this.currentModel);
    }
    
    // Periodic data refresh
    await this.requestData();
  }
  
  /**
   * Update all UI components
   */
  updateAllUI() {
    if (this.usageData) {
      this.sidebarUI.update(this.usageData);
      this.chatUI.updateUsage(this.usageData, this.conversationData, this.currentModel);
    }
    
    if (this.conversationData) {
      this.chatUI.updateConversation(this.conversationData, this.currentModel);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.claudeUsagePro = new ClaudeUsagePro();
    window.claudeUsagePro.initialize();
  });
} else {
  window.claudeUsagePro = new ClaudeUsagePro();
  window.claudeUsagePro.initialize();
}
