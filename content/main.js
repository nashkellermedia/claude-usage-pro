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
      
      // Setup API interceptor callbacks (with retry)
      await this.setupInterceptorWithRetry();
      
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
   * Setup API interceptor with retry logic
   */
  async setupInterceptorWithRetry() {
    // Try up to 5 times with 200ms delay
    for (let i = 0; i < 5; i++) {
      if (window.APIInterceptor && typeof window.APIInterceptor.on === 'function') {
        this.setupInterceptor();
        
        // Start the interceptor
        if (typeof window.APIInterceptor.start === 'function') {
          window.APIInterceptor.start();
        }
        return;
      }
      CUP.log(`Waiting for APIInterceptor... attempt ${i + 1}/5`);
      await CUP.sleep(200);
    }
    
    CUP.logWarn('APIInterceptor not available after retries, will rely on DOM observation');
  }
  
  /**
   * Setup API interceptor callbacks
   */
  setupInterceptor() {
    CUP.log('Setting up APIInterceptor callbacks...');
    
    // When a message is sent
    window.APIInterceptor.on('onMessageSent', (data) => {
      CUP.log('Message sent:', data);
      
      CUP.sendToBackground({
        type: 'MESSAGE_SENT',
        tokens: data.tokens,
        model: data.model || this.currentModel
      });
    });
    
    // When a response is received
    window.APIInterceptor.on('onMessageReceived', (data) => {
      CUP.log('Message received:', data);
      
      if (this.conversationData) {
        this.conversationData.length += data.totalTokens || 0;
        this.conversationData.messageCount++;
        this.chatUI.updateConversation(this.conversationData, this.currentModel);
      }
      
      CUP.sendToBackground({
        type: 'MESSAGE_RECEIVED',
        tokens: data.totalTokens,
        model: this.currentModel
      });
    });
    
    // When a conversation is loaded
    window.APIInterceptor.on('onConversationLoaded', (data) => {
      CUP.log('Conversation loaded:', data);
      
      this.currentConversationId = data.conversationId;
      this.currentModel = data.model || this.currentModel;
      
      this.conversationData = new ConversationData(
        data.conversationId,
        data.totalTokens,
        data.messageCount,
        data.model,
        data.projectTokens,
        data.fileTokens
      );
      
      // Update chat UI
      this.chatUI.updateConversation(this.conversationData, this.currentModel);
    });
    
    CUP.log('API interceptor callbacks registered successfully');
  }
  
  /**
   * Start the update loop
   */
  startUpdateLoop() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    const loop = async () => {
      if (!this.isRunning) return;
      
      const now = Date.now();
      
      try {
        // High frequency updates (every 1s) - progress bar animations
        if (now - this.lastHighUpdate >= CUP.UPDATE_INTERVALS.HIGH_FREQ) {
          this.lastHighUpdate = now;
          // Smooth progress bar updates handled by CSS
        }
        
        // Medium frequency updates (every 2s) - check model, reinject if needed
        if (now - this.lastMedUpdate >= CUP.UPDATE_INTERVALS.MED_FREQ) {
          this.lastMedUpdate = now;
          
          // Check current model from UI
          const modelFromUI = CUP.getCurrentModel();
          if (modelFromUI && modelFromUI !== this.currentModel) {
            this.currentModel = modelFromUI;
            CUP.log('Model changed to:', modelFromUI);
          }
          
          // Ensure UI is still injected
          this.sidebarUI.checkAndReinject();
          this.chatUI.checkAndReinject();
        }
        
        // Low frequency updates (every 5s) - sync with background
        if (now - this.lastLowUpdate >= CUP.UPDATE_INTERVALS.LOW_FREQ) {
          this.lastLowUpdate = now;
          await this.requestData();
        }
        
      } catch (error) {
        CUP.logError('Update loop error:', error);
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
      const response = await CUP.sendToBackground({ type: 'GET_USAGE_DATA' });
      
      if (response && response.success) {
        this.usageData = new UsageData(
          response.data.tokensUsed,
          response.data.tokenQuota,
          response.data.resetTime,
          response.data.plan,
          response.data.messageHistory
        );
        
        // Update sidebar
        this.sidebarUI.update(this.usageData);
        
        // Update chat UI quota area
        this.chatUI.updateQuota(this.usageData, this.currentModel);
      }
    } catch (error) {
      CUP.logError('Failed to request data:', error);
    }
  }
  
  /**
   * Setup message listener for background script updates
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'USAGE_UPDATE') {
        this.usageData = new UsageData(
          message.data.tokensUsed,
          message.data.tokenQuota,
          message.data.resetTime,
          message.data.plan,
          message.data.messageHistory
        );
        
        // Update all UI
        this.sidebarUI.update(this.usageData);
        this.chatUI.updateQuota(this.usageData, this.currentModel);
        
        sendResponse({ received: true });
      }
      
      return true;
    });
  }
  
  /**
   * Stop the extension
   */
  stop() {
    this.isRunning = false;
    this.sidebarUI.remove();
    this.chatUI.remove();
  }
}

// Global instance
let claudeUsagePro = null;

// Start extension
async function startExtension() {
  // Wait for DOM
  if (document.readyState !== 'complete') {
    await new Promise(resolve => {
      window.addEventListener('load', resolve, { once: true });
    });
  }
  
  // Additional wait for Claude's SPA to hydrate
  await CUP.sleep(1000);
  
  CUP.log('Starting extension...');
  claudeUsagePro = new ClaudeUsagePro();
  await claudeUsagePro.initialize();
}

// Initialize
startExtension().catch(error => {
  CUP.logError('Failed to start extension:', error);
});

CUP.log('Main script loaded, waiting for page...');
