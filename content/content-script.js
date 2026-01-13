/**
 * Claude Usage Pro - Content Script
 * Main script that runs on claude.ai
 */

console.log('🎯 Claude Usage Pro content script loaded!');

// Wait for page to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

function initializeExtension() {
  console.log('🚀 Initializing Claude Usage Pro...');
  
  // Start message tracking
  if (window.ClaudeMessageTracker) {
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
  
  document.body.appendChild(badge);
  
  // Load current stats
  loadStats();
  
  // Add hover functionality
  badge.addEventListener('mouseenter', () => {
    console.log('🖱️ Badge hover - showing overlay');
    showDetailedOverlay();
  });
  
  badge.addEventListener('mouseleave', () => {
    console.log('🖱️ Badge unhover - hiding overlay');
    hideDetailedOverlay();
  });
  
  // Add click to open popup
  badge.addEventListener('click', () => {
    console.log('🖱️ Badge clicked');
    chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
  });
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
    console.error('❌ Badge not found');
    return;
  }
  
  const textElement = badge.querySelector('.badge-text');
  if (textElement) {
    textElement.textContent = Math.round(stats.usagePercentage) + '%';
    console.log('✅ Badge updated to:', textElement.textContent);
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
  console.log('📋 showDetailedOverlay called');
  
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
  const overlay = document.getElementById('claude-usage-overlay');
  if (overlay) {
    overlay.classList.remove('show');
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
