/**
 * Claude Usage Pro - Content Script
 * Main script that runs on claude.ai
 */

console.log('🎯 Claude Usage Pro content script loaded!');
console.log('🎯 Document ready state:', document.readyState);

// Wait for page to be ready
function initializeExtension() {
  console.log('🚀 Initializing Claude Usage Pro...');
  console.log('🚀 Body exists:', !!document.body);
  
  // Start message tracking
  if (window.ClaudeMessageTracker) {
    console.log('✅ Message tracker found');
    window.ClaudeMessageTracker.start();
  } else {
    console.error('❌ Message tracker not found');
  }
  
  // Initialize UI overlay (hybrid contextual design)
  initializeOverlay();
  
  // Listen for usage updates
  window.addEventListener('message', handleUsageUpdate);
  
  console.log('✅ Claude Usage Pro initialized!');
}

/**
 * Initialize the hybrid contextual overlay
 */
function initializeOverlay() {
  console.log('🎨 initializeOverlay called');
  
  // Check if badge already exists
  if (document.getElementById('claude-usage-badge')) {
    console.log('⚠️ Badge already exists, removing it');
    document.getElementById('claude-usage-badge').remove();
  }
  
  // Create minimal badge in corner
  const badge = document.createElement('div');
  badge.id = 'claude-usage-badge';
  badge.className = 'claude-usage-badge';
  badge.innerHTML = `
    <div class="badge-content">
      <span class="badge-icon">⚡</span>
      <span class="badge-text">0%</span>
    </div>
  `;
  
  console.log('🎨 Badge element created:', badge);
  
  document.body.appendChild(badge);
  
  console.log('🎨 Badge appended to body');
  console.log('🎨 Badge in DOM:', !!document.getElementById('claude-usage-badge'));
  
  // Test if badge is visible
  const rect = badge.getBoundingClientRect();
  console.log('🎨 Badge position:', {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    visible: rect.width > 0 && rect.height > 0
  });
  
  // Load current stats
  loadStats();
  
  // Add hover functionality with detailed logging
  console.log('🎨 Adding mouseenter listener');
  badge.addEventListener('mouseenter', function(e) {
    console.log('🖱️ MOUSEENTER EVENT FIRED!', e);
    showDetailedOverlay();
  });
  
  console.log('🎨 Adding mouseleave listener');
  badge.addEventListener('mouseleave', function(e) {
    console.log('🖱️ MOUSELEAVE EVENT FIRED!', e);
    hideDetailedOverlay();
  });
  
  // Add click to open popup
  console.log('🎨 Adding click listener');
  badge.addEventListener('click', function(e) {
    console.log('🖱️ CLICK EVENT FIRED!', e);
    chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
  });
  
  console.log('✅ All event listeners attached');
  
  // Test event listener manually
  setTimeout(() => {
    console.log('🧪 Testing if hover would work...');
    const testBadge = document.getElementById('claude-usage-badge');
    if (testBadge) {
      console.log('🧪 Badge found by ID');
      console.log('🧪 Badge onmouseenter:', testBadge.onmouseenter);
      console.log('🧪 Badge onclick:', testBadge.onclick);
      
      // Try to manually trigger
      console.log('🧪 Manually dispatching mouseenter event...');
      testBadge.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    } else {
      console.error('🧪 Badge NOT found by ID after timeout!');
    }
  }, 2000);
}

/**
 * Load current stats and update badge
 */
async function loadStats() {
  console.log('📊 Loading stats...');
  try {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
      console.log('📊 loadStats response:', response);
      
      if (chrome.runtime.lastError) {
        console.error('❌ Runtime error:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.stats) {
        updateBadge(response.stats);
      } else {
        console.error('❌ No stats in response');
      }
    });
  } catch (error) {
    console.error('❌ Failed to load stats:', error);
  }
}

/**
 * Update badge display
 */
function updateBadge(stats) {
  console.log('🔄 Updating badge with stats:', stats);
  
  const badge = document.getElementById('claude-usage-badge');
  if (!badge) {
    console.error('❌ Badge not found in updateBadge');
    return;
  }
  
  const textElement = badge.querySelector('.badge-text');
  if (textElement) {
    textElement.textContent = Math.round(stats.usagePercentage) + '%';
    console.log('✅ Badge text updated to:', textElement.textContent);
  }
  
  // Update color based on usage
  const percentage = stats.usagePercentage;
  let color = '#10B981'; // Green
  if (percentage >= 95) color = '#EF4444'; // Red
  else if (percentage >= 80) color = '#F59E0B'; // Orange
  else if (percentage >= 50) color = '#FBBF24'; // Yellow
  
  badge.style.setProperty('--usage-color', color);
}

