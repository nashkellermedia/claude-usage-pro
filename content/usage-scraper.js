/**
 * Claude Usage Pro - Usage Scraper
 * 
 * Scrapes actual usage data from Claude's settings/usage page
 * to sync with real values instead of just estimating
 */

class UsageScraper {
  constructor() {
    this.lastScrape = null;
    this.scrapeInterval = 5 * 60 * 1000; // 5 minutes
  }
  
  /**
   * Scrape usage data from the current page or navigate to get it
   */
  async scrapeUsage() {
    window.CUP.log('UsageScraper: Starting scrape...');
    
    // Method 1: Try to find usage info in the current page's React state
    let data = this.scrapeFromReactState();
    if (data) {
      window.CUP.log('UsageScraper: Got data from React state:', data);
      return data;
    }
    
    // Method 2: Try to scrape from DOM if on settings page
    if (window.location.href.includes('/settings')) {
      data = this.scrapeFromSettingsDOM();
      if (data) {
        window.CUP.log('UsageScraper: Got data from settings DOM:', data);
        return data;
      }
    }
    
    // Method 3: Fetch the settings API directly
    data = await this.fetchFromAPI();
    if (data) {
      window.CUP.log('UsageScraper: Got data from API:', data);
      return data;
    }
    
    window.CUP.logWarn('UsageScraper: Could not scrape usage data');
    return null;
  }
  
  /**
   * Try to extract usage from React's internal state
   */
  scrapeFromReactState() {
    try {
      // Look for React fiber with usage data
      const root = document.getElementById('__next');
      if (!root) return null;
      
      // Try to find usage data in window state
      if (window.__NEXT_DATA__?.props?.pageProps?.user) {
        const user = window.__NEXT_DATA__.props.pageProps.user;
        if (user.usage_percentage !== undefined) {
          return {
            usagePercent: user.usage_percentage,
            planType: user.plan_type || 'pro',
            resetTime: user.reset_at ? new Date(user.reset_at).getTime() : null
          };
        }
      }
      
      // Look for usage in any script tags
      const scripts = document.querySelectorAll('script[type="application/json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.usage_percentage !== undefined) {
            return {
              usagePercent: data.usage_percentage,
              planType: data.plan_type || 'pro'
            };
          }
        } catch (e) {}
      }
    } catch (e) {
      window.CUP.logError('Error scraping React state:', e);
    }
    return null;
  }
  
  /**
   * Scrape from settings page DOM
   */
  scrapeFromSettingsDOM() {
    try {
      // Look for usage percentage text
      const allText = document.body.innerText;
      
      // Pattern: "X% of your daily limit" or "X% used"
      const percentMatch = allText.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of|used)/i);
      if (percentMatch) {
        return {
          usagePercent: parseFloat(percentMatch[1])
        };
      }
      
      // Look for progress bars
      const progressBars = document.querySelectorAll('[role="progressbar"], .progress-bar, [class*="progress"]');
      for (const bar of progressBars) {
        const width = bar.style.width;
        if (width && width.includes('%')) {
          const percent = parseFloat(width);
          if (!isNaN(percent)) {
            return { usagePercent: percent };
          }
        }
        
        const ariaValue = bar.getAttribute('aria-valuenow');
        if (ariaValue) {
          return { usagePercent: parseFloat(ariaValue) };
        }
      }
      
      // Look for specific text patterns in Claude's UI
      const usageElements = document.querySelectorAll('[class*="usage"], [class*="quota"], [class*="limit"]');
      for (const el of usageElements) {
        const text = el.textContent;
        const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
        if (match) {
          return { usagePercent: parseFloat(match[1]) };
        }
      }
    } catch (e) {
      window.CUP.logError('Error scraping settings DOM:', e);
    }
    return null;
  }
  
  /**
   * Fetch usage data directly from Claude's API
   */
  async fetchFromAPI() {
    try {
      // Try to get user/account info which includes usage
      const response = await fetch('https://claude.ai/api/auth/session', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          return {
            usagePercent: data.user.usage_percentage,
            planType: data.user.plan_type,
            email: data.user.email
          };
        }
      }
    } catch (e) {
      // Session endpoint might not have usage
    }
    
    try {
      // Try account/usage endpoint
      const response = await fetch('https://claude.ai/api/account', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.usage_percentage !== undefined) {
          return {
            usagePercent: data.usage_percentage,
            planType: data.plan_type,
            messagesUsed: data.messages_used,
            messagesLimit: data.messages_limit
          };
        }
      }
    } catch (e) {
      window.CUP.logError('Error fetching from API:', e);
    }
    
    return null;
  }
  
  /**
   * Schedule periodic scraping
   */
  startPeriodicScrape(callback) {
    // Initial scrape
    this.scrapeAndReport(callback);
    
    // Periodic scrapes
    setInterval(() => {
      this.scrapeAndReport(callback);
    }, this.scrapeInterval);
  }
  
  /**
   * Scrape and report to callback
   */
  async scrapeAndReport(callback) {
    const data = await this.scrapeUsage();
    if (data && callback) {
      callback(data);
    }
    this.lastScrape = Date.now();
  }
}

window.UsageScraper = UsageScraper;
window.CUP.log('UsageScraper class loaded');
