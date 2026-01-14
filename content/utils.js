/**
 * Claude Usage Pro - Content Script Utilities
 */

// Colors matching Claude's design
const COLORS = {
  BLUE: '#2c84db',
  RED: '#de2929',
  GREEN: '#22c55e',
  YELLOW: '#f59e0b',
  GRAY: '#6b7280'
};

// CSS Selectors for Claude.ai DOM elements
// These may need updates as Claude changes their UI
const SELECTORS = {
  // Sidebar elements - multiple fallbacks
  SIDEBAR_NAV: 'nav[aria-label="Chat history"], nav.flex-col, aside nav',
  SIDEBAR_CONTAINER: '.flex.flex-grow.flex-col.overflow-y-auto, .overflow-y-auto',
  
  // Chat area elements
  CHAT_INPUT: '[contenteditable="true"], textarea',
  MODEL_SELECTOR: 'button[data-testid="model-selector"], button[aria-haspopup="listbox"]',
  CHAT_MENU: 'button[aria-label="Open menu"], button[aria-label="Chat menu"]',
  
  // Header
  HEADER: 'header',
  TITLE_LINE: '.flex.min-w-0.flex-1'
};

// Configuration defaults
const CONFIG = {
  // Update intervals (ms)
  HIGH_FREQ_UPDATE: 1000,   // Check UI presence
  MED_FREQ_UPDATE: 2000,    // Conversation changes
  LOW_FREQ_UPDATE: 5000,    // Reset timer
  
  // Usage thresholds
  WARNING_THRESHOLD: 0.8,   // 80% - show yellow
  DANGER_THRESHOLD: 0.95,   // 95% - show red
  
  // Token caching duration (5 minutes)
  CACHE_DURATION_MS: 5 * 60 * 1000,
  
  // Model multipliers for weighted token cost
  MODEL_MULTIPLIERS: {
    'claude-sonnet-4': 1.0,
    'claude-3-5-sonnet': 1.0,
    'claude-haiku-4': 0.2,
    'claude-3-5-haiku': 0.2,
    'claude-opus-4': 5.0,
    'claude-3-opus': 5.0
  },
  
  // Default quota (tokens) - can be updated from settings
  DEFAULT_QUOTA: 45000000  // 45M for Pro users
};

// Debug mode
const DEBUG = true;

/**
 * Logging utility
 */
function log(...args) {
  if (DEBUG) {
    console.log('%c[Claude Usage Pro]', 'color: #8b5cf6; font-weight: bold', ...args);
  }
}

function logError(...args) {
  console.error('%c[Claude Usage Pro]', 'color: #ef4444; font-weight: bold', ...args);
}

function logWarn(...args) {
  console.warn('%c[Claude Usage Pro]', 'color: #f59e0b; font-weight: bold', ...args);
}

/**
 * Wait for an element to appear in the DOM
 */
