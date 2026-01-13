/**
 * Debug helper - exposes functions to window for testing
 */

// Expose debug functions to window
window.ClaudeUsageDebug = {
  // Check storage
  async checkStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get('currentStats', (result) => {
        console.log('📦 Storage contents:', result);
        resolve(result);
      });
    });
  },
  
  // Trigger overlay manually
  showOverlay() {
    const overlay = document.getElementById('claude-usage-overlay');
    if (overlay) {
      overlay.classList.add('show');
      console.log('✅ Overlay shown');
    } else {
      console.log('❌ Overlay not found');
    }
  },
  
  // Hide overlay
  hideOverlay() {
    const overlay = document.getElementById('claude-usage-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      console.log('✅ Overlay hidden');
    }
  },
  
  // Test badge hover
  testHover() {
    const badge = document.getElementById('claude-usage-badge');
    if (badge) {
      console.log('🧪 Triggering mouseenter...');
      badge.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    } else {
      console.log('❌ Badge not found');
    }
  },
  
  // Check if hover listeners are attached
  checkBadge() {
    const badge = document.getElementById('claude-usage-badge');
    if (!badge) {
      console.log('❌ Badge not found');
      return;
    }
    
    const rect = badge.getBoundingClientRect();
    console.log('Badge info:', {
      exists: true,
      position: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      visible: rect.width > 0 && rect.height > 0,
      zIndex: window.getComputedStyle(badge).zIndex
    });
  }
};

console.log('🛠️ Debug helper loaded! Use window.ClaudeUsageDebug');
console.log('Available commands:');
console.log('  - ClaudeUsageDebug.checkStorage()');
console.log('  - ClaudeUsageDebug.showOverlay()');
console.log('  - ClaudeUsageDebug.hideOverlay()');
console.log('  - ClaudeUsageDebug.testHover()');
console.log('  - ClaudeUsageDebug.checkBadge()');