/**
 * Show detailed overlay on hover
 */
function showDetailedOverlay() {
  console.log('📋 ==========================================');
  console.log('📋 showDetailedOverlay called');
  console.log('📋 ==========================================');
  
  // Check if overlay already exists
  let overlay = document.getElementById('claude-usage-overlay');
  if (overlay) {
    console.log('📋 Overlay exists, showing it');
    overlay.classList.add('show');
    return;
  }
  
  console.log('📋 Creating new overlay');
  
  // Create detailed overlay with loading state
  overlay = document.createElement('div');
  overlay.id = 'claude-usage-overlay';
  overlay.className = 'claude-usage-overlay show';
  overlay.innerHTML = `
    <div class="overlay-header">
      <h3>Usage Overview</h3>
    </div>
    <div class="overlay-body">
      <div class="stat-row">
        <span class="stat-label">Loading...</span>
        <span class="stat-value">⏳</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  console.log('📋 Overlay added to DOM');
  console.log('📋 Overlay classList:', overlay.classList.toString());
  console.log('📋 Overlay display style:', window.getComputedStyle(overlay).display);
  
  // Load stats
  console.log('📊 Requesting stats for overlay...');
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
    console.log('📊 Overlay GET_STATS response:', response);
    
    if (chrome.runtime.lastError) {
      console.error('❌ Runtime error in overlay:', chrome.runtime.lastError);
      overlay.innerHTML = `
        <div class="overlay-header">
          <h3>Usage Overview</h3>
        </div>
        <div class="overlay-body">
          <div class="stat-row">
            <span class="stat-label">Error:</span>
            <span class="stat-value">${chrome.runtime.lastError.message}</span>
          </div>
        </div>
      `;
      return;
    }
    
    if (!response || !response.success || !response.stats) {
      console.error('❌ Invalid response:', response);
      overlay.innerHTML = `
        <div class="overlay-header">
          <h3>Usage Overview</h3>
        </div>
        <div class="overlay-body">
          <div class="stat-row">
            <span class="stat-label">Error loading stats</span>
            <span class="stat-value">❌</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Response:</span>
            <span class="stat-value">${JSON.stringify(response)}</span>
          </div>
        </div>
      `;
      return;
    }
    
    console.log('✅ Got valid stats, updating overlay');
    const stats = response.stats;
    overlay.innerHTML = `
      <div class="overlay-header">
        <h3>Usage Overview</h3>
      </div>
      <div class="overlay-body">
        <div class="stat-row">
          <span class="stat-label">Today:</span>
          <span class="stat-value">${formatNumber(stats.tokensUsed)} / ${formatNumber(stats.quota)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Cost:</span>
          <span class="stat-value">${formatCurrency(stats.costUsed)} / ${formatCurrency(stats.budget)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Messages:</span>
          <span class="stat-value">${stats.messagesCount}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Resets:</span>
          <span class="stat-value">${formatTimeUntilReset(stats.nextReset)}</span>
        </div>
      </div>
      <div class="overlay-footer">
        <button class="overlay-btn" id="open-dashboard">📊 Dashboard</button>
      </div>
    `;
    
    console.log('✅ Overlay HTML updated');
    
    // Add dashboard button handler
    const dashboardBtn = overlay.querySelector('#open-dashboard');
    if (dashboardBtn) {
      dashboardBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
      });
    }
  });
}

/**
 * Hide detailed overlay
 */
function hideDetailedOverlay() {
  console.log('📋 hideDetailedOverlay called');
  const overlay = document.getElementById('claude-usage-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    console.log('📋 Overlay hidden');
  }
}

/**
 * Handle usage update messages
 */
function handleUsageUpdate(event) {
  if (event.data.type === 'CLAUDE_USAGE_UPDATE') {
    console.log('📊 Usage update received:', event.data.stats);
    updateBadge(event.data.stats);
    
    // Update overlay if visible
    const overlay = document.getElementById('claude-usage-overlay');
    if (overlay && overlay.classList.contains('show')) {
      showDetailedOverlay(); // Refresh overlay content
    }
  }
}

/**
 * Utility functions
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function formatCurrency(amount) {
  return '$' + amount.toFixed(2);
}

function formatTimeUntilReset(resetTimestamp) {
  const now = Date.now();
  const diff = resetTimestamp - now;
  
  if (diff <= 0) return 'Soon';
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Initialize based on document state
if (document.readyState === 'loading') {
  console.log('🎯 Document still loading, waiting for DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  console.log('🎯 Document already loaded, initializing now');
  initializeExtension();
}
