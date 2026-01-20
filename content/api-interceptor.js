/**
 * Claude Usage Pro - API Interceptor
 * 
 * Intercepts fetch/XHR requests to Claude.ai API to:
 * 1. Track token usage from conversations
 * 2. Capture usage/billing data when available
 * 3. Detect when messages are sent (to clear attachment tracking)
 */

class APIInterceptorClass {
  constructor() {
    this.isActive = false;
    this.pendingRequests = new Map();
    this.callbacks = {
      onMessageSent: null,
      onMessageReceived: null,
      onConversationLoaded: null,
      onUsageDataReceived: null
    };
    this.lastUsageData = null;
    this.lastModel = null;  // Track model for output tokens
  }
  
  start() {
    if (this.isActive) return;
    
    this.interceptFetch();
    this.interceptXHR();
    this.isActive = true;
    
    window.CUP.log('API interceptor started - monitoring Claude API calls');
  }
  
  on(event, callback) {
    if (this.callbacks.hasOwnProperty(event)) {
      this.callbacks[event] = callback;
      window.CUP.log('Registered callback for:', event);
    }
  }
  
  interceptFetch() {
    const self = this;
    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
      const [url, options] = args;
      const urlString = typeof url === 'string' ? url : url.toString();
      
      if (self.isRelevantUrl(urlString)) {
        try {
          const requestId = self.generateRequestId();
          self.pendingRequests.set(requestId, {
            url: urlString,
            method: options?.method || 'GET',
            body: options?.body,
            timestamp: Date.now()
          });
          
          window.CUP.log('Intercepted:', options?.method || 'GET', urlString.substring(0, 80));
          
          if (self.isCompletionUrl(urlString) && options?.body) {
            window.CUP.log('Processing outgoing message...');
            self.processOutgoingRequest(urlString, options.body);
          }
          
          const response = await originalFetch.apply(this, args);
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
  
  isRelevantUrl(url) {
    // Match any Claude API call
    return url.includes('claude.ai/api') ||
           url.includes('claude.ai/api/') ||
           url.includes('/api/organizations') ||
           url.includes('/api/chat_conversations') ||
           url.includes('/api/append_message') ||
           url.includes('/api/converstion') ||
           url.includes('/api/usage') ||
           url.includes('/api/billing') ||
           url.includes('/api/account') ||
           url.includes('/api/') ||
           url.includes('/settings/usage');
  }
  
  isCompletionUrl(url) {
    return url.includes('/completion') || 
           url.includes('/append_message') ||
           url.includes('/chat_conversations') ||
           url.includes('/retry_completion') ||
           url.includes('/retry');
  }
  
  isConversationUrl(url) {
    return url.includes('/chat_conversations/') && !url.includes('/completion');
  }
  
  isUsageUrl(url) {
    return url.includes('/usage') || 
           url.includes('/billing') || 
           url.includes('/rate_limit') ||
           url.includes('/quota');
  }
  
  generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  processOutgoingRequest(url, body) {
    try {
      let data;
      if (typeof body === 'string') {
        data = JSON.parse(body);
      } else if (body instanceof FormData) {
        return;
      } else {
        data = body;
      }
      
      const prompt = data.prompt || data.content || '';
      const attachments = data.attachments || [];
      
      let tokens = 0;
      
      if (prompt) {
        tokens += window.TokenCounter ? 
          window.TokenCounter.estimateTokens(prompt) : 
          Math.ceil(prompt.length / 4);
      }
      
      for (const att of attachments) {
        if (att.extracted_content) {
          tokens += window.TokenCounter ?
            window.TokenCounter.estimateTokens(att.extracted_content) :
            Math.ceil(att.extracted_content.length / 4);
        }
      }
      
      if (this.callbacks.onMessageSent) {
        this.callbacks.onMessageSent({
          tokens,
          model: data.model,
          hasAttachments: attachments.length > 0
        });
      }
      
      // Send token delta to background for hybrid tracking
      window.CUP.log('Sending input tokens to background:', tokens);
      try {
        chrome.runtime.sendMessage({
          type: 'ADD_TOKEN_DELTA',
          inputTokens: tokens,
          outputTokens: 0,
          model: data.model
        }).catch(() => {});
        
        // Store model for output token tracking
        this.lastModel = data.model;
      } catch (e) {
        window.CUP.logError('Failed to send input tokens:', e);
      }
      
    } catch (error) {
      window.CUP.logError('Error processing outgoing request:', error);
    }
  }
  
  async processResponse(url, response, requestId) {
    try {
      const contentType = response.headers.get('content-type') || '';
      
      // Check for usage data in responses
      if (this.isUsageUrl(url) && contentType.includes('application/json')) {
        const data = await response.json();
        this.processUsageData(url, data);
        return;
      }
      
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
      
      // Check for usage info in any JSON response
      if (contentType.includes('application/json')) {
        try {
          const data = await response.json();
          if (data.usage || data.rate_limit || data.quota || data.billing) {
            this.processUsageData(url, data);
          }
        } catch (e) {}
      }
      
    } catch (error) {
      window.CUP.logError('Error processing response:', error);
    }
  }
  
  processXHRResponse(url, xhr) {
    try {
      if (this.isConversationUrl(url)) {
        const data = JSON.parse(xhr.responseText);
        this.processConversationLoad(url, data);
      }
      
      if (this.isUsageUrl(url)) {
        try {
          const data = JSON.parse(xhr.responseText);
          this.processUsageData(url, data);
        } catch (e) {}
      }
    } catch (error) {
      window.CUP.logError('Error processing XHR response:', error);
    }
  }
  
  /**
   * Process usage/billing data from API
   */
  processUsageData(url, data) {
    window.CUP.log('API Interceptor: Received potential usage data from', url);
    
    // Look for usage information in various formats
    let usageInfo = null;
    
    if (data.usage) {
      usageInfo = data.usage;
    } else if (data.rate_limit) {
      usageInfo = data.rate_limit;
    } else if (data.quota) {
      usageInfo = data.quota;
    } else if (data.messageLimit || data.message_limit) {
      usageInfo = {
        messageLimit: data.messageLimit || data.message_limit,
        messagesUsed: data.messagesUsed || data.messages_used
      };
    }
    
    if (usageInfo) {
      window.CUP.log('API Interceptor: Found usage info:', usageInfo);
      this.lastUsageData = usageInfo;
      
      if (this.callbacks.onUsageDataReceived) {
        this.callbacks.onUsageDataReceived(usageInfo);
      }
    }
  }
  
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
              
              if (data.completion) {
                totalText += data.completion;
              } else if (data.delta?.text) {
                totalText += data.delta.text;
              } else if (data.content?.[0]?.text) {
                totalText += data.content[0].text;
              }
              
              if (data.thinking) {
                thinkingText += data.thinking;
              }
              
              // Check for usage info in streaming response
              if (data.usage || data.rate_limit) {
                this.processUsageData('streaming', data);
              }
              
            } catch (e) {}
          }
        }
      }
      
      const textTokens = window.TokenCounter ?
        window.TokenCounter.estimateTokens(totalText) :
        Math.ceil(totalText.length / 4);
        
      const thinkingTokens = window.TokenCounter ?
        window.TokenCounter.estimateTokens(thinkingText) :
        Math.ceil(thinkingText.length / 4);
      
      if (this.callbacks.onMessageReceived) {
        this.callbacks.onMessageReceived({
          textTokens,
          thinkingTokens,
          totalTokens: textTokens + thinkingTokens
        });
      }
      
      // Send token delta to background for hybrid tracking
      const outputTotal = textTokens + thinkingTokens;
      if (outputTotal > 0) {
        window.CUP.log('Sending output tokens to background:', outputTotal, '(text:', textTokens, 'thinking:', thinkingTokens + ')');
      }
      try {
        chrome.runtime.sendMessage({
          type: 'ADD_TOKEN_DELTA',
          inputTokens: 0,
          outputTokens: outputTotal,
          model: this.lastModel
        }).catch(() => {});
      } catch (e) {
        window.CUP.logError('Failed to send output tokens:', e);
      }
      
    } catch (error) {
      window.CUP.logError('Error processing streaming response:', error);
    }
  }
  
  processConversationLoad(url, data) {
    try {
      const conversationId = url.match(/chat_conversations\/([a-f0-9-]+)/)?.[1];
      const messages = data.chat_messages || [];
      const model = data.model || 'claude-sonnet-4';
      
      let totalTokens = 0;
      let projectTokens = 0;
      let fileTokens = 0;
      
      for (const msg of messages) {
        if (msg.text) {
          totalTokens += window.TokenCounter ?
            window.TokenCounter.estimateTokens(msg.text) :
            Math.ceil(msg.text.length / 4);
        }
        
        if (msg.content) {
          for (const block of msg.content) {
            if (block.text) {
              totalTokens += window.TokenCounter ?
                window.TokenCounter.estimateTokens(block.text) :
                Math.ceil(block.text.length / 4);
            }
          }
        }
        
        if (msg.attachments) {
          for (const att of msg.attachments) {
            if (att.extracted_content) {
              fileTokens += window.TokenCounter ?
                window.TokenCounter.estimateTokens(att.extracted_content) :
                Math.ceil(att.extracted_content.length / 4);
            }
          }
        }
      }
      
      if (data.project) {
        const projectContext = data.project.prompt_template || '';
        projectTokens = window.TokenCounter ?
          window.TokenCounter.estimateTokens(projectContext) :
          Math.ceil(projectContext.length / 4);
      }
      
      totalTokens += fileTokens + projectTokens;
      
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
  
  /**
   * Get last known usage data
   */
  getLastUsageData() {
    return this.lastUsageData;
  }
}

window.APIInterceptor = new APIInterceptorClass();
window.CUP.log('APIInterceptor loaded (singleton instance)');
