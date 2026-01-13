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
    CUP.log('=== Initializing Claude Usage Pro ===');
    
    try {
      // Wait for page to be somewhat ready
      CUP.log('Waiting for page to load...');
      await CUP.sleep(2000);
      
      // Initialize UI components
      CUP.log('Creating UI components...');
      this.sidebarUI = new SidebarUI();
      this.chatUI = new ChatUI();
      
      // Initialize chat UI (creates elements)
      this.chatUI.initialize();
      
      // Setup API interceptor callbacks
      this.setupInterceptor();
      
      // Start the API interceptor
      APIInterceptor.start();
      
      // Initialize sidebar UI
      CUP.log('Initializing sidebar UI...');
      await this.sidebarUI.initialize();
      
      // Inject chat UI
      CUP.log('Injecting chat UI...');
      await this.chatUI.injectUI();
      
      // Request initial data from background
      CUP.log('Requesting initial data...');
      await this.requestData();
      
      // Start update loop
      CUP.log('Starting update loop...');
      this.startUpdateLoop();
      
      // Listen for messages from background
      this.setupMessageListener();
      
      CUP.log('=== Claude Usage Pro initialized! ===');
      
    } catch (error) {
      CUP.logError('Failed to initialize:', error);
    }
  }
  
  /**
   * Setup API interceptor callbacks
   */
  setupInterceptor() {
    // When a message is sent
    APIInterceptor.on('onMessageSent', (data) => {
      CUP.log('Message sent:', data);
      
      CUP.sendToBackground({
        type: 'MESSAGE_SENT',
        tokens: data.tokens,
        model: data.model || this.currentModel
      });
    });
    
    // When a response is received
    APIInterceptor.on('onMessageReceived', (data) => {
      CUP.log('Message received:', data);
      
      if (this.conversationData) {
        this.conversationData.length += data.totalTokens || 0;
        this.conversationData.messageCount++;
        this.chatUI.updateConversation(this.conversationData, this.currentModel);
      }
      
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
      this.chatUI.updateConversation(this.conversationData, this.currentModel);
      
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
      CUP.log('Got usage data:', response.usageData);
      this.usageData = UsageData.fromJSON(response.usageData);
      this.updateAllUI();
    } else {
      CUP.logWarn('No usage data received');
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
      
      try {
        // High frequency updates (1s)
        if (timestamp - this.lastHighUpdate >= CUP.CONFIG.HIGH_FREQ_UPDATE) {
          await this.highFrequencyUpdate();
          this.lastHighUpdate = timestamp;
        }
        
        // Medium frequency updates (2s)
        if (timestamp - this.lastMedUpdate >= CUP.CONFIG.MED_FREQ_UPDATE) {
          await this.mediumFrequencyUpdate();
          this.lastMedUpdate = timestamp;
        }
        
        // Low frequency updates (5s)
        if (timestamp - this.lastLowUpdate >= CUP.CONFIG.LOW_FREQ_UPDATE) {
          await this.lowFrequencyUpdate();
          this.lastLowUpdate = timestamp;
        }
      } catch (error) {
        CUP.logError('Update loop error:', error);
      }
      
      requestAnimationFrame(loop);
    };
    
    requestAnimationFrame(loop);
  }
  
  /**
   * High frequency updates
   */
  async highFrequencyUpdate() {
    // Check model changes
    const newModel = await CUP.getCurrentModel();
    if (newModel && newModel !== this.currentModel) {
      this.currentModel = newModel;
      CUP.log('Model changed to:', this.currentModel);
      
      if (this.conversationData) {
        this.chatUI.updateConversation(this.conversationData, this.currentModel);
      }
    }
    
    // Update cached time display
    if (this.chatUI) {
      const cacheExpired = this.chatUI.updateCachedTime();
      if (cacheExpired && this.conversationData) {
        this.conversationData.cachedUntil = null;
      }
    }
    
    // Check UI presence
    if (this.sidebarUI) {
      await this.sidebarUI.checkAndReinject();
    }
    if (this.chatUI) {
      await this.chatUI.checkAndReinject();
    }
  }
  
  /**
   * Medium frequency updates
   */
  async mediumFrequencyUpdate() {
    const newConvId = CUP.getConversationId();
    
    if (newConvId !== this.currentConversationId) {
      this.currentConversationId = newConvId;
      
      if (newConvId) {
        CUP.log('Conversation changed to:', newConvId);
        await CUP.sendToBackground({
          type: 'REQUEST_CONVERSATION_DATA',
          conversationId: newConvId
        });
      } else {
        this.conversationData = null;
        if (this.chatUI) {
          this.chatUI.clearTitleDisplay();
        }
      }
    }
    
    if (this.usageData?.isExpired()) {
      CUP.log('Usage data expired');
      await CUP.sendToBackground({ type: 'CHECK_RESET' });
    }
  }
  
  /**
   * Low frequency updates
   */
  async lowFrequencyUpdate() {
    if (this.usageData && this.chatUI) {
      this.chatUI.updateUsage(this.usageData, this.conversationData, this.currentModel);
    }
    
    await this.requestData();
  }
  
  /**
   * Update all UI components
   */
  updateAllUI() {
    if (this.usageData) {
      if (this.sidebarUI) {
        this.sidebarUI.update(this.usageData);
      }
      if (this.chatUI) {
        this.chatUI.updateUsage(this.usageData, this.conversationData, this.currentModel);
      }
    }
    
    if (this.conversationData && this.chatUI) {
      this.chatUI.updateConversation(this.conversationData, this.currentModel);
    }
  }
}

// Initialize when page is ready
CUP.log('Main script loaded, waiting for page...');

function startExtension() {
  CUP.log('Starting extension...');
  window.claudeUsagePro = new ClaudeUsagePro();
  window.claudeUsagePro.initialize();
}

// Try to start after a short delay to ensure page is ready
if (document.readyState === 'complete') {
  startExtension();
} else {
  window.addEventListener('load', startExtension);
}
