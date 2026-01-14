/**
 * Claude Usage Pro - Popup
 */

// DOM Elements
const els = {
  refreshBtn: document.getElementById('refreshBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  closeSettings: document.getElementById('closeSettings'),
  
  sessionBar: document.getElementById('sessionBar'),
  sessionPercent: document.getElementById('sessionPercent'),
  sessionMeta: document.getElementById('sessionMeta'),
  
  weeklyAllBar: document.getElementById('weeklyAllBar'),
  weeklyAllPercent: document.getElementById('weeklyAllPercent'),
  weeklyAllMeta: document.getElementById('weeklyAllMeta'),
  
  weeklySonnetBar: document.getElementById('weeklySonnetBar'),
  weeklySonnetPercent: document.getElementById('weeklySonnetPercent'),
  weeklySonnetMeta: document.getElementById('weeklySonnetMeta'),
  
  currentModel: document.getElementById('currentModel'),
  
  refreshInterval: document.getElementById('refreshInterval'),
  showBadge: document.getElementById('showBadge'),
  
  firebaseApiKey: document.getElementById('firebaseApiKey'),
  firebaseProjectId: document.getElementById('firebaseProjectId'),
  firebaseAppId: document.getElementById('firebaseAppId'),
  firebaseStatus: document.getElementById('firebaseStatus'),
  saveFirebase: document.getElementById('saveFirebase'),
  saveSettings: document.getElementById('saveSettings')
};

function updateUsageBar(barEl, percentEl, percent) {
  if (!barEl || !percentEl) return;
  
  barEl.style.width = Math.min(percent, 100) + '%';
  percentEl.textContent = percent + '%';
  
  // Remove old classes
  barEl.classList.remove('warning', 'danger');
  percentEl.classList.remove('warning', 'danger');
  
  if (percent >= 90) {
    barEl.classList.add('danger');
    percentEl.classList.add('danger');
  } else if (percent >= 70) {
    barEl.classList.add('warning');
    percentEl.classList.add('warning');
  }
}

function updateUI(usageData) {
  if (!usageData) return;
  
  // Current Session
  if (usageData.currentSession) {
    updateUsageBar(els.sessionBar, els.sessionPercent, usageData.currentSession.percent || 0);
    if (usageData.currentSession.resetsIn) {
      els.sessionMeta.textContent = `Resets in ${usageData.currentSession.resetsIn}`;
    }
  }
  
  // Weekly All Models
  if (usageData.weeklyAllModels) {
    updateUsageBar(els.weeklyAllBar, els.weeklyAllPercent, usageData.weeklyAllModels.percent || 0);
    if (usageData.weeklyAllModels.resetsAt) {
      els.weeklyAllMeta.textContent = `Resets ${usageData.weeklyAllModels.resetsAt}`;
    }
  }
  
  // Weekly Sonnet
  if (usageData.weeklySonnet) {
    updateUsageBar(els.weeklySonnetBar, els.weeklySonnetPercent, usageData.weeklySonnet.percent || 0);
    if (usageData.weeklySonnet.resetsIn) {
      els.weeklySonnetMeta.textContent = `Resets in ${usageData.weeklySonnet.resetsIn}`;
    }
  }
  
  // Fallback: Convert token-based data to percentage
  if (!usageData.currentSession && usageData.modelUsage) {
    const cap = usageData.usageCap || 45000000;
    let total = 0;
    const mu = usageData.modelUsage;
    total += (mu['claude-sonnet-4'] || 0);
    total += (mu['claude-opus-4'] || 0) * 5;
    total += (mu['claude-haiku-4'] || 0) * 0.2;
    
    const percent = Math.round((total / cap) * 100);
    updateUsageBar(els.sessionBar, els.sessionPercent, percent);
    
    if (usageData.resetTimestamp) {
      const ms = usageData.resetTimestamp - Date.now();
      if (ms > 0) {
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        els.sessionMeta.textContent = `Resets in ${h}h ${m}m`;
      }
    }
  }
  
  // Current Model
  if (usageData.currentModel) {
    const model = usageData.currentModel.toLowerCase();
    els.currentModel.classList.remove('opus', 'haiku');
    
    if (model.includes('opus')) {
      els.currentModel.textContent = 'Opus 4.5';
      els.currentModel.classList.add('opus');
    } else if (model.includes('haiku')) {
      els.currentModel.textContent = 'Haiku 4.5';
      els.currentModel.classList.add('haiku');
    } else {
      els.currentModel.textContent = 'Sonnet 4.5';
    }
  }
}

async function loadUsageData() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_USAGE_DATA' });
    if (response?.usageData) {
      updateUI(response.usageData);
    }
  } catch (e) {
    console.error('Load usage error:', e);
  }
}

async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = response?.settings || {};
    
    els.refreshInterval.value = settings.refreshInterval || '5';
    els.showBadge.checked = settings.showBadge !== false;
    
    // Firebase config
    if (settings.firebase) {
      els.firebaseApiKey.value = settings.firebase.apiKey || '';
      els.firebaseProjectId.value = settings.firebase.projectId || '';
      els.firebaseAppId.value = settings.firebase.appId || '';
      
      if (settings.firebase.apiKey) {
        els.firebaseStatus.textContent = 'Configured ✓';
        els.firebaseStatus.classList.add('connected');
      }
    }
  } catch (e) {
    console.error('Load settings error:', e);
  }
}

async function saveSettings() {
  try {
    const settings = {
      refreshInterval: els.refreshInterval.value,
      showBadge: els.showBadge.checked
    };
    
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    els.settingsPanel.classList.add('hidden');
  } catch (e) {
    console.error('Save settings error:', e);
  }
}

async function saveFirebaseConfig() {
  try {
    const firebase = {
      apiKey: els.firebaseApiKey.value.trim(),
      projectId: els.firebaseProjectId.value.trim(),
      appId: els.firebaseAppId.value.trim()
    };
    
    if (firebase.apiKey && firebase.projectId) {
      await chrome.runtime.sendMessage({ 
        type: 'SAVE_SETTINGS', 
        settings: { firebase } 
      });
      
      els.firebaseStatus.textContent = 'Configured ✓';
      els.firebaseStatus.classList.add('connected');
    } else {
      els.firebaseStatus.textContent = 'Please fill in all fields';
      els.firebaseStatus.classList.remove('connected');
    }
  } catch (e) {
    console.error('Save Firebase error:', e);
    els.firebaseStatus.textContent = 'Error saving config';
  }
}

async function triggerRefresh() {
  els.refreshBtn.textContent = '⏳';
  
  try {
    await chrome.runtime.sendMessage({ type: 'TRIGGER_SYNC' });
    setTimeout(loadUsageData, 1500);
  } catch (e) {
    console.error('Refresh error:', e);
  }
  
  setTimeout(() => {
    els.refreshBtn.textContent = '🔄';
  }, 2000);
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

els.refreshBtn.addEventListener('click', triggerRefresh);
els.saveSettings.addEventListener('click', saveSettings);
els.saveFirebase.addEventListener('click', saveFirebaseConfig);

// Initialize
loadUsageData();
loadSettings();

// Auto-refresh every 5 seconds
setInterval(loadUsageData, 5000);
