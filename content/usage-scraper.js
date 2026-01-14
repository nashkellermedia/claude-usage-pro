/**
 * Claude Usage Pro - Usage Scraper
 * Scrapes usage from Claude.ai settings/usage page
 * 
 * Validated parsing logic:
 * - Current Session: 0% ✅
 * - All Models: 7% ✅
 * - Sonnet Only: 35% ✅
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
    
    // If on usage page, scrape directly
    if (window.location.pathname.includes('/settings/usage')) {
      const data = this.scrapePageText(document.body.innerText);
      if (data) {
        this.lastScrapedData = data;
        return data;
      }
    }
    
    // Background fetch
    try {
      const response = await fetch('https://claude.ai/settings/usage', {
        credentials: 'include',
        headers: { 'Accept': 'text/html' }
      });
      
      if (response.ok) {
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const text = doc.body?.innerText || '';
        
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
   * Parse page text by splitting into sections first
   * This prevents regex from crossing section boundaries
   */
  scrapePageText(text) {
    window.CUP.log('UsageScraper: Parsing text, length:', text.length);
    
    const data = {
      currentSession: null,
      weeklyAllModels: null,
      weeklySonnet: null,
      source: 'text-parse',
      scrapedAt: Date.now()
    };
    
    // Extract each section by finding text between headers
    // Current session ends before "Weekly limits" or "All models"
    const currentSessionSection = text.match(/Current\s+session([\s\S]*?)(?=Weekly\s+limits|All\s+models|$)/i);
    
    // All models section ends before "Sonnet only"
    const allModelsSection = text.match(/All\s+models([\s\S]*?)(?=Sonnet\s+only|$)/i);
    
    // Sonnet section ends before "Last updated" or "Extra usage"
    const sonnetSection = text.match(/Sonnet\s+only([\s\S]*?)(?=Last\s+updated|Extra\s+usage|$)/i);
    
    // Parse Current Session
    if (currentSessionSection) {
      const section = currentSessionSection[1];
      const percentMatch = section.match(/(\d+)%\s*used/i);
      const resetMatch = section.match(/Resets\s+in\s+([\d]+\s*hr?\s*[\d]*\s*min?)/i);
      
      data.currentSession = {
        percent: percentMatch ? parseInt(percentMatch[1]) : 0,
        resetsIn: resetMatch ? resetMatch[1].trim() : '--'
      };
      window.CUP.log('UsageScraper: Current Session:', data.currentSession.percent + '%');
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
      const resetMatch = section.match(/Resets\s+in\s+([\d]+\s*hr?\s*[\d]*\s*min?)/i);
      
      if (percentMatch) {
        data.weeklySonnet = {
          percent: parseInt(percentMatch[1]),
          resetsIn: resetMatch ? resetMatch[1].trim() : '--'
        };
        window.CUP.log('UsageScraper: Sonnet Only:', data.weeklySonnet.percent + '%');
      }
    }
    
    window.CUP.log('UsageScraper: Parse complete');
    
    if (data.currentSession || data.weeklyAllModels || data.weeklySonnet) {
      return data;
    }
    
    return null;
  }
  
  scrapeCurrentPage() {
    if (!window.location.pathname.includes('/settings/usage')) return;
    
    window.CUP.log('UsageScraper: Scraping current page...');
    
    const data = this.scrapePageText(document.body.innerText);
    
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
