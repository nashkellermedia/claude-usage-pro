/**
 * Claude Usage Pro - Usage Scraper
 * Automatically fetches usage data from Claude.ai
 */

class UsageScraper {
  constructor() {
    this.lastScrapedData = null;
    this.setupPageObserver();
  }
  
  setupPageObserver() {
    // Scrape if we're on usage page
    if (window.location.pathname.includes('/settings/usage')) {
      setTimeout(() => this.scrapeCurrentPage(), 1000);
    }
    
    // Watch for navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (location.pathname.includes('/settings/usage')) {
          setTimeout(() => this.scrapeCurrentPage(), 1000);
        }
      }
    }).observe(document.body, { subtree: true, childList: true });
  }
  
  /**
   * Main scrape - fetches usage page in background
   */
  async scrapeUsage() {
    window.CUP.log('UsageScraper: Starting background fetch...');
    
    try {
      // Fetch the usage page HTML
      const response = await fetch('https://claude.ai/settings/usage', {
        credentials: 'include',
        headers: {
          'Accept': 'text/html'
        }
      });
      
      if (!response.ok) {
        window.CUP.log('UsageScraper: Fetch failed:', response.status);
        return this.lastScrapedData;
      }
      
      const html = await response.text();
      const data = this.parseUsageHTML(html);
      
      if (data) {
        this.lastScrapedData = data;
        window.CUP.log('UsageScraper: Got data:', data);
        return data;
      }
      
    } catch (e) {
      window.CUP.logError('UsageScraper: Fetch error:', e);
    }
    
    return this.lastScrapedData;
  }
  
  /**
   * Parse usage data from HTML
   */
  parseUsageHTML(html) {
    try {
      // Create a DOM parser
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const text = doc.body?.innerText || html;
      
      const data = {
        currentSession: null,
        weeklyAllModels: null,
        weeklySonnet: null,
        source: 'background-fetch',
        scrapedAt: Date.now()
      };
      
      // Parse Current Session
      const sessionMatch = text.match(/Current\s+session[\s\S]*?Resets\s+in\s+([\d]+\s*hr?\s*[\d]*\s*min?|[\d]+\s*min?)[\s\S]*?(\d+)%\s*used/i);
      if (sessionMatch) {
        data.currentSession = {
          percent: parseInt(sessionMatch[2]),
          resetsIn: sessionMatch[1].trim()
        };
      }
      
      // Parse Weekly All Models
      const allMatch = text.match(/All\s+models[\s\S]*?Resets\s+([\w]+\s+[\d:]+\s*(?:AM|PM)?)[\s\S]*?(\d+)%\s*used/i);
      if (allMatch) {
        data.weeklyAllModels = {
          percent: parseInt(allMatch[2]),
          resetsAt: allMatch[1].trim()
        };
      }
      
      // Parse Weekly Sonnet
      const sonnetMatch = text.match(/Sonnet\s+only[\s\S]*?Resets\s+in\s+([\d]+\s*hr?\s*[\d]*\s*min?|[\d]+\s*min?)[\s\S]*?(\d+)%\s*used/i);
      if (sonnetMatch) {
        data.weeklySonnet = {
          percent: parseInt(sonnetMatch[2]),
          resetsIn: sonnetMatch[1].trim()
        };
      }
      
      // Check if we got any data
      if (data.currentSession || data.weeklyAllModels || data.weeklySonnet) {
        return data;
      }
      
      // Fallback: Try to find percentages in a different format
      const percentages = text.match(/(\d+)%\s*used/gi);
      if (percentages && percentages.length >= 1) {
        const percents = percentages.map(p => parseInt(p));
        data.currentSession = { percent: percents[0] || 0, resetsIn: '--' };
        if (percents[1]) data.weeklyAllModels = { percent: percents[1], resetsAt: '--' };
        if (percents[2]) data.weeklySonnet = { percent: percents[2], resetsIn: '--' };
        return data;
      }
      
      return null;
      
    } catch (e) {
      window.CUP.logError('UsageScraper: Parse error:', e);
      return null;
    }
  }
  
  /**
   * Scrape current page (when on usage page)
   */
  scrapeCurrentPage() {
    if (!window.location.pathname.includes('/settings/usage')) return;
    
    window.CUP.log('UsageScraper: Scraping current page...');
    
    const text = document.body.innerText;
    const data = {
      currentSession: null,
      weeklyAllModels: null,
      weeklySonnet: null,
      source: 'direct-page',
      scrapedAt: Date.now()
    };
    
    // Current Session
    const sessionMatch = text.match(/Current\s+session[\s\S]*?Resets\s+in\s+([\d]+\s*hr?\s*[\d]*\s*min?|[\d]+\s*min?)[\s\S]*?(\d+)%\s*used/i);
    if (sessionMatch) {
      data.currentSession = { percent: parseInt(sessionMatch[2]), resetsIn: sessionMatch[1].trim() };
    }
    
    // Weekly All Models  
    const allMatch = text.match(/All\s+models[\s\S]*?Resets\s+([\w]+\s+[\d:]+\s*(?:AM|PM)?)[\s\S]*?(\d+)%\s*used/i);
    if (allMatch) {
      data.weeklyAllModels = { percent: parseInt(allMatch[2]), resetsAt: allMatch[1].trim() };
    }
    
    // Weekly Sonnet
    const sonnetMatch = text.match(/Sonnet\s+only[\s\S]*?Resets\s+in\s+([\d]+\s*hr?\s*[\d]*\s*min?|[\d]+\s*min?)[\s\S]*?(\d+)%\s*used/i);
    if (sonnetMatch) {
      data.weeklySonnet = { percent: parseInt(sonnetMatch[2]), resetsIn: sonnetMatch[1].trim() };
    }
    
    if (data.currentSession || data.weeklyAllModels || data.weeklySonnet) {
      this.lastScrapedData = data;
      window.CUP.sendToBackground({ type: 'SYNC_SCRAPED_DATA', data });
      window.CUP.log('UsageScraper: Scraped from page:', data);
    }
  }
  
  /**
   * Detect current model
   */
  detectCurrentModel() {
    const text = document.body?.innerText?.toLowerCase() || '';
    if (text.includes('opus 4.5') || text.includes('opus-4')) return 'opus';
    if (text.includes('haiku 4.5') || text.includes('haiku-4')) return 'haiku';
    return 'sonnet';
  }
}

window.UsageScraper = UsageScraper;
window.CUP.log('UsageScraper loaded');
