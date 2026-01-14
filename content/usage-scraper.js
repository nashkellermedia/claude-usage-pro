/**
 * Claude Usage Pro - Usage Scraper
 * 
 * Scrapes actual usage data from Claude's UI
 * Since there's no public API, we scrape from the DOM
 */

class UsageScraper {
  constructor() {
    this.lastScrape = null;
    this.scrapeInterval = 5 * 60 * 1000; // 5 minutes
  }
  
  /**
   * Scrape usage data
   */
  async scrapeUsage() {
    window.CUP.log('UsageScraper: Starting scrape...');
    
    // Method 1: Check if we're on settings page and can read directly
    if (window.location.href.includes('/settings')) {
      const data = this.scrapeFromSettingsPage();
      if (data) return data;
    }
    
    // Method 2: Try to find usage in page's embedded data
    const embeddedData = this.scrapeFromEmbeddedData();
    if (embeddedData) return embeddedData;
    
    // Method 3: Look for any visible usage indicators
    const visibleData = this.scrapeFromVisibleUI();
    if (visibleData) return visibleData;
    
    window.CUP.log('UsageScraper: No data found (this is normal on chat pages)');
    return null;
  }
  
  /**
   * Scrape from settings page DOM
   */
  scrapeFromSettingsPage() {
    try {
      // Look for progress bars or percentage text
      const progressBars = document.querySelectorAll('[role="progressbar"]');
      for (const bar of progressBars) {
        const value = bar.getAttribute('aria-valuenow');
        if (value) {
          return { usagePercent: parseFloat(value) };
        }
      }
      
      // Look for percentage in text
      const bodyText = document.body.innerText;
      const patterns = [
        /(\d+(?:\.\d+)?)\s*%\s*(?:of|used|remaining)/i,
        /usage[:\s]+(\d+(?:\.\d+)?)\s*%/i,
        /(\d+(?:\.\d+)?)\s*%\s*of\s*(?:your\s+)?(?:daily\s+)?(?:limit|quota)/i
      ];
      
      for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        if (match) {
          return { usagePercent: parseFloat(match[1]) };
        }
      }
    } catch (e) {
      window.CUP.logError('Settings scrape error:', e);
    }
    return null;
  }
  
  /**
   * Look for embedded JSON data in the page
   */
  scrapeFromEmbeddedData() {
    try {
      // Check __NEXT_DATA__
      const nextData = document.getElementById('__NEXT_DATA__');
      if (nextData) {
        const data = JSON.parse(nextData.textContent);
        const user = data?.props?.pageProps?.user;
        if (user?.usage_percentage !== undefined) {
          return {
            usagePercent: user.usage_percentage,
            planType: user.plan_type
          };
        }
      }
      
      // Check for any script tags with usage data
      const scripts = document.querySelectorAll('script:not([src])');
      for (const script of scripts) {
        try {
          if (script.textContent.includes('usage')) {
            const content = script.textContent;
            const usageMatch = content.match(/"usage_percentage"\s*:\s*(\d+(?:\.\d+)?)/);
            if (usageMatch) {
              return { usagePercent: parseFloat(usageMatch[1]) };
            }
          }
        } catch (e) {}
      }
    } catch (e) {
      window.CUP.logError('Embedded data scrape error:', e);
    }
    return null;
  }
  
  /**
   * Look for visible usage UI elements
   */
  scrapeFromVisibleUI() {
    try {
      // Look for any element that might contain usage info
      const selectors = [
        '[class*="usage"]',
        '[class*="quota"]',
        '[class*="limit"]',
        '[class*="progress"]',
        '[data-testid*="usage"]'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent;
          const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
          if (match) {
            return { usagePercent: parseFloat(match[1]) };
          }
          
          // Check for width-based progress bars
          if (el.style.width && el.style.width.includes('%')) {
            const percent = parseFloat(el.style.width);
            if (!isNaN(percent) && percent > 0 && percent <= 100) {
              return { usagePercent: percent };
            }
          }
        }
      }
    } catch (e) {
      window.CUP.logError('Visible UI scrape error:', e);
    }
    return null;
  }
}

window.UsageScraper = UsageScraper;
window.CUP.log('UsageScraper class loaded');
