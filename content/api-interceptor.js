/**
 * Claude Usage Pro - API Interceptor
 * 
 * Intercepts fetch/XHR requests to Claude.ai API to:
 * 1. Track token usage from conversations
 * 2. Capture usage/billing data when available
 * 3. Detect when messages are sent (to clear attachment tracking)
 * 4. Detect rate limiting (429 responses) and notify the user
 */

class APIInterceptorClass {
  constructor() {
    this.isActive = false;
    this.pendingRequests = new Map();
    this.callbacks = {
      onMessageSent: null,
      onMessageReceived: null,
      onConversationLoaded: null,
      onUsageDataReceived: null,
      onRateLimited: null  // New callback for rate limit events
    };
    this.lastUsageData = null;
    this.lastModel = null;  // Track model for output tokens
    this.rateLimitState = {
      isLimited: false,
      retryAfter: null,
      resetTime: null,
      message: null,
      detectedAt: null,
      source: null  // 'api' or 'dom'
    };
    this.domObserver = null;
  }
  
  start() {
    if (this.isActive) return;
    
    this.interceptFetch();
    this.interceptXHR();
    // DOM observer disabled for now - too many false positives
    // Rate limits are reliably detected via HTTP 429 responses
    // this.startDOMObserver();
    this.isActive = true;
    
    window.CUP.log('API interceptor started - monitoring Claude API calls');
  }
  
  on(event, callback) {
    if (this.callbacks.hasOwnProperty(event)) {
      this.callbacks[event] = callback;
      window.CUP.log('Registered callback for:', event);
    }
  }
  
