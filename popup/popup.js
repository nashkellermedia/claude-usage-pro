/**
 * Claude Usage Pro - Popup JavaScript
 */

let currentStats = null;
let settings = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  setupEventListeners();
  startTimers();
});

/**
 * Load stats and settings
 */
async function loadData() {
  try {
    // Get stats
    const statsResponse = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    currentStats = statsResponse.stats;
    
    // Get settings
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    settings = settingsResponse.settings;
    
    // Update UI
    updateUI();
    
    // Hide loading, show content
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
    
  } catch (error) {
    console.error('Error loading data:', error);
    showError('Failed to load data. Please refresh.');
  }
}

/**
 * Update all UI elements
 */
function updateUI() {
  if (!currentStats || !settings) return;
  
  // Update progress bar
  const percentage = currentStats.usagePercentage;
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  
  progressBar.style.width = Math.min(percentage, 100) + '%';
  progressBar.style.backgroundColor = getUsageColor(percentage);
  progressText.textContent = Math.round(percentage) + '%';
  
  // Update tokens
  document.getElementById('tokensUsed').textContent = 
    `${formatNumber(currentStats.tokensUsed)} / ${formatNumber(currentStats.quota)}`;
  
  // Update cost
  document.getElementById('costUsed').textContent = 
    `${formatCurrency(currentStats.costUsed)} / ${formatCurrency(currentStats.budget)}`;
  
  // Update reset timer
  updateResetTimer();
  
  // Update chat stats (placeholder for now)
  document.getElementById('chatTokens').textContent = '--';
  document.getElementById('chatCost').textContent = '--';
  document.getElementById('cachedTokens').textContent = '-- cached (--)';
  
  // Update quick stats
  document.getElementById('messagesCount').textContent = 
    `• ${currentStats.messagesCount} messages today`;
  
  const avgTokens = currentStats.messagesCount > 0 
    ? Math.round(currentStats.tokensUsed / currentStats.messagesCount)
    : 0;
  document.getElementById('avgTokens').textContent = 
    `• Avg ${formatNumber(avgTokens)} per message`;
  
  document.getElementById('peakHour').textContent = '• Peak hour: --';
  
  // Update badge mode selector
  const badgeModeSelect = document.getElementById('badgeMode');
  badgeModeSelect.value = settings.badgeMode;
  
  const customInput = document.getElementById('customBadgeText');
  if (settings.badgeMode === 'custom') {
    customInput.style.display = 'block';
    customInput.value = settings.badgeCustomText || '';
  } else {
    customInput.style.display = 'none';
  }
}

/**
 * Update reset timer
 */
function updateResetTimer() {
  if (!currentStats) return;
  
  const timer = document.getElementById('resetTimer');
  const timeLeft = formatTimeUntilReset(currentStats.nextReset);
  timer.textContent = timeLeft;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await loadData();
  });
  
  // Settings buttons
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('settingsBtn2').addEventListener('click', openSettings);
  
  // Analytics button
  document.getElementById('analyticsBtn').addEventListener('click', () => {
    // TODO: Open analytics page
    alert('Analytics page coming soon!');
  });
  
  // Badge mode selector
  document.getElementById('badgeMode').addEventListener('change', async (e) => {
    const mode = e.target.value;
    settings.badgeMode = mode;
    
    const customInput = document.getElementById('customBadgeText');
    if (mode === 'custom') {
      customInput.style.display = 'block';
    } else {
      customInput.style.display = 'none';
    }
    
    await saveBadgeSettings();
  });
  
  // Custom badge text input
  document.getElementById('customBadgeText').addEventListener('input', async (e) => {
    settings.badgeCustomText = e.target.value;
    await saveBadgeSettings();
  });
}

/**
 * Save badge settings
 */
async function saveBadgeSettings() {
  try {
    await chrome.runtime.sendMessage({ 
      type: 'UPDATE_SETTINGS',
      settings: settings
    });
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Open settings page
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * Start timers
 */
function startTimers() {
  // Update reset timer every second
  setInterval(updateResetTimer, 1000);
  
  // Refresh data every 30 seconds
  setInterval(loadData, 30000);
}

/**
 * Utility functions
 */
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

function formatCurrency(amount) {
  return '$' + amount.toFixed(2);
}

function getUsageColor(percentage) {
  if (percentage >= 95) return '#EF4444';
  if (percentage >= 80) return '#F59E0B';
  if (percentage >= 50) return '#FBBF24';
  return '#10B981';
}

function formatTimeUntilReset(resetTimestamp) {
  const now = Date.now();
  const diff = resetTimestamp - now;
  
  if (diff <= 0) return 'Resetting...';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

function showError(message) {
  alert(message);
}
