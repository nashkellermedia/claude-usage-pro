/**
 * Claude Usage Pro - Popup Script
 */

const elements = {
  // Sync
  syncBtn: document.getElementById('syncBtn'),
  syncStatus: document.getElementById('syncStatus'),
  syncIndicator: document.getElementById('syncIndicator'),
  
  // Main usage
  progressCircle: document.getElementById('progressCircle'),
  usagePercent: document.getElementById('usagePercent'),
  usedTokens: document.getElementById('usedTokens'),
  remaining: document.getElementById('remaining'),
  totalTokens: document.getElementById('totalTokens'),
  resetTime: document.getElementById('resetTime'),
  
  // Stats
  messagesCount: document.getElementById('messagesCount'),
  avgTokens: document.getElementById('avgTokens'),
  timeToReset: document.getElementById('timeToReset'),
  
  // Model bars
  sonnetBar: document.getElementById('sonnetBar'),
  sonnetTokens: document.getElementById('sonnetTokens'),
  opusBar: document.getElementById('opusBar'),
  opusTokens: document.getElementById('opusTokens'),
  haikuBar: document.getElementById('haikuBar'),
  haikuTokens: document.getElementById('haikuTokens'),
  
  // Settings
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  closeSettings: document.getElementById('closeSettings'),
  quotaSelect: document.getElementById('quotaSelect'),
  customQuota: document.getElementById('customQuota'),
  syncInterval: document.getElementById('syncInterval'),
  notificationsToggle: document.getElementById('notificationsToggle'),
  firebaseToggle: document.getElementById('firebaseToggle'),
  firebaseConfig: document.getElementById('firebaseConfig'),
  saveSettings: document.getElementById('saveSettings'),
  resetUsage: document.getElementById('resetUsage')
};

const MODEL_MULTIPLIERS = {
  'claude-sonnet-4': 1.0,
  'claude-haiku-4': 0.2,
  'claude-opus-4': 5.0
};

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

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

function getWeightedTotal(modelUsage) {
  let total = 0;
  for (const [model, tokens] of Object.entries(modelUsage || {})) {
    total += tokens * (MODEL_MULTIPLIERS[model] || 1.0);
  }
  return Math.round(total);
}

function updateUI(usageData) {
  if (!usageData) return;
  
  const modelUsage = usageData.modelUsage || {};
  const weightedTotal = getWeightedTotal(modelUsage);
  const cap = usageData.usageCap || 45000000;
  
  // Use synced percentage if available
  let percentage;
  if (usageData.syncedUsagePercent !== null && usageData.lastSynced) {
    percentage = usageData.syncedUsagePercent;
  } else {
    percentage = (weightedTotal / cap) * 100;
  }
  
  const remaining = Math.max(0, cap - weightedTotal);
  const timeUntilReset = usageData.resetTimestamp ? usageData.resetTimestamp - Date.now() : 0;
  
  // Update circular progress
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
  elements.progressCircle.style.strokeDashoffset = offset;
  
  // Color based on percentage
  let color = '#2c84db';
  if (percentage >= 95) color = '#ef4444';
  else if (percentage >= 80) color = '#f59e0b';
  elements.progressCircle.style.stroke = color;
  
  // Update text
  elements.usagePercent.textContent = percentage.toFixed(1) + '%';
  elements.usedTokens.textContent = formatNumber(weightedTotal);
  elements.remaining.textContent = formatNumber(remaining);
  elements.totalTokens.textContent = formatNumber(cap);
  
  // Reset time
  elements.resetTime.textContent = 'Reset: ' + formatTimeRemaining(timeUntilReset);
  elements.timeToReset.textContent = formatTimeRemaining(timeUntilReset);
  
  // Stats
  elements.messagesCount.textContent = usageData.messagesCount || 0;
  if (usageData.messagesCount > 0) {
    elements.avgTokens.textContent = formatNumber(Math.round(usageData.tokensUsed / usageData.messagesCount));
  }
  
  // Sync status
  if (usageData.lastSynced) {
    const ago = Math.round((Date.now() - usageData.lastSynced) / 60000);
    elements.syncStatus.textContent = ago < 1 ? 'Just synced' : `Synced ${ago}m ago`;
  }
  
  // Model breakdown
  const sonnet = modelUsage['claude-sonnet-4'] || 0;
  const opus = modelUsage['claude-opus-4'] || 0;
  const haiku = modelUsage['claude-haiku-4'] || 0;
  
  const maxModel = Math.max(sonnet, opus * 5, haiku * 0.2, 1);
  
  elements.sonnetBar.style.width = ((sonnet / cap) * 100) + '%';
  elements.sonnetTokens.textContent = formatNumber(sonnet) + ' tokens';
  
  elements.opusBar.style.width = ((opus * 5 / cap) * 100) + '%';
  elements.opusTokens.textContent = `${formatNumber(opus)} (${formatNumber(opus * 5)} weighted)`;
  
  elements.haikuBar.style.width = ((haiku * 0.2 / cap) * 100) + '%';
  elements.haikuTokens.textContent = `${formatNumber(haiku)} (${formatNumber(haiku * 0.2)} weighted)`;
}

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

