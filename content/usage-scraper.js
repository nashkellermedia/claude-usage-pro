/**
 * Claude Usage Pro - Usage Scraper
 * Scrapes usage from Claude.ai settings/usage page
 * 
 * IMPORTANT: Must scrape from main content area only,
 * not from our own sidebar widget!
 */

class UsageScraper {
  constructor() {
    this.lastScrapedData = null;
    this.setupPageObserver();
  }
  
  setupPageObserver() {
    if (window.location.pathname.includes('/settings/usage')) {
      setTimeout(() => this.scrapeCurrentPage(), 2000);
    }
    
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (location.pathname.includes('/settings/usage')) {
          setTimeout(() => this.scrapeCurrentPage(), 2000);
        }
      }
    }).observe(document.body, { subtree: true, childList: true });
  }
  
  async scrapeUsage() {
    window.CUP.log('UsageScraper: Starting scrape...');
    
    // First, try to fetch from API endpoints (most accurate)
    const apiData = await this.tryFetchFromAPI();
    if (apiData) {
      this.lastScrapedData = apiData;
      return apiData;
    }
    
    // Fall back to page scraping if on usage page
    if (window.location.pathname.includes('/settings/usage')) {
      const data = this.scrapeFromMainContent();
      if (data) {
        this.lastScrapedData = data;
        return data;
      }
    }
    
    // Background fetch as last resort
    try {
      const response = await fetch('https://claude.ai/settings/usage', {
        credentials: 'include',
        headers: { 'Accept': 'text/html' }
      });
      
      if (response.ok) {
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Get text from main content only (not sidebar)
        const main = doc.querySelector('main') || doc.querySelector('[class*="settings"]') || doc.body;
        const text = main?.innerText || '';
        
        const data = this.scrapePageText(text);
        if (data) {
          this.lastScrapedData = data;
          return data;
        }
      }
    } catch (e) {
      window.CUP.log('UsageScraper: Fetch error:', e.message);
    }
    
    return this.lastScrapedData;
  }
  
  /**
   * Try to fetch usage data directly from Claude's API endpoints
   * This is more reliable than scraping HTML
   */
  async tryFetchFromAPI() {
    const endpoints = [
      'https://claude.ai/api/usage',
      'https://claude.ai/api/account/usage',
      'https://claude.ai/api/billing/usage',
      'https://claude.ai/api/rate_limit_status',
      'https://claude.ai/api/settings'
    ];
    
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
          const parsed = this.parseAPIResponse(data, endpoint);
          if (parsed) {
            window.CUP.log('UsageScraper: Got data from API endpoint:', endpoint);
            return parsed;
          }
        }
      } catch (e) {
        // Endpoint didn't work, try next
      }
    }
    
    return null;
  }
  
  /**
   * Parse API response to extract usage data
   */
  parseAPIResponse(data, endpoint) {
    const result = {
      currentSession: null,
      weeklyAllModels: null,
      weeklySonnet: null,
      source: 'api-fetch',
      endpoint: endpoint,
      scrapedAt: Date.now()
    };
    
    // Try various possible response formats
    
    // Format: Direct percent fields
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
    
    // Format: Nested usage object
    if (data.usage) {
      if (data.usage.session) {
        result.currentSession = {
          percent: data.usage.session.percent || Math.round((data.usage.session.used / data.usage.session.limit) * 100) || 0,
          resetsIn: data.usage.session.resets_in || '--'
        };
      }
      if (data.usage.weekly) {
        result.weeklyAllModels = {
          percent: data.usage.weekly.percent || Math.round((data.usage.weekly.used / data.usage.weekly.limit) * 100) || 0,
          resetsAt: data.usage.weekly.resets_at || '--'
        };
      }
    }
    
    // Format: Rate limit style
    if (data.rate_limit || data.rateLimit) {
      const rl = data.rate_limit || data.rateLimit;
      const used = rl.messages_used || rl.messagesUsed || rl.used || 0;
      const limit = rl.message_limit || rl.messageLimit || rl.limit || 100;
      const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
      
      result.currentSession = {
        percent: percent,
        resetsIn: rl.resets_in || rl.resetsIn || '--'
      };
    }
    
    // Format: Message limits
    if (data.message_limit !== undefined || data.messageLimit !== undefined) {
      const limit = data.message_limit || data.messageLimit;
      const used = data.messages_used || data.messagesUsed || 0;
      if (limit > 0) {
        result.currentSession = {
          percent: Math.round((used / limit) * 100),
          resetsIn: data.resets_in || '--'
        };
      }
    }
    
    // Format: Plan limits (nested)
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
    
    // Check if we got any data
    if (result.currentSession || result.weeklyAllModels) {
      return result;
    }
    
    return null;
  }
  
  /**
   * Scrape from the MAIN content area only, excluding our sidebar widget
   */
  scrapeFromMainContent() {
    // Find the main settings content area - NOT the sidebar
    const mainContent = document.querySelector('main') || 
                       document.querySelector('[class*="settings-content"]') ||
                       document.querySelector('[class*="SettingsContent"]');
    
    if (!mainContent) {
      // Fallback: get body text but exclude our widget
      const clone = document.body.cloneNode(true);
      const ourWidget = clone.querySelector('#cup-sidebar-widget');
      if (ourWidget) ourWidget.remove();
      return this.scrapePageText(clone.innerText);
    }
    
    return this.scrapePageText(mainContent.innerText);
  }
  
  /**
   * Parse page text by splitting into sections
   */
  scrapePageText(text) {
    window.CUP.log('UsageScraper: Parsing text, length:', text.length);
    
    // Debug: log first 500 chars to see what we're parsing
    window.CUP.log('UsageScraper: Text preview:', text.substring(0, 500));
    
    const data = {
      currentSession: null,
      weeklyAllModels: null,
      weeklySonnet: null,
      source: 'text-parse',
      scrapedAt: Date.now()
    };
    
    // Look for "Plan usage limits" section to ensure we're in the right area
    const usageLimitsStart = text.indexOf('Plan usage limits');
    if (usageLimitsStart === -1) {
      window.CUP.log('UsageScraper: "Plan usage limits" not found');
      // Try to parse anyway
    }
    
    // Extract section starting from "Plan usage limits" if found
    const relevantText = usageLimitsStart > -1 ? text.substring(usageLimitsStart) : text;
    
    // Current session section - ends at "Weekly limits"
    const currentSessionSection = relevantText.match(/Current\s+session([\s\S]*?)(?=Weekly\s+limits|All\s+models|$)/i);
    
    // All models section - ends at "Sonnet only"
    const allModelsSection = relevantText.match(/All\s+models([\s\S]*?)(?=Sonnet\s+only|$)/i);
    
    // Sonnet section - ends at "Last updated" or "Extra usage"
    const sonnetSection = relevantText.match(/Sonnet\s+only([\s\S]*?)(?=Last\s+updated|Extra\s+usage|$)/i);
    
    // Parse Current Session
    if (currentSessionSection) {
      const section = currentSessionSection[1];
      const percentMatch = section.match(/(\d+)%\s*used/i);
      // Try multiple reset time formats
      let resetMatch = section.match(/Resets?\s+in\s+([\d]+\s*h(?:r|our)?s?\s*(?:[\d]+\s*m(?:in)?s?)?)/i);
      if (!resetMatch) resetMatch = section.match(/Resets?\s+in\s+([\d:]+)/i);
      if (!resetMatch) resetMatch = section.match(/([\d]+\s*h(?:r|our)?s?\s*(?:\d+\s*m(?:in)?s?)?)\s*(?:left|remaining)/i);
      if (!resetMatch) resetMatch = section.match(/in\s+(\d+\s*(?:hours?|hr?|minutes?|min?|m|h)[^\n]*)/i);
      
      data.currentSession = {
        percent: percentMatch ? parseInt(percentMatch[1]) : 0,
        resetsIn: resetMatch ? resetMatch[1].trim() : '--'
      };
      window.CUP.log('UsageScraper: Current Session:', data.currentSession.percent + '%, resets in', data.currentSession.resetsIn);
    }
    
    // Parse All Models
    if (allModelsSection) {
      const section = allModelsSection[1];
      const percentMatch = section.match(/(\d+)%\s*used/i);
      const resetMatch = section.match(/Resets\s+([\w]+\s+[\d:]+\s*(?:AM|PM)?)/i);
      
      if (percentMatch) {
        data.weeklyAllModels = {
          percent: parseInt(percentMatch[1]),
          resetsAt: resetMatch ? resetMatch[1].trim() : '--'
        };
        window.CUP.log('UsageScraper: All Models:', data.weeklyAllModels.percent + '%');
      }
    }
    
    // Parse Sonnet Only
    if (sonnetSection) {
      const section = sonnetSection[1];
      const percentMatch = section.match(/(\d+)%\s*used/i);
      // Try multiple reset time formats
      let resetMatch = section.match(/Resets?\s+in\s+([\d]+\s*h(?:r|our)?s?\s*(?:[\d]+\s*m(?:in)?s?)?)/i);
      if (!resetMatch) resetMatch = section.match(/Resets?\s+in\s+([\d:]+)/i);
      if (!resetMatch) resetMatch = section.match(/([\d]+\s*h(?:r|our)?s?\s*(?:\d+\s*m(?:in)?s?)?)\s*(?:left|remaining)/i);
      if (!resetMatch) resetMatch = section.match(/in\s+(\d+\s*(?:hours?|hr?|minutes?|min?|m|h)[^\n]*)/i);
      
      if (percentMatch) {
        data.weeklySonnet = {
          percent: parseInt(percentMatch[1]),
          resetsIn: resetMatch ? resetMatch[1].trim() : '--'
        };
        window.CUP.log('UsageScraper: Sonnet Only:', data.weeklySonnet.percent + '%');
      }
    }
    
    if (data.currentSession || data.weeklyAllModels || data.weeklySonnet) {
      return data;
    }
    
    window.CUP.log('UsageScraper: No data found in text');
    return null;
  }
  
  scrapeCurrentPage() {
    if (!window.location.pathname.includes('/settings/usage')) return;
    
    window.CUP.log('UsageScraper: Scraping current page...');
    
    const data = this.scrapeFromMainContent();
    
    if (data) {
      this.lastScrapedData = data;
      window.CUP.sendToBackground({ type: 'SYNC_SCRAPED_DATA', data });
      window.CUP.log('UsageScraper: Data synced to background');
    }
  }
  
  detectCurrentModel() {
    const text = document.body?.innerText?.toLowerCase() || '';
    if (text.includes('opus 4.5')) return 'opus';
    if (text.includes('haiku 4.5')) return 'haiku';
    return 'sonnet';
  }
}

window.UsageScraper = UsageScraper;
window.CUP.log('UsageScraper loaded');
