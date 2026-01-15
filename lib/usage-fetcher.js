/**
 * Claude Usage Pro - Direct Usage API Fetcher
 * Fetches real usage data directly from Claude's API using session cookies
 * 
 * This is the "source of truth" approach - instead of estimating tokens,
 * we fetch the actual usage percentages from Claude's servers.
 */

class UsageFetcher {
  constructor() {
    this.organizationId = null;
    this.lastFetch = null;
    this.lastData = null;
    this.fetchInterval = null;
    this.minFetchInterval = 30000; // Minimum 30 seconds between fetches
  }

  /**
   * Initialize the fetcher - get organization ID
   */
  async initialize() {
    try {
      // Try to get organization ID from Claude's API
      this.organizationId = await this.getOrganizationId();
      if (this.organizationId) {
        console.log('[UsageFetcher] Initialized with org:', this.organizationId);
        return true;
      }
    } catch (e) {
      console.error('[UsageFetcher] Init error:', e.message);
    }
    return false;
  }

  /**
   * Get the user's organization ID from Claude API
   */
  async getOrganizationId() {
    try {
      // First try to get from storage (cached)
      const cached = await chrome.storage.local.get('cup_org_id');
      if (cached.cup_org_id) {
        return cached.cup_org_id;
      }

      // Fetch from account endpoint
      const response = await fetch('https://claude.ai/api/organizations', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        // Organizations is usually an array, take the first one
        const org = Array.isArray(data) ? data[0] : data;
        const orgId = org?.uuid || org?.id || org?.organization_id;
        
        if (orgId) {
          await chrome.storage.local.set({ cup_org_id: orgId });
          console.log('[UsageFetcher] Got org ID:', orgId);
          return orgId;
        }
      }

      // Alternative: try to extract from settings page
      const settingsResponse = await fetch('https://claude.ai/api/account', {
        method: 'GET',
        credentials: 'include'
      });

      if (settingsResponse.ok) {
        const accountData = await settingsResponse.json();
        const orgId = accountData?.organization_id || accountData?.org_id;
        if (orgId) {
          await chrome.storage.local.set({ cup_org_id: orgId });
          return orgId;
        }
      }

    } catch (e) {
      console.error('[UsageFetcher] Error getting org ID:', e.message);
    }
    return null;
  }

  /**
   * Fetch current usage data from Claude API
   * This is the main method - gets real usage percentages
   */
  async fetchUsage() {
    // Rate limit
    const now = Date.now();
    if (this.lastFetch && (now - this.lastFetch) < this.minFetchInterval) {
      console.log('[UsageFetcher] Rate limited, returning cached data');
      return this.lastData;
    }

    try {
      // Try multiple endpoints that might have usage data
      const usageData = await this.tryFetchFromEndpoints();
      
      if (usageData) {
        this.lastData = usageData;
        this.lastFetch = now;
        console.log('[UsageFetcher] Got fresh usage data:', usageData);
        return usageData;
      }
    } catch (e) {
      console.error('[UsageFetcher] Fetch error:', e.message);
    }

    return this.lastData;
  }