  /**
   * Start observing DOM for rate limit banners
   * NOTE: Currently disabled due to false positives. HTTP 429 detection is more reliable.
   */
  startDOMObserver() {
    if (this.domObserver) return;
    
    // Check for existing rate limit banner on page load
    this.checkForRateLimitBanner();
    
    // Observe for new banners being added
    this.domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.checkNodeForRateLimit(node);
            }
          }
        }
      }
    });
    
    this.domObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    window.CUP.log('Rate limit DOM observer started');
  }
  
  /**
   * Check if a DOM node contains rate limit messaging
   * Uses strict matching to avoid false positives
   */
  checkNodeForRateLimit(node) {
    if (!node || !node.textContent) return;
    
    const text = node.textContent.toLowerCase();
    
    // Only match very specific rate limit messages from Claude
    // These are exact phrases that appear in the Claude UI when rate limited
    const exactPhrases = [
      "you've reached your usage limit",
      "you've reached your message limit",
      "you have reached your usage limit",
      "you have reached your message limit",
      "usage limit reached. your limit will reset",
      "message limit reached. your limit will reset"
    ];
    
    for (const phrase of exactPhrases) {
      if (text.includes(phrase)) {
        // Don't trigger on our own UI elements
        if (node.closest('#cup-sidebar-widget') || 
            node.closest('#cup-input-stats') ||
            node.closest('.cup-rate-limit-banner')) {
          return;
        }
        
        // Make sure this is likely an alert/banner element, not just any text
        const isLikelyBanner = 
          node.closest('[role="alert"]') ||
          node.closest('[class*="banner"]') ||
          node.closest('[class*="alert"]') ||
          node.closest('[class*="warning"]') ||
          node.closest('[class*="error"]') ||
          (node.tagName === 'DIV' && node.children.length < 10);
        
        if (!isLikelyBanner) {
          return;
        }
        
        // Extract reset time if mentioned
        let resetTime = null;
        const resetMatch = text.match(/reset(?:s)?\s+(?:at|in)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d+\s*(?:hours?|hr?s?|minutes?|mins?|m|h))/i);
        if (resetMatch) {
          resetTime = this.parseResetTime(resetMatch[1]);
        }
        
        // Check for countdown pattern like "4h 30m" or "in 2 hours"
        const countdownMatch = text.match(/(\d+)\s*(?:hours?|hr?s?|h)\s*(?:(\d+)\s*(?:minutes?|mins?|m))?/i);
        if (countdownMatch && !resetTime) {
          const hours = parseInt(countdownMatch[1]) || 0;
          const minutes = parseInt(countdownMatch[2]) || 0;
          resetTime = Date.now() + (hours * 60 + minutes) * 60 * 1000;
        }
        
        this.handleRateLimitDetected({
          source: 'dom',
          message: text.substring(0, 200),
          resetTime: resetTime,
          retryAfter: resetTime ? Math.ceil((resetTime - Date.now()) / 1000) : null
        });
        
        return;
      }
    }
  }
  
  /**
   * Check the current page for existing rate limit banners
   */
  checkForRateLimitBanner() {
    // Look for alert elements specifically
    const alerts = document.querySelectorAll('[role="alert"]');
    for (const alert of alerts) {
      this.checkNodeForRateLimit(alert);
    }
  }
  
  /**
   * Parse reset time string to timestamp
   */
  parseResetTime(resetStr) {
    if (!resetStr) return null;
    
    const str = resetStr.toLowerCase().trim();
    const now = Date.now();
    
    // Match "4h 30m" or "4 hours" or "30 minutes" pattern
    const hourMatch = str.match(/(\d+)\s*(?:hours?|hr?s?|h)/i);
    const minMatch = str.match(/(\d+)\s*(?:minutes?|mins?|m)(?!o)/i);
    
    if (hourMatch || minMatch) {
      const hours = hourMatch ? parseInt(hourMatch[1]) : 0;
      const minutes = minMatch ? parseInt(minMatch[1]) : 0;
      return now + (hours * 60 + minutes) * 60 * 1000;
    }
    
    // Match "3:00 PM" or "3pm" pattern
    const timeMatch = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]) || 0;
      const isPM = timeMatch[3].toLowerCase() === 'pm';
      
      if (isPM && hours !== 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
      
      const resetDate = new Date();
      resetDate.setHours(hours, minutes, 0, 0);
      
      // If time has passed today, it's for tomorrow
      if (resetDate.getTime() < now) {
        resetDate.setDate(resetDate.getDate() + 1);
      }
      
      return resetDate.getTime();
    }
    
    return null;
  }
  
  /**
   * Handle rate limit detection from any source
   */
  handleRateLimitDetected(info) {
    const { source, message, resetTime, retryAfter, errorType } = info;
    
    // Don't re-fire if we already know we're limited
    if (this.rateLimitState.isLimited && 
        Date.now() - this.rateLimitState.detectedAt < 60000) {
      return;
    }
    
    this.rateLimitState = {
      isLimited: true,
      retryAfter: retryAfter,
      resetTime: resetTime,
      message: message,
      detectedAt: Date.now(),
      source: source,
      errorType: errorType
    };
    
    window.CUP.log('Rate limit detected!', {
      source,
      retryAfter,
      resetTime: resetTime ? new Date(resetTime).toLocaleTimeString() : null,
      message: message ? message.substring(0, 100) : null
    });
    
    // Fire callback
    if (this.callbacks.onRateLimited) {
      this.callbacks.onRateLimited(this.rateLimitState);
    }
    
    // Send to background for tracking
    window.CUP.sendToBackground({
      type: 'RATE_LIMIT_DETECTED',
      rateLimitState: this.rateLimitState
    });
  }
  
  /**
   * Clear rate limit state (called when limit resets)
   */
  clearRateLimitState() {
    if (!this.rateLimitState.isLimited) return;
    
    window.CUP.log('Rate limit cleared');
    
    this.rateLimitState = {
      isLimited: false,
      retryAfter: null,
      resetTime: null,
      message: null,
      detectedAt: null,
      source: null
    };
    
    // Notify background
    window.CUP.sendToBackground({
      type: 'RATE_LIMIT_CLEARED'
    });
    
    // Fire callback with null to indicate cleared
    if (this.callbacks.onRateLimited) {
      this.callbacks.onRateLimited(null);
    }
  }
  
  /**
   * Get current rate limit state
   */
  getRateLimitState() {
    // Check if limit should have expired
    if (this.rateLimitState.isLimited && this.rateLimitState.resetTime) {
      if (Date.now() > this.rateLimitState.resetTime) {
        this.clearRateLimitState();
      }
    }
    return this.rateLimitState;
  }
  
  interceptFetch() {
    const self = this;
    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
      window.CUP.log("[FETCH DEBUG] URL:", typeof args[0] === "string" ? args[0].substring(0, 100) : args[0]?.toString?.().substring(0, 100));
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
          
          // Check for rate limit response (429)
          if (response.status === 429) {
            self.handleHttpRateLimit(response, urlString);
          } else if (response.ok && self.rateLimitState.isLimited) {
            // Successful response while we thought we were limited - clear state
            self.clearRateLimitState();
          }
          
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
   * Handle HTTP 429 rate limit response
   */
  async handleHttpRateLimit(response, url) {
    window.CUP.log('HTTP 429 Rate Limit Response detected');
    
    // Get retry-after header
    const retryAfter = response.headers.get('retry-after');
    let retrySeconds = retryAfter ? parseInt(retryAfter) : null;
    let resetTime = retrySeconds ? Date.now() + retrySeconds * 1000 : null;
    let errorMessage = null;
    let errorType = null;
    
    // Try to get more details from response body
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      
      if (data.error) {
        errorMessage = data.error.message || data.error;
        errorType = data.error.type; // e.g., "rate_limit_error"
      }
      
      // Some responses include reset time in body
      if (data.retry_after) {
        retrySeconds = data.retry_after;
        resetTime = Date.now() + retrySeconds * 1000;
      }
    } catch (e) {
      // Body might not be JSON
    }
    
    this.handleRateLimitDetected({
      source: 'api',
      message: errorMessage || 'Rate limit exceeded (HTTP 429)',
      resetTime: resetTime,
      retryAfter: retrySeconds,
      errorType: errorType
    });
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
          // Check for rate limit
          if (xhr.status === 429) {
            const retryAfter = xhr.getResponseHeader('retry-after');
            self.handleRateLimitDetected({
              source: 'api',
              message: 'Rate limit exceeded (HTTP 429)',
              retryAfter: retryAfter ? parseInt(retryAfter) : null,
              resetTime: retryAfter ? Date.now() + parseInt(retryAfter) * 1000 : null
            });
          } else {
            self.processXHRResponse(url, xhr);
          }
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
      
      // Debug: log what model is in the request data
      window.CUP.log("[DEBUG] Full request data keys:", Object.keys(data || {}));
      window.CUP.log("[DEBUG] Request data.model:", data.model);
      window.CUP.log("[DEBUG] Request data.rendering_model:", data.rendering_model);
      window.CUP.log("[DEBUG] Request data.selectedModel:", data.selectedModel);
      
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
      
      // Get model from request or fallback to UI detection
      const model = data.model || data.rendering_model || data.selectedModel || this.getCurrentModelFromUI();
      window.CUP.log("[DEBUG] Final model selected:", model);
      
      if (this.callbacks.onMessageSent) {
        this.callbacks.onMessageSent({
          tokens,
          model: model,
          hasAttachments: attachments.length > 0
        });
      }
      
      window.CUP.log("Sending input tokens to background:", tokens, "model:", model);
      window.CUP.log('Sending input tokens to background:', tokens);
      try {
        chrome.runtime.sendMessage({
          type: 'ADD_TOKEN_DELTA',
          inputTokens: tokens,
          outputTokens: 0,
          model: model
        }).catch(e => window.CUP.logError("Message send failed:", e));
        
        // Store model for output token tracking
        this.lastModel = model;
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
          
          // Check for rate limit error in JSON response body
          if (data.error && data.error.type === 'rate_limit_error') {
            this.handleRateLimitDetected({
              source: 'api',
              message: data.error.message || 'Rate limit exceeded',
              errorType: 'rate_limit_error'
            });
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
              
              // Check for rate limit error in streaming
              if (data.error && data.error.type === 'rate_limit_error') {
                this.handleRateLimitDetected({
                  source: 'api',
                  message: data.error.message || 'Rate limit exceeded',
                  errorType: 'rate_limit_error'
                });
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
        }).catch(e => window.CUP.logError("Message send failed:", e));
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
      const model = data.model || data.rendering_model || data.selectedModel || this.getCurrentModelFromUI();
      window.CUP.log("[DEBUG] Final model selected:", model);
      
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
   * Get current model from the UI
   */
  getCurrentModelFromUI() {
    try {
      // Try to find the model selector button - Claude.ai uses various selectors
      const modelButton = document.querySelector('[data-testid="model-selector-button"]') || 
                         document.querySelector('button[aria-label*="model"]') ||
                         document.querySelector('[class*="model-selector"]') ||
                         document.querySelector('button[class*="ModelSelector"]');
      
      if (modelButton) {
        const text = (modelButton.textContent || modelButton.innerText || '').toLowerCase();
        window.CUP.log('[DEBUG] Model button text:', text);
        
        // Map UI text to model names (will be normalized by backend)
        // Check for 4.5 first (newer)
        if (text.includes('4.5') || text.includes('4-5')) {
          if (text.includes('opus')) return 'claude-opus-4-5';
          if (text.includes('sonnet')) return 'claude-sonnet-4-5';
          if (text.includes('haiku')) return 'claude-haiku-4-5';
        }
        
        // Then check for 4 (could be 4 or 4.5 depending on display)
        if (text.includes('opus')) return 'claude-opus-4';
        if (text.includes('sonnet')) return 'claude-sonnet-4';
        if (text.includes('haiku')) return 'claude-haiku-4';
      } else {
        window.CUP.log('[DEBUG] No model button found in DOM');
      }
    } catch (e) {
      window.CUP.logError('Failed to get model from UI:', e);
    }
    
    // Ultimate fallback - Sonnet is most common
    return 'claude-sonnet-4';
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
