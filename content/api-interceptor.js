/**
 * Claude Usage Pro - API Interceptor
 * 
 * Intercepts fetch/XHR requests to Claude.ai API to track token usage.
 * Note: The Claude.ai web interface doesn't expose token counts directly,
 * so we estimate based on message content.
 */

class APIInterceptor {
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
    
    CUP.log('API interceptor started');
  }
  
  /**
   * Set callback functions
   */
  on(event, callback) {
    if (this.callbacks.hasOwnProperty(event)) {
      this.callbacks[event] = callback;
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
          CUP.logError('Fetch intercept error:', error);
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
      if (self.isRelevantUrl(this._cupUrl)) {
        this._cupBody = body;
        
        // Process outgoing if it's a completion
        if (self.isCompletionUrl(this._cupUrl) && body) {
          self.processOutgoingRequest(this._cupUrl, body);
        }
        
        this.addEventListener('load', function() {
          try {
            self.processXHRResponse(this._cupUrl, this.responseText);
          } catch (error) {
            CUP.logError('XHR intercept error:', error);
          }
        });
      }
      
      return originalSend.apply(this, arguments);
    };
  }
  
  /**
   * Check if URL is relevant to track
   */
  isRelevantUrl(url) {
    if (!url) return false;
    return url.includes('claude.ai/api/') || url.includes('api.claude.ai/');
  }
  
  /**
   * Check if URL is a completion/message endpoint
   */
  isCompletionUrl(url) {
    if (!url) return false;
    return url.includes('/completion') || url.includes('/retry_completion');
  }
  
  /**
   * Check if URL is a conversation load
   */
  isConversationUrl(url) {
    if (!url) return false;
    return url.match(/\/chat_conversations\/[a-f0-9-]+$/);
  }
  
  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  /**
   * Process outgoing request (message being sent)
   */
  processOutgoingRequest(url, body) {
    try {
      let data;
      if (typeof body === 'string') {
        data = JSON.parse(body);
      } else if (body instanceof FormData) {
        // FormData - harder to parse, skip for now
        return;
      } else {
        data = body;
      }
      
      // Extract message content
      if (data.prompt || data.message) {
        const text = data.prompt || data.message;
        const tokens = TokenEstimator.countTokens(text);
        
        if (this.callbacks.onMessageSent) {
          this.callbacks.onMessageSent({
            tokens,
            text: text.substring(0, 100) + '...',
            model: data.model || null
          });
        }
      }
    } catch (error) {
      CUP.logError('Error processing outgoing request:', error);
    }
  }
  
  /**
   * Process fetch response
   */
  async processResponse(url, response, requestId) {
    try {
      // Handle streaming responses (SSE)
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        await this.processStreamingResponse(url, response);
        return;
      }
      
      // Handle JSON responses
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const data = await response.json();
        this.processJSONResponse(url, data);
      }
    } catch (error) {
      // Response might already be consumed or not JSON
      CUP.logError('Error processing response:', error);
    }
  }
  
  /**
   * Process streaming response (Server-Sent Events)
   */
  async processStreamingResponse(url, response) {
    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let thinkingText = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Extract text content
              if (data.completion) {
                fullText += data.completion;
              }
              if (data.delta?.text) {
                fullText += data.delta.text;
              }
              if (data.delta?.thinking) {
                thinkingText += data.delta.thinking;
              }
            } catch (e) {
              // Not valid JSON, skip
            }
          }
        }
      }
      
      // Count tokens in the response
      const responseTokens = TokenEstimator.countTokens(fullText);
      const thinkingTokens = TokenEstimator.countTokens(thinkingText);
      
      if (this.callbacks.onMessageReceived) {
        this.callbacks.onMessageReceived({
          responseTokens,
          thinkingTokens,
          totalTokens: responseTokens + thinkingTokens
        });
      }
    } catch (error) {
      CUP.logError('Error processing streaming response:', error);
    }
  }
  
  /**
   * Process JSON response
   */
  processJSONResponse(url, data) {
    // Check if this is a conversation load
    if (this.isConversationUrl(url) && data.chat_messages) {
      this.processConversationLoad(data);
      return;
    }
    
    // Check for usage data in response
    if (data.usage) {
      if (this.callbacks.onMessageReceived) {
        this.callbacks.onMessageReceived({
          inputTokens: data.usage.input_tokens || 0,
          outputTokens: data.usage.output_tokens || 0,
          totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
        });
      }
    }
  }
  
  /**
   * Process XHR response
   */
  processXHRResponse(url, responseText) {
    try {
      const data = JSON.parse(responseText);
      this.processJSONResponse(url, data);
    } catch (error) {
      // Not JSON, skip
    }
  }
  
  /**
   * Process conversation load to calculate total tokens
   */
  processConversationLoad(data) {
    let totalTokens = 0;
    let messageCount = 0;
    
    if (data.chat_messages && Array.isArray(data.chat_messages)) {
      for (const message of data.chat_messages) {
        totalTokens += TokenEstimator.countMessageTokens(message);
        messageCount++;
      }
    }
    
    // Check for project knowledge
    let projectTokens = 0;
    if (data.project) {
      projectTokens = data.project.knowledge_tokens || 0;
    }
    
    // Check for files
    let fileTokens = 0;
    if (data.files && Array.isArray(data.files)) {
      for (const file of data.files) {
        fileTokens += TokenEstimator.estimateFileTokens(file);
      }
    }
    
    if (this.callbacks.onConversationLoaded) {
      this.callbacks.onConversationLoaded({
        conversationId: data.uuid,
        totalTokens,
        messageCount,
        projectTokens,
        fileTokens,
        model: data.model || 'claude-sonnet-4',
        name: data.name
      });
    }
  }
}

// Create singleton instance
window.APIInterceptor = new APIInterceptor();