async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response?.settings) {
      const s = response.settings;
      
      // Quota
      const quotaVal = s.quota || 45000000;
      const quotaOptions = ['45000000', '90000000', '135000000'];
      if (quotaOptions.includes(quotaVal.toString())) {
        elements.quotaSelect.value = quotaVal;
      } else {
        elements.quotaSelect.value = 'custom';
        elements.customQuota.classList.remove('hidden');
        elements.customQuota.value = quotaVal;
      }
      
      elements.syncInterval.value = s.syncInterval || 5;
      elements.notificationsToggle.checked = s.notifications !== false;
      elements.firebaseToggle.checked = s.firebaseEnabled || false;
      
      if (s.firebaseEnabled) {
        elements.firebaseConfig.classList.remove('hidden');
      }
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function saveSettings() {
  let quota;
  if (elements.quotaSelect.value === 'custom') {
    quota = parseInt(elements.customQuota.value, 10);
  } else {
    quota = parseInt(elements.quotaSelect.value, 10);
  }
  
  const settings = {
    quota,
    syncInterval: parseInt(elements.syncInterval.value, 10),
    notifications: elements.notificationsToggle.checked,
    firebaseEnabled: elements.firebaseToggle.checked
  };
  
  try {
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    elements.settingsPanel.classList.add('hidden');
    await loadData();
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

async function triggerSync() {
  elements.syncIndicator.classList.add('syncing');
  elements.syncStatus.textContent = 'Syncing...';
  
  try {
    await chrome.runtime.sendMessage({ type: 'TRIGGER_SYNC' });
    setTimeout(loadData, 1500);
  } catch (error) {
    console.error('Sync error:', error);
  }
  
  setTimeout(() => {
    elements.syncIndicator.classList.remove('syncing');
  }, 2000);
}

async function resetUsage() {
  if (!confirm('Reset all usage data? This cannot be undone.')) return;
  
  try {
    await chrome.runtime.sendMessage({ type: 'RESET_USAGE' });
    await loadData();
    elements.settingsPanel.classList.add('hidden');
  } catch (error) {
    console.error('Error resetting:', error);
  }
}

// Event listeners
elements.settingsBtn.addEventListener('click', () => {
  elements.settingsPanel.classList.toggle('hidden');
  if (!elements.settingsPanel.classList.contains('hidden')) {
    loadSettings();
  }
});

elements.closeSettings.addEventListener('click', () => {
  elements.settingsPanel.classList.add('hidden');
});

elements.syncBtn.addEventListener('click', triggerSync);
elements.saveSettings.addEventListener('click', saveSettings);
elements.resetUsage.addEventListener('click', resetUsage);

elements.quotaSelect.addEventListener('change', () => {
  if (elements.quotaSelect.value === 'custom') {
    elements.customQuota.classList.remove('hidden');
  } else {
    elements.customQuota.classList.add('hidden');
  }
});

elements.firebaseToggle.addEventListener('change', () => {
  if (elements.firebaseToggle.checked) {
    elements.firebaseConfig.classList.remove('hidden');
  } else {
    elements.firebaseConfig.classList.add('hidden');
  }
});

// Initialize
loadData();
setInterval(loadData, 5000);