async function waitForElement(parent, selector, timeout = 5000) {
  const startTime = Date.now();
  
  // Try multiple selectors if comma-separated
  const selectors = selector.split(',').map(s => s.trim());
  
  while (Date.now() - startTime < timeout) {
    for (const sel of selectors) {
      const element = parent.querySelector(sel);
      if (element) {
        log(`Found element: ${sel}`);
        return element;
      }
    }
    await sleep(100);
  }
  
  logWarn(`Element not found after ${timeout}ms: ${selector}`);
  return null;
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format number with K/M suffix
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

/**
 * Format currency
 */
function formatCurrency(amount, decimals = 2) {
  return '$' + amount.toFixed(decimals);
}

/**
 * Format time remaining
 */
function formatTimeRemaining(ms) {
  if (ms <= 0) return 'Now';
  
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Get usage color based on percentage
 */
function getUsageColor(percentage) {
  if (percentage >= CONFIG.DANGER_THRESHOLD * 100) return COLORS.RED;
  if (percentage >= CONFIG.WARNING_THRESHOLD * 100) return COLORS.YELLOW;
  return COLORS.BLUE;
}

/**
 * Get current conversation ID from URL
 */
function getConversationId() {
  const match = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/);
  return match ? match[1] : null;
}

/**
 * Get current model from the page
 */
async function getCurrentModel(timeout = 200) {
  // Try multiple selectors
  const selectors = SELECTORS.MODEL_SELECTOR.split(',').map(s => s.trim());
  
  for (const sel of selectors) {
    const selector = document.querySelector(sel);
    if (selector) {
      const text = selector.textContent.toLowerCase();
      
      if (text.includes('opus')) return 'claude-opus-4';
      if (text.includes('haiku')) return 'claude-haiku-4';
      if (text.includes('sonnet')) return 'claude-sonnet-4';
    }
  }
  
  return 'claude-sonnet-4'; // Default
}

/**
 * Check if on mobile view
 */
function isMobileView() {
  return window.innerWidth < 768;
}

/**
 * Send message to background script
 */
async function sendToBackground(message) {
  try {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      log('Extension context invalidated - page reload required');
      showReloadNotification();
      return null;
    }
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (error.message?.includes('Extension context invalidated')) {
      log('Extension was reloaded - page refresh required');
      showReloadNotification();
    } else {
      logError('Failed to send message to background:', error);
    }
    return null;
  }
}

/**
 * Show a notification that the page needs to be reloaded
 */
function showReloadNotification() {
  // Only show once per page load
  if (window.__CUP_RELOAD_SHOWN__) return;
  window.__CUP_RELOAD_SHOWN__ = true;
  
  const notification = document.createElement('div');
  notification.id = 'cup-reload-notification';
  notification.innerHTML = `
    <div style="position: fixed; top: 20px; right: 20px; background: #f59e0b; color: #000; 
                padding: 12px 16px; border-radius: 8px; z-index: 999999; font-family: system-ui;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 12px;">
      <span>⚠️ Claude Usage Pro was updated. Please refresh the page.</span>
      <button onclick="location.reload()" style="background: #000; color: #fff; border: none; 
              padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: 500;">
        Refresh
      </button>
      <button onclick="this.parentElement.remove()" style="background: transparent; border: none; 
              color: #000; cursor: pointer; font-size: 18px; padding: 0 4px;">×</button>
    </div>
  `;
  document.body.appendChild(notification);
}

/**
 * Create tooltip for an element
 */
function setupTooltip(element, tooltipElement, options = {}) {
  if (!element || !tooltipElement) return;
  
  const { topOffset = 10 } = options;
  
  element.addEventListener('mouseenter', (e) => {
    const rect = element.getBoundingClientRect();
    tooltipElement.style.left = rect.left + 'px';
    tooltipElement.style.top = (rect.top - topOffset - tooltipElement.offsetHeight) + 'px';
    tooltipElement.style.opacity = '1';
  });
  
  element.addEventListener('mouseleave', () => {
    tooltipElement.style.opacity = '0';
  });
}

/**
 * Find the sidebar navigation element
 */
function findSidebar() {
  // Try various selectors
  const selectors = [
    'nav[aria-label="Chat history"]',
    'nav.flex-col',
    'aside nav',
    '[data-testid="sidebar"]',
    '.flex.h-full.flex-col'
  ];
  
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      log(`Found sidebar with selector: ${sel}`);
      return el;
    }
  }
  
  // Try finding by structure
  const asides = document.querySelectorAll('aside, nav');
  for (const aside of asides) {
    if (aside.querySelector('a[href="/"]') || aside.textContent.includes('New chat')) {
      log('Found sidebar by structure');
      return aside;
    }
  }
  
  return null;
}

// Expose globally
window.CUP = {
  COLORS,
  SELECTORS,
  CONFIG,
  DEBUG,
  log,
  logError,
  logWarn,
  waitForElement,
  sleep,
  formatNumber,
  formatCurrency,
  formatTimeRemaining,
  getUsageColor,
  getConversationId,
  getCurrentModel,
  isMobileView,
  sendToBackground,
  showReloadNotification,
  setupTooltip,
  findSidebar
};

// Log that utils loaded
log('Utils loaded successfully');
