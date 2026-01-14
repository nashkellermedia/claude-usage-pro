/**
 * Claude Usage Pro - Usage Scraper
 * Scrapes actual usage data from Claude.ai settings/usage page
 */

class UsageScraper {
  constructor() {
    this.lastScrapedData = null;
  }
  
  /**
   * Main scrape function - navigates to usage page if needed
   */
  async scrapeUsage() {
    window.CUP.log('UsageScraper: Starting scrape...');
    
    // If we're on the usage page, scrape directly
    if (window.location.pathname.includes('/settings/usage')) {
      return this.scrapeUsagePage();
    }
    
    // Try to fetch usage data via API
    const apiData = await this.fetchUsageAPI();
    if (apiData) {
      window.CUP.log('UsageScraper: Got data from API');
      this.lastScrapedData = apiData;
      return apiData;
    }
    
    window.CUP.log('UsageScraper: No data found');
    return null;
  }
  
  /**
   * Scrape directly from the usage settings page
   */
  scrapeUsagePage() {
    try {
      const data = {
        currentSession: null,
        weeklyAllModels: null,
        weeklySonnet: null,
        source: 'usage-page'
      };
      
      // Find all the usage sections
      const pageText = document.body.innerText;
      
      // Current session
      const sessionMatch = pageText.match(/Current session[\s\S]*?Resets in ([\d\s\w]+)[\s\S]*?(\d+)%\s*used/i);
      if (sessionMatch) {
        data.currentSession = {
          percent: parseInt(sessionMatch[2]),
          resetsIn: sessionMatch[1].trim()
        };
      }
      
      // Weekly All models
      const allModelsMatch = pageText.match(/All models[\s\S]*?Resets ([\w\s\d:]+(?:AM|PM))[\s\S]*?(\d+)%\s*used/i);
      if (allModelsMatch) {
        data.weeklyAllModels = {
          percent: parseInt(allModelsMatch[2]),
          resetsAt: allModelsMatch[1].trim()
        };
      }
      
      // Weekly Sonnet only
      const sonnetMatch = pageText.match(/Sonnet only[\s\S]*?Resets in ([\d\s\w]+)[\s\S]*?(\d+)%\s*used/i);
      if (sonnetMatch) {
        data.weeklySonnet = {
          percent: parseInt(sonnetMatch[2]),
          resetsIn: sonnetMatch[1].trim()
        };
      }
      
      // Alternative: Parse from progress bars
      const progressBars = document.querySelectorAll('[role="progressbar"], [class*="progress"]');
      const percentElements = document.querySelectorAll('[class*="percent"], [class*="used"]');
      
      window.CUP.log('UsageScraper: Scraped from page:', data);
      this.lastScrapedData = data;
      return data;
      
    } catch (e) {
      window.CUP.logError('UsageScraper: Page scrape failed:', e);
      return null;
    }
  }
  
  /**
   * Fetch usage via Claude API
   */
  async fetchUsageAPI() {
    try {
      // First get the organization ID
      const orgsResponse = await fetch('https://claude.ai/api/organizations', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!orgsResponse.ok) return null;
      
      const orgs = await orgsResponse.json();
      if (!orgs || orgs.length === 0) return null;
      
      const orgId = orgs[0].uuid;
      
      // Try to get usage/limits data
      const usageResponse = await fetch(`https://claude.ai/api/organizations/${orgId}/rate_limits`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      
      if (usageResponse.ok) {
        const usageData = await usageResponse.json();
        return this.parseAPIResponse(usageData);
      }
      
      // Alternative endpoint
      const statsResponse = await fetch(`https://claude.ai/api/organizations/${orgId}/stats`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        return this.parseAPIResponse(statsData);
      }
      
      return null;
      
    } catch (e) {
      window.CUP.log('UsageScraper: API fetch failed:', e.message);
      return null;
    }
  }
  
  /**
   * Parse API response into our format
   */
  parseAPIResponse(data) {
    if (!data) return null;
    
    try {
      const result = {
        source: 'api'
      };
      
      // Handle different API response formats
      if (data.rate_limits) {
        for (const limit of data.rate_limits) {
          if (limit.type === 'session') {
            result.currentSession = {
              percent: Math.round((limit.used / limit.limit) * 100),
              used: limit.used,
              limit: limit.limit,
              resetsAt: limit.resets_at
            };
          } else if (limit.type === 'weekly' && limit.model === 'all') {
            result.weeklyAllModels = {
              percent: Math.round((limit.used / limit.limit) * 100),
              used: limit.used,
              limit: limit.limit,
              resetsAt: limit.resets_at
            };
          } else if (limit.type === 'weekly' && limit.model === 'sonnet') {
            result.weeklySonnet = {
              percent: Math.round((limit.used / limit.limit) * 100),
              used: limit.used,
              limit: limit.limit,
              resetsAt: limit.resets_at
            };
          }
        }
      }
      
      // Fallback to simple format
      if (data.usage_percent !== undefined) {
        result.currentSession = { percent: data.usage_percent };
      }
      
      return result;
      
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Detect current model from page
   */
  detectCurrentModel() {
    // Check model selector in bottom area
    const modelText = document.body?.innerText?.toLowerCase() || '';
    
    // Look for model name near the compose area
    const composeArea = document.querySelector('[class*="composer"]') || 
                       document.querySelector('form');
    if (composeArea) {
      const text = composeArea.innerText?.toLowerCase() || '';
      if (text.includes('opus')) return 'opus';
      if (text.includes('haiku')) return 'haiku';
      if (text.includes('sonnet')) return 'sonnet';
    }
    
    // Check for Opus 4.5 specifically
    if (modelText.includes('opus 4.5') || modelText.includes('opus-4')) return 'opus';
    if (modelText.includes('haiku 4.5') || modelText.includes('haiku-4')) return 'haiku';
    
    return 'sonnet';
  }
}

window.UsageScraper = UsageScraper;
window.CUP.log('UsageScraper loaded');
