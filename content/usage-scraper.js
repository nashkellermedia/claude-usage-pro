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
      const response = await fetch('https://claude.ai/settings/usage', {
        credentials: 'include',
        headers: { 'Accept': 'text/html' }
      });
      
      if (!response.ok) {
        window.CUP.log('UsageScraper: Fetch failed:', response.status);
        return this.lastScrapedData;
      }
      
      const html = await response.text();
      const data = this.parseUsageHTML(html);
      
      if (data) {
        this.lastScrapedData = data;
        window.CUP.log('UsageScraper: Got data:', JSON.stringify(data));
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
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const text = doc.body?.innerText || html;
      
      window.CUP.log('UsageScraper: Parsing HTML, text length:', text.length);
      
      return this.parseText(text, 'background-fetch');
      
    } catch (e) {
      window.CUP.logError('UsageScraper: Parse error:', e);
      return null;
    }
  }
  
  /**
   * Parse text to extract usage percentages
   * Uses section headers to find each percentage
   */
  parseText(text, source) {
    const data = {
      currentSession: null,
      weeklyAllModels: null,
      weeklySonnet: null,
      source: source,
      scrapedAt: Date.now()
    };
    
    // Find Current session: look for "Current session" followed by "X% used"
    const currentSessionMatch = text.match(/Current\s+session[\s\S]*?(\d+)%\s*used/i);
    if (currentSessionMatch) {
      data.currentSession = { percent: parseInt(currentSessionMatch[1]) };
      
      // Extract reset time
      const resetMatch = text.match(/Current\s+session[\s\S]*?Resets\s+in\s+([\d]+\s*hr?\s*[\d]*\s*min?)/i);
      if (resetMatch) {
        data.currentSession.resetsIn = resetMatch[1].trim();
      }
      window.CUP.log('UsageScraper: Current session:', data.currentSession.percent + '%');
    }
    
    // Find All models: look for "All models" followed by "X% used"
    const allModelsMatch = text.match(/All\s+models[\s\S]*?(\d+)%\s*used/i);
    if (allModelsMatch) {
      data.weeklyAllModels = { percent: parseInt(allModelsMatch[1]) };
      
      // Extract reset time (format: "Resets Tue 9:00 PM")
      const resetMatch = text.match(/All\s+models[\s\S]*?Resets\s+([\w]+\s+[\d:]+\s*(?:AM|PM)?)/i);
      if (resetMatch) {
        data.weeklyAllModels.resetsAt = resetMatch[1].trim();
      }
      window.CUP.log('UsageScraper: All models:', data.weeklyAllModels.percent + '%');
    }
    
    // Find Sonnet only: look for "Sonnet only" followed by "X% used"
    const sonnetMatch = text.match(/Sonnet\s+only[\s\S]*?(\d+)%\s*used/i);
    if (sonnetMatch) {
      data.weeklySonnet = { percent: parseInt(sonnetMatch[1]) };
      
      // Extract reset time
      const resetMatch = text.match(/Sonnet\s+only[\s\S]*?Resets\s+in\s+([\d]+\s*hr?\s*[\d]*\s*min?)/i);
      if (resetMatch) {
        data.weeklySonnet.resetsIn = resetMatch[1].trim();
      }
      window.CUP.log('UsageScraper: Sonnet only:', data.weeklySonnet.percent + '%');
    }
    
    // Return data if we found at least one section
    if (data.currentSession || data.weeklyAllModels || data.weeklySonnet) {
      return data;
    }
    
    window.CUP.log('UsageScraper: No usage data found in text');
    return null;
  }
  
  /**
   * Scrape current page (when on usage page)
   */
  scrapeCurrentPage() {
    if (!window.location.pathname.includes('/settings/usage')) return;
    
    window.CUP.log('UsageScraper: Scraping current page...');
    
    const text = document.body.innerText;
    const data = this.parseText(text, 'direct-page');
    
    if (data) {
      this.lastScrapedData = data;
      window.CUP.sendToBackground({ type: 'SYNC_SCRAPED_DATA', data });
      window.CUP.log('UsageScraper: Saved scraped data:', JSON.stringify(data));
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
