/**
 * Claude Usage Pro - API Interceptor
 * 
 * Intercepts fetch/XHR requests to Claude.ai API to track token usage.
 * Note: The Claude.ai web interface doesn't expose token counts directly,
 * so we estimate based on message content.
 */

class APIInterceptorClass {
  constructor() {
    this.isActive = false;
    this.pendingRequests = new Map();
    this.callbacks = {
      onMessageSent: null,
      onMessageReceived: null,
      onConversationLoaded: null
    };
  }
  
  /**
   * Start intercepting API calls
   */
  start() {
    if (this.isActive) return;
    
    this.interceptFetch();
    this.interceptXHR();
    this.isActive = true;
    
    window.CUP.log('API interceptor started');
  }
  
  /**
   * Set callback functions
   */
  on(event, callback) {
    if (this.callbacks.hasOwnProperty(event)) {
      this.callbacks[event] = callback;
      window.CUP.log('Registered callback for:', event);
    }
  }
  
  /**
   * Intercept fetch API
   */
  interceptFetch() {
    const self = this;
    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
      const [url, options] = args;
      const urlString = typeof url === 'string' ? url : url.toString();
      
      // Check if this is a Claude API call we care about
      if (self.isRelevantUrl(urlString)) {
        try {
          // Track the request
          const requestId = self.generateRequestId();
          self.pendingRequests.set(requestId, {
            url: urlString,
            method: options?.method || 'GET',
            body: options?.body,
            timestamp: Date.now()
          });
          
          // Process request body if it's a message send
          if (self.isCompletionUrl(urlString) && options?.body) {
            self.processOutgoingRequest(urlString, options.body);
          }
          
          // Execute the fetch
          const response = await originalFetch.apply(this, args);
          
          // Clone and process response
          const clonedResponse = response.clone();
          self.processResponse(urlString, clonedResponse, requestId);
          
          self.pendingRequests.delete(requestId);
          return response;
          
        } catch (error) {
          window.CUP.logError('Fetch intercept error:', error);
          return originalFetch.apply(this, args);
        }
      }
      
      return originalFetch.apply(this, args);
    };
  }
  
  /**
   * Intercept XMLHttpRequest
   */
  interceptXHR() {
    const self = this;
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._cupUrl = url;
      this._cupMethod = method;
      return originalOpen.apply(this, [method, url, ...rest]);
    };
    
    XMLHttpRequest.prototype.send = function(body) {
      const xhr = this;
      const url = this._cupUrl;
      
      if (self.isRelevantUrl(url)) {
        if (self.isCompletionUrl(url) && body) {
          self.processOutgoingRequest(url, body);
        }
        
        xhr.addEventListener('load', function() {
          self.processXHRResponse(url, xhr);
        });
      }
      
      return originalSend.apply(this, [body]);
    };
  }
  
  /**
   * Check if URL is relevant for tracking
   */
  isRelevantUrl(url) {
    return url.includes('claude.ai/api') || 
           url.includes('/api/organizations') ||
           url.includes('/api/chat_conversations');
  }
  
  /**
   * Check if URL is a completion/message endpoint
   */
  isCompletionUrl(url) {
    return url.includes('/completion') || 
           url.includes('/chat') ||
           url.includes('/retry_completion');
  }
  
  /**
   * Check if URL is a conversation load
   */
  isConversationUrl(url) {
    return url.includes('/chat_conversations/') && !url.includes('/completion');
  }
  
  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Process outgoing request (user message)
   */
  processOutgoingRequest(url, body) {
    try {
      let data;
      if (typeof body === 'string') {
        data = JSON.parse(body);
      } else if (body instanceof FormData) {
        return; // Skip FormData for now
      } else {
        data = body;
      }
      
      // Extract prompt/message
      const prompt = data.prompt || data.content || '';
      const attachments = data.attachments || [];
      
      // Estimate tokens
      let tokens = 0;
      
      if (prompt) {
        tokens += window.TokenEstimator ? 
          window.TokenEstimator.countTokens(prompt) : 
          Math.ceil(prompt.length / 4);
      }
      
      // Add attachment token estimates
      for (const att of attachments) {
        if (att.extracted_content) {
          tokens += window.TokenEstimator ?
            window.TokenEstimator.countTokens(att.extracted_content) :
            Math.ceil(att.extracted_content.length / 4);
        }
      }
      
      // Trigger callback
      if (this.callbacks.onMessageSent && tokens > 0) {
        this.callbacks.onMessageSent({
          tokens,
          model: data.model,
          hasAttachments: attachments.length > 0
        });
      }
      
    } catch (error) {
      window.CUP.logError('Error processing outgoing request:', error);
    }
  }
  
  /**
   * Process fetch response
   */
  async processResponse(url, response, requestId) {
    try {
      const contentType = response.headers.get('content-type') || '';
      
      // Handle conversation load
      if (this.isConversationUrl(url) && contentType.includes('application/json')) {
        const data = await response.json();
        this.processConversationLoad(url, data);
        return;
      }
      
      // Handle streaming response (SSE)
      if (contentType.includes('text/event-stream') || this.isCompletionUrl(url)) {
        await this.processStreamingResponse(response);
      }
      
    } catch (error) {
      window.CUP.logError('Error processing response:', error);
    }
  }
  
  /**
   * Process XHR response
   */
  processXHRResponse(url, xhr) {
    try {
      if (this.isConversationUrl(url)) {
        const data = JSON.parse(xhr.responseText);
        this.processConversationLoad(url, data);
      }
    } catch (error) {
      window.CUP.logError('Error processing XHR response:', error);
    }
  }
  
  /**
   * Process streaming response (SSE)
   */
  async processStreamingResponse(response) {
    try {
      const reader = response.body?.getReader();
      if (!reader) return;
      
      const decoder = new TextDecoder();
      let totalText = '';
      let thinkingText = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') continue;
            
            try {
              const data = JSON.parse(jsonStr);
              
              // Handle different response formats
              if (data.completion) {
                totalText += data.completion;
              } else if (data.delta?.text) {
                totalText += data.delta.text;
              } else if (data.content?.[0]?.text) {
                totalText += data.content[0].text;
              }
              
              // Handle thinking/reasoning tokens
              if (data.thinking) {
                thinkingText += data.thinking;
              }
              
            } catch (e) {
              // Not valid JSON, skip
            }
          }
        }
      }
      
      // Calculate total tokens
      const textTokens = window.TokenEstimator ?
        window.TokenEstimator.countTokens(totalText) :
        Math.ceil(totalText.length / 4);
        
      const thinkingTokens = window.TokenEstimator ?
        window.TokenEstimator.countTokens(thinkingText) :
        Math.ceil(thinkingText.length / 4);
      
      // Trigger callback
      if (this.callbacks.onMessageReceived) {
        this.callbacks.onMessageReceived({
          textTokens,
          thinkingTokens,
          totalTokens: textTokens + thinkingTokens
        });
      }
      
    } catch (error) {
      window.CUP.logError('Error processing streaming response:', error);
    }
  }
  
  /**
   * Process conversation load
   */
  processConversationLoad(url, data) {
    try {
      const conversationId = url.match(/chat_conversations\/([a-f0-9-]+)/)?.[1];
      const messages = data.chat_messages || [];
      const model = data.model || 'claude-sonnet-4';
      
      let totalTokens = 0;
      let projectTokens = 0;
      let fileTokens = 0;
      
      // Process all messages
      for (const msg of messages) {
        // User messages
        if (msg.text) {
          totalTokens += window.TokenEstimator ?
            window.TokenEstimator.countTokens(msg.text) :
            Math.ceil(msg.text.length / 4);
        }
        
        // Assistant messages
        if (msg.content) {
          for (const block of msg.content) {
            if (block.text) {
              totalTokens += window.TokenEstimator ?
                window.TokenEstimator.countTokens(block.text) :
                Math.ceil(block.text.length / 4);
            }
          }
        }
        
        // Attachments
        if (msg.attachments) {
          for (const att of msg.attachments) {
            if (att.extracted_content) {
              fileTokens += window.TokenEstimator ?
                window.TokenEstimator.countTokens(att.extracted_content) :
                Math.ceil(att.extracted_content.length / 4);
            }
          }
        }
      }
      
      // Add project context if present
      if (data.project) {
        const projectContext = data.project.prompt_template || '';
        projectTokens = window.TokenEstimator ?
          window.TokenEstimator.countTokens(projectContext) :
          Math.ceil(projectContext.length / 4);
      }
      
      totalTokens += fileTokens + projectTokens;
      
      // Trigger callback
      if (this.callbacks.onConversationLoaded) {
        this.callbacks.onConversationLoaded({
          conversationId,
          totalTokens,
          model,
          messageCount: messages.length,
          projectTokens,
          fileTokens
        });
      }
      
    } catch (error) {
      window.CUP.logError('Error processing conversation load:', error);
    }
  }
}

// Create singleton instance and expose globally
window.APIInterceptor = new APIInterceptorClass();

window.CUP.log('APIInterceptor loaded (singleton instance)');
