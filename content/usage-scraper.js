/**
 * Claude Usage Pro - Usage Scraper
 * Scrapes actual usage data from Claude.ai UI and API responses
 */

class UsageScraper {
  constructor() {
    this.lastScrapedData = null;
    this.scrapedFromUI = false;
  }
  
  /**
   * Main scrape function - tries multiple methods
   */
  async scrapeUsage() {
    window.CUP.log('UsageScraper: Starting scrape...');
    
    let data = null;
    
    // Method 1: Try to get from settings/account page API
    data = await this.scrapeFromAPI();
    if (data) {
      window.CUP.log('UsageScraper: Got data from API');
      this.lastScrapedData = data;
      return data;
    }
    
    // Method 2: Scrape from UI elements
    data = this.scrapeFromUI();
    if (data) {
      window.CUP.log('UsageScraper: Got data from UI');
      this.lastScrapedData = data;
      return data;
    }
    
    // Method 3: Check for usage in page data/state
    data = this.scrapeFromPageState();
    if (data) {
      window.CUP.log('UsageScraper: Got data from page state');
      this.lastScrapedData = data;
      return data;
    }
    
    window.CUP.log('UsageScraper: No data found');
    return null;
  }
  
  /**
   * Scrape from Claude API - intercept network requests
   */
  async scrapeFromAPI() {
    try {
      // Try to fetch usage data from Claude's API
      const response = await fetch('https://claude.ai/api/organizations', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const orgs = await response.json();
        if (orgs && orgs.length > 0) {
          const org = orgs[0];
          
          // Try to get usage from the org
          const usageResponse = await fetch(`https://claude.ai/api/organizations/${org.uuid}/usage`, {
            credentials: 'include',
            headers: {
              'Accept': 'application/json'
            }
          });
          
          if (usageResponse.ok) {
            const usageData = await usageResponse.json();
            return this.parseAPIUsage(usageData);
          }
        }
      }
    } catch (e) {
      window.CUP.log('UsageScraper: API scrape failed:', e.message);
    }
    return null;
  }
  
  /**
   * Parse usage data from API response
   */
  parseAPIUsage(data) {
    if (!data) return null;
    
    try {
      return {
        totalTokens: data.total_tokens || data.tokens_used || 0,
        messagesCount: data.message_count || data.messages || 0,
        modelUsage: {
          'claude-sonnet-4': data.sonnet_tokens || 0,
          'claude-opus-4': data.opus_tokens || 0,
          'claude-haiku-4': data.haiku_tokens || 0
        },
        resetTimestamp: data.reset_at ? new Date(data.reset_at).getTime() : this.getNextResetTime(),
        usageCap: data.token_limit || data.cap || 45000000,
        source: 'api'
      };
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Scrape from UI elements on the page
   */
  scrapeFromUI() {
    try {
      // Look for usage indicators in the UI
      const usageSelectors = [
        '[class*="usage"]',
        '[class*="quota"]',
        '[class*="limit"]',
        '[data-testid*="usage"]',
        '[aria-label*="usage"]'
      ];
      
      for (const sel of usageSelectors) {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
          const text = el.textContent || el.innerText || '';
          const data = this.parseUsageText(text);
          if (data) return data;
        }
      }
      
      // Look for percentage displays
      const percentMatch = document.body.innerText.match(/(\d+(?:\.\d+)?)\s*%\s*(?:used|of|usage)/i);
      if (percentMatch) {
        const percent = parseFloat(percentMatch[1]);
        const cap = 45000000; // Default Pro cap
        return {
          totalTokens: Math.round((percent / 100) * cap),
          usageCap: cap,
          source: 'ui-percent'
        };
      }
      
    } catch (e) {
      window.CUP.log('UsageScraper: UI scrape error:', e.message);
    }
    return null;
  }
  
  /**
   * Parse usage from text content
   */
  parseUsageText(text) {
    if (!text) return null;
    
    // Look for patterns like "1.2M / 45M tokens" or "Used 5,000 tokens"
    const patterns = [
      /(\d+(?:,\d+)*(?:\.\d+)?)\s*[MK]?\s*(?:\/|of)\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*[MK]?\s*tokens?/i,
      /used\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*[MK]?\s*tokens?/i,
      /(\d+(?:,\d+)*(?:\.\d+)?)\s*[MK]?\s*tokens?\s*used/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const used = this.parseTokenNumber(match[1]);
        const cap = match[2] ? this.parseTokenNumber(match[2]) : 45000000;
        if (used > 0) {
          return {
            totalTokens: used,
            usageCap: cap,
            source: 'ui-text'
          };
        }
      }
    }
    return null;
  }
  
  /**
   * Parse token number (handles K, M suffixes and commas)
   */
  parseTokenNumber(str) {
    if (!str) return 0;
    str = str.replace(/,/g, '');
    let num = parseFloat(str);
    if (str.toUpperCase().includes('M')) num *= 1000000;
    else if (str.toUpperCase().includes('K')) num *= 1000;
    return Math.round(num);
  }
  
  /**
   * Try to get usage from page state (React/Next.js state)
   */
  scrapeFromPageState() {
    try {
      // Look for __NEXT_DATA__ or similar
      const nextData = document.getElementById('__NEXT_DATA__');
      if (nextData) {
        const data = JSON.parse(nextData.textContent);
        if (data?.props?.pageProps?.usage) {
          return this.parseAPIUsage(data.props.pageProps.usage);
        }
      }
      
      // Look for window state
      if (window.__CLAUDE_STATE__ && window.__CLAUDE_STATE__.usage) {
        return this.parseAPIUsage(window.__CLAUDE_STATE__.usage);
      }
      
    } catch (e) {
      // Silent fail
    }
    return null;
  }
  
  /**
   * Get next reset time (midnight UTC)
   */
  getNextResetTime() {
    const now = new Date();
    const tomorrow = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    ));
    return tomorrow.getTime();
  }
  
  /**
   * Detect current model from page
   */
  detectCurrentModel() {
    // Check model selector button
    const modelSelectors = [
      '[data-testid="model-selector"]',
      'button[class*="model"]',
      '[class*="ModelSelector"]'
    ];
    
    for (const sel of modelSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.textContent || '').toLowerCase();
        if (text.includes('opus')) return 'claude-opus-4';
        if (text.includes('haiku')) return 'claude-haiku-4';
        if (text.includes('sonnet')) return 'claude-sonnet-4';
      }
    }
    
    // Check page content
    const pageText = document.body?.innerText?.toLowerCase() || '';
    
    // Look for model mentions in recent UI
    if (pageText.includes('opus 4')) return 'claude-opus-4';
    if (pageText.includes('haiku 4')) return 'claude-haiku-4';
    
    // Default to sonnet
    return 'claude-sonnet-4';
  }
}

window.UsageScraper = UsageScraper;
window.CUP.log('UsageScraper loaded');
