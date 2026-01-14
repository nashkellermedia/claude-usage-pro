/**
 * Claude Usage Pro - Popup Dashboard
 */

const TIPS = [
  "Use Haiku for simple tasks to save 80% on tokens!",
  "Long conversations use more context. Start fresh for complex tasks.",
  "Opus costs 5x more than Sonnet - use wisely!",
  "Your usage resets daily at midnight UTC.",
  "Cached prompts can reduce token usage significantly.",
  "Keep system prompts concise to save on every message.",
  "Breaking tasks into smaller prompts can be more efficient.",
];

let currentTipIndex = 0;

// DOM Elements
const els = {
  syncBtn: document.getElementById('syncBtn'),
  syncStatus: document.getElementById('syncStatus'),
  syncIndicator: document.getElementById('syncIndicator'),
  progressCircle: document.getElementById('progressCircle'),
  usagePercent: document.getElementById('usagePercent'),
  usedTokens: document.getElementById('usedTokens'),
  remainingTokens: document.getElementById('remainingTokens'),
  resetTime: document.getElementById('resetTime'),
  messagesCount: document.getElementById('messagesCount'),
  avgPerMsg: document.getElementById('avgPerMsg'),
  msgsRemaining: document.getElementById('msgsRemaining'),
  sonnetBar: document.getElementById('sonnetBar'),
  sonnetTokens: document.getElementById('sonnetTokens'),
  sonnetWeighted: document.getElementById('sonnetWeighted'),
  opusBar: document.getElementById('opusBar'),
  opusTokens: document.getElementById('opusTokens'),
  opusWeighted: document.getElementById('opusWeighted'),
  haikuBar: document.getElementById('haikuBar'),
  haikuTokens: document.getElementById('haikuTokens'),
  haikuWeighted: document.getElementById('haikuWeighted'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  closeSettings: document.getElementById('closeSettings'),
  quotaSelect: document.getElementById('quotaSelect'),
  customQuota: document.getElementById('customQuota'),
  syncInterval: document.getElementById('syncInterval'),
  showBadge: document.getElementById('showBadge'),
  notifications: document.getElementById('notifications'),
  showTips: document.getElementById('showTips'),
  saveSettings: document.getElementById('saveSettings'),
  resetData: document.getElementById('resetData'),
  tipsCard: document.getElementById('tipsCard'),
  tipText: document.getElementById('tipText'),
  closeTips: document.getElementById('closeTips'),
  planBadge: document.getElementById('planBadge')
};

const MULTIPLIERS = {
  'claude-sonnet-4': 1.0,
  'claude-haiku-4': 0.2,
  'claude-opus-4': 5.0
};

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function formatTime(ms) {
  if (ms <= 0) return 'Now!';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function updateUI(usageData) {
  if (!usageData) return;
  
  const modelUsage = usageData.modelUsage || {};
  let weightedTotal = 0;
  
  for (const [model, tokens] of Object.entries(modelUsage)) {
    weightedTotal += tokens * (MULTIPLIERS[model] || 1.0);
  }
  
  const cap = usageData.usageCap || 45000000;
  const percentage = (weightedTotal / cap) * 100;
  const remaining = Math.max(0, cap - weightedTotal);
  const msToReset = usageData.resetTimestamp ? usageData.resetTimestamp - Date.now() : 0;
  
  // Update circular progress
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
  els.progressCircle.style.strokeDashoffset = offset;
  
  // Update color based on usage
  if (percentage >= 90) {
    els.progressCircle.style.stroke = '#ef4444';
  } else if (percentage >= 70) {
    els.progressCircle.style.stroke = '#f59e0b';
  } else {
    els.progressCircle.style.stroke = 'url(#progressGradient)';
  }
  
  // Update text values
  els.usagePercent.textContent = percentage.toFixed(1) + '%';
  els.usedTokens.textContent = formatNumber(weightedTotal);
  els.remainingTokens.textContent = formatNumber(remaining);
  els.resetTime.textContent = formatTime(msToReset);
  
  // Stats
  els.messagesCount.textContent = usageData.messagesCount || 0;
  
  if (usageData.messagesCount > 0) {
    const avg = Math.round(weightedTotal / usageData.messagesCount);
    els.avgPerMsg.textContent = formatNumber(avg);
    
    const msgsLeft = Math.floor(remaining / avg);
    els.msgsRemaining.textContent = '~' + msgsLeft;
  }
  
  // Model breakdown
  const sonnet = modelUsage['claude-sonnet-4'] || 0;
  const opus = modelUsage['claude-opus-4'] || 0;
  const haiku = modelUsage['claude-haiku-4'] || 0;
  
  const sonnetW = sonnet * 1.0;
  const opusW = opus * 5.0;
  const haikuW = haiku * 0.2;
  
  // Calculate bar widths relative to cap
  els.sonnetBar.style.width = Math.min((sonnetW / cap) * 100, 100) + '%';
  els.opusBar.style.width = Math.min((opusW / cap) * 100, 100) + '%';
  els.haikuBar.style.width = Math.min((haikuW / cap) * 100, 100) + '%';
  
  els.sonnetTokens.textContent = formatNumber(sonnet) + ' tokens';
  els.sonnetWeighted.textContent = formatNumber(sonnetW) + ' weighted';
  
  els.opusTokens.textContent = formatNumber(opus) + ' tokens';
  els.opusWeighted.textContent = formatNumber(opusW) + ' weighted';
  
  els.haikuTokens.textContent = formatNumber(haiku) + ' tokens';
  els.haikuWeighted.textContent = formatNumber(haikuW) + ' weighted';
  
  // Sync status
  if (usageData.lastSynced) {
    const ago = Math.round((Date.now() - usageData.lastSynced) / 60000);
    els.syncStatus.textContent = ago < 1 ? 'Synced just now' : `Synced ${ago}m ago`;
  }
  
  // Plan badge based on quota
  if (cap >= 135000000) {
    els.planBadge.textContent = 'MAX 5X';
  } else if (cap >= 90000000) {
    els.planBadge.textContent = 'MAX';
  } else {
    els.planBadge.textContent = 'PRO';
  }
}

async function loadData() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_USAGE_DATA' });
    if (response?.usageData) {
      updateUI(response.usageData);
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
}

async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response?.settings) {
      const s = response.settings;
      
      const quotaVal = s.quota || 45000000;
      if (['45000000', '90000000', '135000000'].includes(quotaVal.toString())) {
        els.quotaSelect.value = quotaVal;
      } else {
        els.quotaSelect.value = 'custom';
        els.customQuota.classList.remove('hidden');
        els.customQuota.value = quotaVal;
      }
      
      els.syncInterval.value = s.syncInterval || 5;
      els.showBadge.checked = s.showBadge !== false;
      els.notifications.checked = s.notifications !== false;
      els.showTips.checked = s.showTips !== false;
      
      if (!s.showTips) {
        els.tipsCard.classList.add('hidden');
      }
    }
  } catch (e) {
    console.error('Error loading settings:', e);
  }
}

