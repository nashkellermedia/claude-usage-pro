/**
 * Claude Usage Pro - Utilities
 */

window.CUP = window.CUP || {};

// Extension context check
window.CUP.isExtensionValid = function() {
  try {
    return chrome.runtime && chrome.runtime.id;
  } catch (e) {
    return false;
  }
};

// Logging
window.CUP.log = function(...args) {
  console.log('%c[Claude Usage Pro]', 'color: #3b82f6; font-weight: bold', ...args);
};

window.CUP.logError = function(...args) {
  console.error('%c[Claude Usage Pro]', 'color: #ef4444; font-weight: bold', ...args);
};

window.CUP.logWarn = function(...args) {
  console.warn('%c[Claude Usage Pro]', 'color: #f59e0b; font-weight: bold', ...args);
};

// Safe messaging with extension invalidation handling
window.CUP.sendToBackground = async function(message) {
  if (!window.CUP.isExtensionValid()) {
    window.CUP.showReloadNotification();
    return null;
  }
  
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (e) {
    if (e.message && e.message.includes('Extension context invalidated')) {
      window.CUP.showReloadNotification();
      return null;
    }
    window.CUP.logError('Send error:', e.message);
    return null;
  }
};

// Show reload notification only once
window.CUP._reloadShown = false;
window.CUP.showReloadNotification = function() {
  if (window.CUP._reloadShown) return;
  window.CUP._reloadShown = true;
  
  const notification = document.createElement('div');
  notification.id = 'cup-reload-notification';
  
  // Create wrapper div
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position: fixed',
    'top: 20px',
    'right: 20px',
    'background: linear-gradient(135deg, #1e40af, #3b82f6)',
    'color: white',
    'padding: 16px 20px',
    'border-radius: 12px',
    'box-shadow: 0 10px 40px rgba(0,0,0,0.4)',
    'z-index: 999999',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    'font-size: 14px',
    'display: flex',
    'align-items: center',
    'gap: 12px',
    'animation: cupSlideIn 0.3s ease-out'
  ].join(';');
  
  // Icon
  const icon = document.createElement('span');
  icon.style.fontSize = '24px';
  icon.textContent = '🔄';
  wrapper.appendChild(icon);
  
  // Text content
  const textDiv = document.createElement('div');
  const title = document.createElement('div');
  title.style.cssText = 'font-weight: 600; margin-bottom: 4px;';
  title.textContent = 'Extension Updated';
  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'opacity: 0.9; font-size: 12px;';
  subtitle.textContent = 'Refresh this page to continue using Claude Usage Pro';
  textDiv.appendChild(title);
  textDiv.appendChild(subtitle);
  wrapper.appendChild(textDiv);
  
  // Refresh button - attach click handler programmatically (CSP-safe)
  const button = document.createElement('button');
  button.textContent = 'Refresh';
  button.style.cssText = [
    'background: white',
    'color: #1e40af',
    'border: none',
    'padding: 8px 16px',
    'border-radius: 6px',
    'font-weight: 600',
    'cursor: pointer',
    'margin-left: 8px'
  ].join(';');
  button.addEventListener('click', function() {
    window.location.reload();
  });
  wrapper.appendChild(button);
  
  notification.appendChild(wrapper);
  
  const style = document.createElement('style');
  style.textContent = '@keyframes cupSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
  document.head.appendChild(style);
  document.body.appendChild(notification);
};

// Utility functions
window.CUP.sleep = function(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};

window.CUP.formatTokens = function(tokens) {
  if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M';
  if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'K';
  return tokens.toLocaleString();
};

// Estimate tokens from text
window.CUP.estimateTokens = function(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
};

window.CUP.log('Utils loaded successfully');