  /**
   * Try fetching from various possible endpoints
   */
  async tryFetchFromEndpoints() {
    const endpoints = [
      // Organization-specific usage endpoint
      this.organizationId ? 
        `https://claude.ai/api/organizations/${this.organizationId}/usage` : null,
      // Generic usage endpoints
      'https://claude.ai/api/usage',
      'https://claude.ai/api/account/usage',
      'https://claude.ai/api/billing/usage',
      'https://claude.ai/api/rate_limit_status',
      // Settings page might have usage data embedded
      'https://claude.ai/api/settings'
    ].filter(Boolean);

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          const parsed = this.parseUsageResponse(data, endpoint);
          if (parsed) {
            return parsed;
          }
        }
      } catch (e) {
        console.log(`[UsageFetcher] Endpoint ${endpoint} failed:`, e.message);
      }
    }

    return null;
  }

  /**
   * Parse usage response from various API formats
   */
  parseUsageResponse(data, endpoint) {
    console.log('[UsageFetcher] Parsing response from', endpoint, data);

    // Try to extract usage info from various possible formats
    const result = {
      currentSession: null,
      weeklyAllModels: null,
      weeklySonnet: null,
      source: 'api-fetch',
      endpoint: endpoint,
      fetchedAt: Date.now()
    };

    // Format 1: Direct percentage fields
    if (data.session_percent !== undefined || data.sessionPercent !== undefined) {
      result.currentSession = {
        percent: data.session_percent || data.sessionPercent || 0,
        resetsIn: data.session_resets_in || data.sessionResetsIn || '--'
      };
    }

    if (data.weekly_percent !== undefined || data.weeklyPercent !== undefined) {
      result.weeklyAllModels = {
        percent: data.weekly_percent || data.weeklyPercent || 0,
        resetsAt: data.weekly_resets_at || data.weeklyResetsAt || '--'
      };
    }

    // Format 2: Nested usage object
    if (data.usage) {
      if (data.usage.session) {
        result.currentSession = {
          percent: data.usage.session.percent || 0,
          resetsIn: data.usage.session.resets_in || '--'
        };
      }
      if (data.usage.weekly) {
        result.weeklyAllModels = {
          percent: data.usage.weekly.percent || 0,
          resetsAt: data.usage.weekly.resets_at || '--'
        };
      }
    }

    // Format 3: Rate limit style
    if (data.rate_limit || data.rateLimit) {
      const rl = data.rate_limit || data.rateLimit;
      const used = rl.messages_used || rl.messagesUsed || rl.used || 0;
      const limit = rl.message_limit || rl.messageLimit || rl.limit || 100;
      const percent = Math.round((used / limit) * 100);
      
      result.currentSession = {
        percent: percent,
        resetsIn: rl.resets_in || rl.resetsIn || '--'
      };
    }

    // Format 4: Quota style
    if (data.quota) {
      if (data.quota.session) {
        const q = data.quota.session;
        result.currentSession = {
          percent: Math.round((q.used / q.limit) * 100),
          resetsIn: q.resets_in || '--'
        };
      }
      if (data.quota.weekly) {
        const q = data.quota.weekly;
        result.weeklyAllModels = {
          percent: Math.round((q.used / q.limit) * 100),
          resetsAt: q.resets_at || '--'
        };
      }
    }

    // Format 5: Message limits
    if (data.message_limit !== undefined || data.messageLimit !== undefined) {
      const limit = data.message_limit || data.messageLimit;
      const used = data.messages_used || data.messagesUsed || 0;
      result.currentSession = {
        percent: Math.round((used / limit) * 100),
        resetsIn: data.resets_in || '--'
      };
    }

    // Format 6: Plan limits (nested)
    if (data.plan_limits || data.planLimits) {
      const pl = data.plan_limits || data.planLimits;
      if (pl.hourly) {
        result.currentSession = {
          percent: pl.hourly.percent || Math.round((pl.hourly.used / pl.hourly.limit) * 100),
          resetsIn: pl.hourly.resets_in || '--'
        };
      }
      if (pl.weekly) {
        result.weeklyAllModels = {
          percent: pl.weekly.percent || Math.round((pl.weekly.used / pl.weekly.limit) * 100),
          resetsAt: pl.weekly.resets_at || '--'
        };
      }
    }

    // Check if we got any useful data
    if (result.currentSession || result.weeklyAllModels || result.weeklySonnet) {
      return result;
    }

    return null;
  }

  /**
   * Start periodic fetching
   */
  startPeriodicFetch(intervalMs = 60000) {
    this.stopPeriodicFetch();
    
    this.fetchInterval = setInterval(async () => {
      await this.fetchUsage();
    }, intervalMs);

    console.log(`[UsageFetcher] Started periodic fetch every ${intervalMs}ms`);
  }

  /**
   * Stop periodic fetching
   */
  stopPeriodicFetch() {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
    }
  }

  /**
   * Force refresh (ignore rate limit)
   */
  async forceRefresh() {
    this.lastFetch = null;
    return await this.fetchUsage();
  }

  /**
   * Get cached data
   */
  getCached() {
    return this.lastData;
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      organizationId: this.organizationId,
      lastFetch: this.lastFetch,
      lastFetchTime: this.lastFetch ? new Date(this.lastFetch).toLocaleString() : 'Never',
      hasData: !!this.lastData
    };
  }
}

// Export
if (typeof self !== 'undefined') {
  self.UsageFetcher = UsageFetcher;
}
if (typeof window !== 'undefined') {
  window.UsageFetcher = UsageFetcher;
}

console.log('[CUP] Usage Fetcher loaded');