async function saveSettings() {
  let quota;
  if (els.quotaSelect.value === 'custom') {
    quota = parseInt(els.customQuota.value, 10);
  } else {
    quota = parseInt(els.quotaSelect.value, 10);
  }
  
  const settings = {
    quota,
    syncInterval: parseInt(els.syncInterval.value, 10),
    showBadge: els.showBadge.checked,
    notifications: els.notifications.checked,
    showTips: els.showTips.checked
  };
  
  try {
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    els.settingsPanel.classList.add('hidden');
    await loadData();
  } catch (e) {
    console.error('Error saving settings:', e);
  }
}

async function triggerSync() {
  els.syncIndicator.classList.add('syncing');
  els.syncStatus.textContent = 'Syncing...';
  
  try {
    await chrome.runtime.sendMessage({ type: 'TRIGGER_SYNC' });
    setTimeout(loadData, 1500);
  } catch (e) {
    els.syncIndicator.classList.add('error');
  }
  
  setTimeout(() => {
    els.syncIndicator.classList.remove('syncing');
  }, 2000);
}

async function resetData() {
  if (!confirm('Reset all usage data? This cannot be undone.')) return;
  
  try {
    await chrome.runtime.sendMessage({ type: 'RESET_USAGE' });
    await loadData();
    els.settingsPanel.classList.add('hidden');
  } catch (e) {
    console.error('Error resetting:', e);
  }
}

function rotateTip() {
  currentTipIndex = (currentTipIndex + 1) % TIPS.length;
  els.tipText.textContent = TIPS[currentTipIndex];
}

// Event Listeners
els.settingsBtn.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
  if (!els.settingsPanel.classList.contains('hidden')) {
    loadSettings();
  }
});

els.closeSettings.addEventListener('click', () => {
  els.settingsPanel.classList.add('hidden');
});

els.syncBtn.addEventListener('click', triggerSync);
els.saveSettings.addEventListener('click', saveSettings);
els.resetData.addEventListener('click', resetData);

els.quotaSelect.addEventListener('change', () => {
  if (els.quotaSelect.value === 'custom') {
    els.customQuota.classList.remove('hidden');
  } else {
    els.customQuota.classList.add('hidden');
  }
});

els.closeTips.addEventListener('click', () => {
  els.tipsCard.classList.add('hidden');
});

// Initialize
loadData();
loadSettings();

// Refresh every 5 seconds
setInterval(loadData, 5000);

// Rotate tips every 10 seconds
setInterval(rotateTip, 10000);
