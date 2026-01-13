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

// CSS Selectors for Claude.ai DOM elements (may need updates as Claude changes)
const SELECTORS = {
  // Sidebar elements
  SIDEBAR_NAV: 'nav[aria-label="Chat history"]',
  SIDEBAR_STARRED: '.flex.flex-col.mb-4',
  SIDEBAR_RECENTS: '.flex.min-w-0.flex-col',
  
  // Chat area elements
  CHAT_CONTAINER: '[data-testid="conversation-turn-"]',
  CHAT_INPUT: '[contenteditable="true"]',
  MODEL_SELECTOR: 'button[data-testid="model-selector"]',
  CHAT_MENU: 'button[aria-label="Open menu"]',
  
  // Header
  HEADER: 'header',
  TITLE_LINE: '.flex.min-w-0.flex-1'
};

// Configuration defaults
const CONFIG = {
  // Update intervals (ms)
  HIGH_FREQ_UPDATE: 500,    // Fast updates (hover states, input)
  MED_FREQ_UPDATE: 1500,    // Medium updates (conversation changes)
  LOW_FREQ_UPDATE: 5000,    // Slow updates (reset timer)
  
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

/**
 * Logging utility
 */
function log(...args) {
  console.log('[Claude Usage Pro]', ...args);
}

function logError(...args) {
  console.error('[Claude Usage Pro]', ...args);
}

function logWarn(...args) {
  console.warn('[Claude Usage Pro]', ...args);
}

/**
 * Wait for an element to appear in the DOM
 */
async function waitForElement(parent, selector, timeout = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const element = parent.querySelector(selector);
    if (element) return element;
    await sleep(100);
  }
  
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
  const selector = document.querySelector(SELECTORS.MODEL_SELECTOR);
  if (!selector) return null;
  
  const text = selector.textContent.toLowerCase();
  
  if (text.includes('opus')) return 'claude-opus-4';
  if (text.includes('haiku')) return 'claude-haiku-4';
  if (text.includes('sonnet')) return 'claude-sonnet-4';
  
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
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    logError('Failed to send message to background:', error);
    return null;
  }
}

/**
 * Create tooltip for an element
 */
function setupTooltip(element, tooltipElement, options = {}) {
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

// Expose globally
window.CUP = {
  COLORS,
  SELECTORS,
  CONFIG,
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
  setupTooltip
};
