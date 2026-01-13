/**
 * Claude Usage Pro - Popup Script
 */

// Elements
const elements = {
  // Main stats
  mainProgress: document.getElementById('mainProgress'),
  usedTokens: document.getElementById('usedTokens'),
  totalTokens: document.getElementById('totalTokens'),
  usagePercent: document.getElementById('usagePercent'),
  resetTime: document.getElementById('resetTime'),
  messagesCount: document.getElementById('messagesCount'),
  avgTokens: document.getElementById('avgTokens'),
  remaining: document.getElementById('remaining'),
  
  // Model breakdown
  sonnetTokens: document.getElementById('sonnetTokens'),
  sonnetProgress: document.getElementById('sonnetProgress'),
  opusTokens: document.getElementById('opusTokens'),
  opusProgress: document.getElementById('opusProgress'),
  haikuTokens: document.getElementById('haikuTokens'),
  haikuProgress: document.getElementById('haikuProgress'),
  
  // Settings
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  quotaInput: document.getElementById('quotaInput'),
  notificationsToggle: document.getElementById('notificationsToggle'),
  saveSettings: document.getElementById('saveSettings'),
  resetUsage: document.getElementById('resetUsage')
};

// Model multipliers
const MODEL_MULTIPLIERS = {
  'claude-sonnet-4': 1.0,
  'claude-haiku-4': 0.2,
  'claude-opus-4': 5.0
};

/**
 * Format large numbers
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

/**
 * Format time remaining
 */
function formatTimeRemaining(ms) {
  if (ms <= 0) return 'Now!';
  
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
 * Calculate weighted total
 */
function getWeightedTotal(modelUsage) {
  let total = 0;
  for (const [model, tokens] of Object.entries(modelUsage || {})) {
    const mult = MODEL_MULTIPLIERS[model] || 1.0;
    total += tokens * mult;
  }
  return Math.round(total);
}

/**
 * Get color based on percentage
 */
function getColorClass(percentage) {
  if (percentage >= 95) return 'danger';
  if (percentage >= 80) return 'warning';
  return '';
}

/**
 * Update the UI with usage data
 */
function updateUI(usageData) {
  if (!usageData) return;
  
  const modelUsage = usageData.modelUsage || {};
  const weightedTotal = getWeightedTotal(modelUsage);
  const cap = usageData.usageCap || 45000000;
  const percentage = (weightedTotal / cap) * 100;
  const remaining = Math.max(0, cap - weightedTotal);
  const timeUntilReset = usageData.resetTimestamp ? usageData.resetTimestamp - Date.now() : 0;
  
  // Main progress
  elements.mainProgress.style.width = `${Math.min(percentage, 100)}%`;
  elements.mainProgress.className = `progress-bar ${getColorClass(percentage)}`;
  
  elements.usedTokens.textContent = formatNumber(weightedTotal);
  elements.totalTokens.textContent = formatNumber(cap);
  elements.usagePercent.textContent = `${percentage.toFixed(1)}%`;
  elements.usagePercent.style.color = percentage >= 95 ? '#de2929' : percentage >= 80 ? '#f59e0b' : '#2c84db';
  
  // Reset time
  elements.resetTime.textContent = `Reset: ${formatTimeRemaining(timeUntilReset)}`;
  
  // Quick stats
  elements.messagesCount.textContent = usageData.messagesCount || 0;
  elements.remaining.textContent = formatNumber(remaining);
  
  if (usageData.messagesCount > 0) {
    const avg = Math.round(usageData.tokensUsed / usageData.messagesCount);
    elements.avgTokens.textContent = formatNumber(avg);
  } else {
    elements.avgTokens.textContent = '--';
  }
  
  // Model breakdown
  const sonnet = modelUsage['claude-sonnet-4'] || 0;
  const opus = modelUsage['claude-opus-4'] || 0;
  const haiku = modelUsage['claude-haiku-4'] || 0;
  
  // Sonnet (1x multiplier)
  elements.sonnetTokens.textContent = formatNumber(sonnet);
  elements.sonnetProgress.style.width = `${Math.min((sonnet / cap) * 100, 100)}%`;
  
  // Opus (5x multiplier)
  const opusWeighted = opus * 5;
  elements.opusTokens.textContent = `${formatNumber(opus)} (${formatNumber(opusWeighted)} weighted)`;
  elements.opusProgress.style.width = `${Math.min((opusWeighted / cap) * 100, 100)}%`;
  
  // Haiku (0.2x multiplier)
  const haikuWeighted = opus * 0.2;
  elements.haikuTokens.textContent = `${formatNumber(haiku)} (${formatNumber(haikuWeighted)} weighted)`;
  elements.haikuProgress.style.width = `${Math.min((haikuWeighted / cap) * 100, 100)}%`;
}

/**
 * Load and display data
 */
async function loadData() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_USAGE_DATA' });
    if (response?.usageData) {
      updateUI(response.usageData);
    }
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

/**
 * Load settings
 */
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response?.settings) {
      elements.quotaInput.value = response.settings.quota || 45000000;
      elements.notificationsToggle.checked = response.settings.notifications !== false;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Save settings
 */
async function saveSettings() {
  try {
    const settings = {
      quota: parseInt(elements.quotaInput.value, 10),
      notifications: elements.notificationsToggle.checked
    };
    
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    
    // Hide settings panel and refresh data
    elements.settingsPanel.classList.add('hidden');
    await loadData();
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Reset usage
 */
async function resetUsage() {
  if (!confirm('Are you sure you want to reset your usage statistics? This cannot be undone.')) {
    return;
  }
  
  try {
    await chrome.runtime.sendMessage({ type: 'RESET_USAGE' });
    await loadData();
    elements.settingsPanel.classList.add('hidden');
  } catch (error) {
    console.error('Error resetting usage:', error);
  }
}

// Event listeners
elements.settingsBtn.addEventListener('click', () => {
  elements.settingsPanel.classList.toggle('hidden');
  if (!elements.settingsPanel.classList.contains('hidden')) {
    loadSettings();
  }
});

elements.saveSettings.addEventListener('click', saveSettings);
elements.resetUsage.addEventListener('click', resetUsage);

// Initial load
loadData();

// Auto-refresh every 5 seconds
setInterval(loadData, 5000);
