/**
 * Claude Usage Pro - Data Classes
 * 
 * Classes to represent usage data and conversation data
 */

/**
 * Represents overall usage data for the period
 */
class UsageData {
  constructor(data = {}) {
    this.tokensUsed = data.tokensUsed || 0;
    this.usageCap = data.usageCap || 45000000; // Default 45M
    this.resetTimestamp = data.resetTimestamp || (Date.now() + 24 * 60 * 60 * 1000);
    this.messagesCount = data.messagesCount || 0;
    this.lastUpdated = data.lastUpdated || Date.now();
    
    // Per-model breakdown
    this.modelUsage = data.modelUsage || {
      'claude-sonnet-4': 0,
      'claude-haiku-4': 0,
      'claude-opus-4': 0
    };
  }
  
  /**
   * Get weighted total (accounting for model costs)
   */
  getWeightedTotal() {
    let total = 0;
    
    // Use local multipliers to avoid dependency on window.CUP
    const multipliers = {
      'claude-sonnet-4': 1.0,
      'claude-3-5-sonnet': 1.0,
      'claude-haiku-4': 0.2,
      'claude-3-5-haiku': 0.2,
      'claude-opus-4': 5.0,
      'claude-3-opus': 5.0
    };
    
    for (const [model, tokens] of Object.entries(this.modelUsage || {})) {
      const mult = multipliers[model] || 1.0;
      total += tokens * mult;
    }
    
    return Math.round(total);
  }
  
  /**
   * Get usage percentage
   */
  getUsagePercentage() {
    const weighted = this.getWeightedTotal();
    if (this.usageCap <= 0) return 0;
    return (weighted / this.usageCap) * 100;
  }
  
  /**
   * Check if near limit
   */
  isNearLimit() {
    return this.getUsagePercentage() >= 80;
  }
  
  /**
   * Check if at limit
   */
  isAtLimit() {
    return this.getUsagePercentage() >= 95;
  }
  
  /**
   * Get remaining tokens
   */
  getRemainingTokens() {
    return Math.max(0, this.usageCap - this.getWeightedTotal());
  }
  
  /**
   * Get time until reset
   */
  getTimeUntilReset() {
    return Math.max(0, this.resetTimestamp - Date.now());
  }
  
  /**
   * Get reset time info formatted
   */
  getResetTimeInfo() {
    const ms = this.getTimeUntilReset();
    
    // Format time locally
    if (ms <= 0) {
      return { expired: true, formatted: 'Now!', timestamp: this.resetTimestamp };
    }
    
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    let formatted;
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      formatted = `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      formatted = `${hours}h ${minutes}m`;
    } else {
      formatted = `${minutes}m`;
    }
    
    return {
      expired: false,
      formatted,
      timestamp: this.resetTimestamp
    };
  }
  
  /**
   * Check if data is expired (past reset time)
   */
  isExpired() {
    return Date.now() >= this.resetTimestamp;
  }
  
  /**
   * Add usage for a model
   */
  addUsage(model, tokens) {
    const normalizedModel = this.normalizeModel(model);
    this.modelUsage[normalizedModel] = (this.modelUsage[normalizedModel] || 0) + tokens;
    this.tokensUsed += tokens;
    this.messagesCount++;
    this.lastUpdated = Date.now();
  }
  
  /**
   * Normalize model name
   */
  normalizeModel(model) {
    if (!model) return 'claude-sonnet-4';
    
    const lower = model.toLowerCase();
    if (lower.includes('opus')) return 'claude-opus-4';
    if (lower.includes('haiku')) return 'claude-haiku-4';
    return 'claude-sonnet-4';
  }
  
  /**
   * Create from JSON
   */
  static fromJSON(json) {
    return new UsageData(json);
  }
  
  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      tokensUsed: this.tokensUsed,
      usageCap: this.usageCap,
      resetTimestamp: this.resetTimestamp,
      messagesCount: this.messagesCount,
      lastUpdated: this.lastUpdated,
      modelUsage: this.modelUsage
    };
  }
}

/**
 * Represents a single conversation's data
 */
class ConversationData {
  constructor(data = {}) {
    this.conversationId = data.conversationId || null;
    this.length = data.length || data.totalTokens || 0;  // Total tokens in conversation
    this.model = data.model || 'claude-sonnet-4';
    this.cachedUntil = data.cachedUntil || null;
    this.lastMessageCost = data.lastMessageCost || 0;
    this.messageCount = data.messageCount || 0;
    this.hasFiles = data.hasFiles || false;
    this.hasProject = data.hasProject || false;
    this.projectTokens = data.projectTokens || 0;
    this.fileTokens = data.fileTokens || 0;
  }
  
  /**
   * Check if conversation is currently cached
   */
  isCurrentlyCached() {
    return this.cachedUntil && Date.now() < this.cachedUntil;
  }
  
  /**
   * Get time until cache expires
   */
  getTimeUntilCacheExpires() {
    if (!this.cachedUntil) return { minutes: 0, expired: true };
    
    const ms = this.cachedUntil - Date.now();
    return {
      minutes: Math.max(0, Math.ceil(ms / (1000 * 60))),
      expired: ms <= 0
    };
  }
  
  /**
   * Get weighted future cost (for next message)
   */
  getWeightedFutureCost(currentModel = null) {
    const model = currentModel || this.model;
    
    const multipliers = {
      'claude-sonnet-4': 1.0,
      'claude-haiku-4': 0.2,
      'claude-opus-4': 5.0
    };
    
    const mult = multipliers[model] || 1.0;
    
    // Base cost is conversation length
    let cost = this.length * mult;
    
    // Reduce if cached
    if (this.isCurrentlyCached()) {
      cost *= 0.1;  // 90% reduction when cached
    }
    
    return Math.round(cost);
  }
  
  /**
   * Estimate messages remaining given usage data
   */
  estimateMessagesRemaining(usageData, currentModel = null) {
    const remaining = usageData.getRemainingTokens();
    const costPerMessage = this.getWeightedFutureCost(currentModel);
    
    if (costPerMessage <= 0) return Infinity;
    return Math.floor(remaining / costPerMessage);
  }
  
  /**
   * Check if conversation is long
   */
  isLong() {
    return this.length > 50000;  // 50K tokens
  }
  
  /**
   * Check if conversation is expensive
   */
  isExpensive() {
    const cost = this.getWeightedFutureCost();
    return cost > 100000;  // 100K weighted tokens
  }
  
  /**
   * Create from JSON
   */
  static fromJSON(json) {
    return new ConversationData(json);
  }
  
  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      conversationId: this.conversationId,
      length: this.length,
      model: this.model,
      cachedUntil: this.cachedUntil,
      lastMessageCost: this.lastMessageCost,
      messageCount: this.messageCount,
      hasFiles: this.hasFiles,
      hasProject: this.hasProject,
      projectTokens: this.projectTokens,
      fileTokens: this.fileTokens
    };
  }
}

// Expose globally
window.UsageData = UsageData;
window.ConversationData = ConversationData;

console.log('[Claude Usage Pro] Data classes loaded');
