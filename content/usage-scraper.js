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
    
    // If on usage page, scrape directly from DOM
    if (window.location.pathname.includes('/settings/usage')) {
      // Wait for content to load
      await this.waitForContent();
      const data = this.scrapeFromMainContent();
      if (data) {
        this.lastScrapedData = data;
        return data;
      }
    }
    
    // Not on usage page - return cached data
    // Note: Background HTML fetch doesn't work because Claude uses client-side rendering
    // The user needs to visit the usage page to refresh data
    if (this.lastScrapedData) {
      window.CUP.log('UsageScraper: Returning cached data (visit /settings/usage to refresh)');
      return this.lastScrapedData;
    }
    
    window.CUP.log('UsageScraper: No cached data - please visit Settings > Usage to sync');
    return null;
  }
  
  async waitForContent(maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
      const pageText = document.body?.innerText || '';
      if (pageText.includes('Plan usage limits') || pageText.includes('Current session')) {
        return true;
      }
      if (pageText.includes('Loading...')) {
        window.CUP.log('UsageScraper: Waiting for content... (attempt', i + 1 + ')');
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
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
      // Try multiple reset time formats - capture number AND units
      let resetMatch = section.match(/Resets?\s+in\s+(\d+\s*(?:hours?|hr?|h)\s*(?:\d+\s*(?:minutes?|min|m))?)/i);
      if (!resetMatch) resetMatch = section.match(/Resets?\s+in\s+(\d+\s*(?:minutes?|min|m))/i);
      if (!resetMatch) resetMatch = section.match(/Resets?\s+in\s+(\d+\s*(?:days?|d))/i);
      if (!resetMatch) resetMatch = section.match(/(\d+\s*(?:hours?|hr?|h|minutes?|min|m))\s*(?:left|remaining)/i);
      
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
      
      // Try day/time format first (e.g., "Monday 3:00 PM"), then time-based format
      let resetMatch = section.match(/Resets\s+([A-Za-z]+\s+[\d:]+\s*(?:AM|PM)?)/i);
      if (!resetMatch) resetMatch = section.match(/Resets?\s+in\s+(\d+\s*(?:hours?|hr?|h)\s*(?:\d+\s*(?:minutes?|min|m))?)/i);
      if (!resetMatch) resetMatch = section.match(/Resets?\s+in\s+(\d+\s*(?:minutes?|min|m))/i);
      if (!resetMatch) resetMatch = section.match(/Resets?\s+in\s+(\d+\s*(?:days?|d))/i);
      
      if (percentMatch) {
        data.weeklyAllModels = {
          percent: parseInt(percentMatch[1]),
          resetsAt: resetMatch ? resetMatch[1].trim() : '--'
        };
        window.CUP.log('UsageScraper: All Models:', data.weeklyAllModels.percent + '%, resets', data.weeklyAllModels.resetsAt);
      }
    }
    
    // Parse Sonnet Only
    if (sonnetSection) {
      const section = sonnetSection[1];
      const percentMatch = section.match(/(\d+)%\s*used/i);
      // Try multiple reset time formats
      // First try "Resets in X hr Y min" format
      let resetMatch = section.match(/Resets?\s+in\s+(\d+\s*(?:hours?|hr?|h)\s*(?:\d+\s*(?:minutes?|min|m))?)/i);
      if (!resetMatch) resetMatch = section.match(/Resets?\s+in\s+(\d+\s*(?:minutes?|min|m))/i);
      if (!resetMatch) resetMatch = section.match(/Resets?\s+in\s+(\d+\s*(?:days?|d))/i);
      // Then try "Resets Thu 1:00 AM" day/time format
      if (!resetMatch) resetMatch = section.match(/Resets?\s+([A-Za-z]{3,}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
      if (!resetMatch) resetMatch = section.match(/(\d+\s*(?:hours?|hr?|h|minutes?|min|m))\s*(?:left|remaining)/i);
      
      if (percentMatch) {
        data.weeklySonnet = {
          percent: parseInt(percentMatch[1]),
          resetsIn: resetMatch ? resetMatch[1].trim() : '--'
        };
        window.CUP.log('UsageScraper: Sonnet Only:', data.weeklySonnet.percent + '%, resets', data.weeklySonnet.resetsIn);
      }
    }
    
    if (data.currentSession || data.weeklyAllModels || data.weeklySonnet) {
      return data;
    }
    
    window.CUP.log('UsageScraper: No data found in text');
    return null;
  }
  
  async scrapeCurrentPage() {
    if (!window.location.pathname.includes('/settings/usage')) return;
    
    window.CUP.log('UsageScraper: Scraping current page...');
    
    // Wait for content to load
    await this.waitForContent();
    
    const data = this.scrapeFromMainContent();
    
    if (data) {
      this.lastScrapedData = data;
      window.CUP.sendToBackground({ type: 'SYNC_SCRAPED_DATA', usageData: data });
      window.CUP.log('UsageScraper: Data synced to background');
    } else {
      window.CUP.log('UsageScraper: Failed to scrape - content may not have loaded');
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
