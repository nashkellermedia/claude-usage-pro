/**
 * Claude Usage Pro - Message Tracker
 * Intercepts Claude.ai API calls and extracts token usage
 */

class MessageTracker {
  constructor() {
    this.conversationTokens = new Map();
    this.isTracking = false;
    this.messageQueue = [];
    
    console.log('📊 Message Tracker initialized');
  }

  /**
   * Start tracking messages
   */
  start() {
    if (this.isTracking) return;
    
    this.isTracking = true;
    this.interceptFetch();
    this.interceptXHR();
    
    console.log('✅ Message tracking started');
  }

  /**
   * Intercept fetch API calls
   */
  interceptFetch() {
    const originalFetch = window.fetch;
    const self = this;

    window.fetch = async function(...args) {
      const [url, options] = args;
      
      // Check if this is a Claude API call
      if (url && typeof url === 'string' && url.includes('api.claude.ai')) {
        try {
          const response = await originalFetch.apply(this, args);
          const clonedResponse = response.clone();
          
          // Process response in background
          self.processClaudeResponse(url, options, clonedResponse);
          
          return response;
        } catch (error) {
          console.error('Fetch intercept error:', error);
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
      this._url = url;
      this._method = method;
      return originalOpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(body) {
      if (this._url && this._url.includes('api.claude.ai')) {
        this.addEventListener('load', function() {
          try {
            self.processClaudeXHR(this._url, this._method, body, this.responseText);
          } catch (error) {
            console.error('XHR intercept error:', error);
          }
        });
      }
      return originalSend.apply(this, arguments);
    };
  }

  /**
   * Process Claude API response from fetch
   */
  async processClaudeResponse(url, options, response) {
    try {
      const data = await response.json();
      
      // Extract usage data from response
      const usage = this.extractUsage(data);
      if (usage) {
        await this.recordUsage(usage);
      }
    } catch (error) {
      // Response might not be JSON or already consumed
      console.debug('Could not process response:', error.message);
    }
  }

  /**
   * Process Claude API response from XHR
   */
  processClaudeXHR(url, method, requestBody, responseText) {
    try {
      const data = JSON.parse(responseText);
      const usage = this.extractUsage(data);
      
      if (usage) {
        this.recordUsage(usage);
      }
    } catch (error) {
      console.debug('Could not process XHR response:', error.message);
    }
  }

  /**
   * Extract usage information from API response
   */
  extractUsage(data) {
    let usage = {
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      model: 'claude-sonnet-4'
    };

    // Check for usage object (API format)
    if (data.usage) {
      usage.inputTokens = data.usage.input_tokens || 0;
      usage.outputTokens = data.usage.output_tokens || 0;
      usage.cachedTokens = data.usage.cache_read_input_tokens || 0;
    }

    // Check for alternative formats
    if (data.message_tokens) {
      usage.inputTokens = data.message_tokens.input || 0;
      usage.outputTokens = data.message_tokens.output || 0;
    }

    // Extract model information
    if (data.model) {
      usage.model = data.model;
    }

    // Only return if we found actual usage data
    if (usage.inputTokens > 0 || usage.outputTokens > 0) {
      return usage;
    }

    return null;
  }

  /**
   * Record usage to background
   */
  async recordUsage(usage) {
    console.log('📈 Recording usage:', usage);

    const cost = this.calculateCost(usage);
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_STATS',
        delta: {
          tokens: usage.inputTokens + usage.outputTokens,
          cost: cost,
          messages: 1
        },
        usage: usage
      });

      if (response && response.stats) {
        console.log('✅ Stats updated:', response.stats);
        
        window.postMessage({
          type: 'CLAUDE_USAGE_UPDATE',
          stats: response.stats,
          usage: usage
        }, '*');
      }
    } catch (error) {
      console.error('Failed to record usage:', error);
    }
  }

  /**
   * Calculate cost for usage
   */
  calculateCost(usage) {
    const pricing = this.getModelPricing(usage.model);
    
    const inputCost = ((usage.inputTokens - usage.cachedTokens) / 1000) * pricing.input;
    const cachedCost = (usage.cachedTokens / 1000) * pricing.cached;
    const outputCost = (usage.outputTokens / 1000) * pricing.output;
    
    return inputCost + cachedCost + outputCost;
  }

  /**
   * Get model pricing
   */
  getModelPricing(model) {
    const pricing = {
      'claude-sonnet-4': { input: 0.003, output: 0.015, cached: 0.0003 },
      'claude-sonnet-4-20250514': { input: 0.003, output: 0.015, cached: 0.0003 },
      'claude-3-5-sonnet': { input: 0.003, output: 0.015, cached: 0.0003 },
      'claude-opus-4': { input: 0.015, output: 0.075, cached: 0.0015 },
      'claude-haiku-4': { input: 0.0008, output: 0.004, cached: 0.00008 }
    };
    
    return pricing[model] || pricing['claude-sonnet-4'];
  }
}

const tracker = new MessageTracker();

if (typeof window !== 'undefined') {
  window.ClaudeMessageTracker = tracker;
}
