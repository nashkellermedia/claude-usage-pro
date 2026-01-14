/**
 * Claude Usage Pro - Usage Scraper
 * Scrapes from Claude.ai usage page when user visits it
 */

class UsageScraper {
  constructor() {
    this.lastScrapedData = null;
    this.setupPageObserver();
  }
  
  /**
   * Watch for navigation to usage page
   */
  setupPageObserver() {
    // Check if we're on usage page now
    this.checkAndScrapeUsagePage();
    
    // Watch for URL changes (SPA navigation)
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(() => this.checkAndScrapeUsagePage(), 1000);
      }
    }).observe(document.body, { subtree: true, childList: true });
  }
  
  /**
   * Check if on usage page and scrape
   */
  checkAndScrapeUsagePage() {
    if (window.location.pathname.includes('/settings/usage')) {
      window.CUP.log('UsageScraper: On usage page, scraping...');
      setTimeout(() => this.scrapeUsagePage(), 500);
    }
  }
  
  /**
   * Main scrape function
   */
  async scrapeUsage() {
    window.CUP.log('UsageScraper: Starting scrape...');
    
    // If we're on usage page, scrape it
    if (window.location.pathname.includes('/settings/usage')) {
      return this.scrapeUsagePage();
    }
    
    // Return cached data if we have it
    if (this.lastScrapedData) {
      return this.lastScrapedData;
    }
    
    window.CUP.log('UsageScraper: No data found');
    return null;
  }
  
  /**
   * Scrape the usage settings page
   */
  scrapeUsagePage() {
    try {
      const data = {
        currentSession: null,
        weeklyAllModels: null,
        weeklySonnet: null,
        source: 'usage-page',
        scrapedAt: Date.now()
      };
      
      // Get all text content
      const pageText = document.body.innerText;
      
      // Method 1: Parse using regex patterns
      // Current session: "Current session ... Resets in X hr Y min ... X% used"
      const sessionMatch = pageText.match(/Current\s+session[\s\S]*?Resets\s+in\s+([\d]+\s*hr\s*[\d]*\s*min|[\d]+\s*min)[\s\S]*?(\d+)%\s*used/i);
      if (sessionMatch) {
        data.currentSession = {
          percent: parseInt(sessionMatch[2]),
          resetsIn: sessionMatch[1].trim()
        };
        window.CUP.log('Scraped currentSession:', data.currentSession);
      }
      
      // Weekly all models: "All models ... Resets Day Time ... X% used"
      const allModelsMatch = pageText.match(/All\s+models[\s\S]*?Resets\s+([\w]+\s+[\d:]+\s*(?:AM|PM))[\s\S]*?(\d+)%\s*used/i);
      if (allModelsMatch) {
        data.weeklyAllModels = {
          percent: parseInt(allModelsMatch[2]),
          resetsAt: allModelsMatch[1].trim()
        };
        window.CUP.log('Scraped weeklyAllModels:', data.weeklyAllModels);
      }
      
      // Weekly Sonnet: "Sonnet only ... Resets in X hr Y min ... X% used"
      const sonnetMatch = pageText.match(/Sonnet\s+only[\s\S]*?Resets\s+in\s+([\d]+\s*hr\s*[\d]*\s*min|[\d]+\s*min)[\s\S]*?(\d+)%\s*used/i);
      if (sonnetMatch) {
        data.weeklySonnet = {
          percent: parseInt(sonnetMatch[2]),
          resetsIn: sonnetMatch[1].trim()
        };
        window.CUP.log('Scraped weeklySonnet:', data.weeklySonnet);
      }
      
      // Method 2: Find percentage elements directly
      if (!data.currentSession || !data.weeklyAllModels || !data.weeklySonnet) {
        const percentElements = Array.from(document.querySelectorAll('*')).filter(el => {
          const text = el.textContent?.trim();
          return text && /^\d+%\s*used$/.test(text);
        });
        
        window.CUP.log('Found percent elements:', percentElements.length);
      }
      
      // Save if we got any data
      if (data.currentSession || data.weeklyAllModels || data.weeklySonnet) {
        this.lastScrapedData = data;
        
        // Sync to background
        window.CUP.sendToBackground({
          type: 'SYNC_SCRAPED_DATA',
          data: data
        });
        
        window.CUP.log('UsageScraper: Scraped and saved:', data);
        return data;
      }
      
      return null;
      
    } catch (e) {
      window.CUP.logError('UsageScraper: Scrape failed:', e);
      return null;
    }
  }
  
  /**
   * Detect current model from page
   */
  detectCurrentModel() {
    const bodyText = document.body?.innerText?.toLowerCase() || '';
    
    // Check near the input area
    const inputArea = document.querySelector('[class*="composer"]') || document.querySelector('form');
    if (inputArea) {
      const text = inputArea.innerText?.toLowerCase() || '';
      if (text.includes('opus')) return 'opus';
      if (text.includes('haiku')) return 'haiku';
    }
    
    // Check full page
    if (bodyText.includes('opus 4.5')) return 'opus';
    if (bodyText.includes('haiku 4.5')) return 'haiku';
    
    return 'sonnet';
  }
}

window.UsageScraper = UsageScraper;
window.CUP.log('UsageScraper loaded');
