/**
 * Claude Usage Pro - Popup
 */

const els = {
  refreshBtn: document.getElementById('refreshBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  closeSettings: document.getElementById('closeSettings'),
  viewUsageLink: document.getElementById('viewUsageLink'),
  
  sessionPercent: document.getElementById('sessionPercent'),
  sessionBar: document.getElementById('sessionBar'),
  sessionMeta: document.getElementById('sessionMeta'),
  
  weeklyAllPercent: document.getElementById('weeklyAllPercent'),
  weeklyAllBar: document.getElementById('weeklyAllBar'),
  weeklyAllMeta: document.getElementById('weeklyAllMeta'),
  
  weeklySonnetPercent: document.getElementById('weeklySonnetPercent'),
  weeklySonnetBar: document.getElementById('weeklySonnetBar'),
  weeklySonnetMeta: document.getElementById('weeklySonnetMeta'),
  
  currentModel: document.getElementById('currentModel'),
  
  // Settings
  badgeDisplay: document.getElementById('badgeDisplay'),
  showSidebar: document.getElementById('showSidebar'),
  showChatOverlay: document.getElementById('showChatOverlay'),
  showTopBar: document.getElementById('showTopBar'),
  enableVoice: document.getElementById('enableVoice'),
  
  firebaseHelp: document.getElementById('firebaseHelp'),
  firebaseInstructions: document.getElementById('firebaseInstructions'),
  firebaseApiKey: document.getElementById('firebaseApiKey'),
  firebaseProjectId: document.getElementById('firebaseProjectId'),
  firebaseAppId: document.getElementById('firebaseAppId'),
  firebaseStatus: document.getElementById('firebaseStatus'),
  saveFirebase: document.getElementById('saveFirebase'),
  saveSettings: document.getElementById('saveSettings')
};

function updateUsageDisplay(el, barEl, percent) {
  if (!el || !barEl) return;
  
  el.textContent = percent + '%';
  barEl.style.width = Math.min(percent, 100) + '%';
  
  el.classList.remove('warning', 'danger');
  barEl.classList.remove('warning', 'danger');
  
  if (percent >= 90) {
    el.classList.add('danger');
    barEl.classList.add('danger');
  } else if (percent >= 70) {
    el.classList.add('warning');
    barEl.classList.add('warning');
  }
}

function updateUI(usageData) {
  if (!usageData) return;
  
  // Current Session
  if (usageData.currentSession) {
    updateUsageDisplay(els.sessionPercent, els.sessionBar, usageData.currentSession.percent || 0);
    if (usageData.currentSession.resetsIn) {
      els.sessionMeta.textContent = `Resets in ${usageData.currentSession.resetsIn}`;
    }
  }
  
  // Weekly All Models
  if (usageData.weeklyAllModels) {
    updateUsageDisplay(els.weeklyAllPercent, els.weeklyAllBar, usageData.weeklyAllModels.percent || 0);
    if (usageData.weeklyAllModels.resetsAt) {
      els.weeklyAllMeta.textContent = `Resets ${usageData.weeklyAllModels.resetsAt}`;
    }
  }
  
  // Weekly Sonnet
  if (usageData.weeklySonnet) {
    updateUsageDisplay(els.weeklySonnetPercent, els.weeklySonnetBar, usageData.weeklySonnet.percent || 0);
    if (usageData.weeklySonnet.resetsIn) {
      els.weeklySonnetMeta.textContent = `Resets in ${usageData.weeklySonnet.resetsIn}`;
    }
  }
  
  // Current Model
  if (usageData.currentModel) {
    const model = (usageData.currentModel || '').toLowerCase();
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
    console.error('[CUP Popup] Load error:', e);
  }
}

async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = response?.settings || {};
    
    // Badge display
    els.badgeDisplay.value = settings.badgeDisplay || 'session';
    
    // UI toggles
    els.showSidebar.checked = settings.showSidebar !== false;
    els.showChatOverlay.checked = settings.showChatOverlay !== false;
    els.showTopBar.checked = settings.showTopBar !== false;
    els.enableVoice.checked = settings.enableVoice === true;
    
    // Firebase
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
    console.error('[CUP Popup] Settings error:', e);
  }
}

async function saveSettings() {
  const settings = {
    badgeDisplay: els.badgeDisplay.value,
    showSidebar: els.showSidebar.checked,
    showChatOverlay: els.showChatOverlay.checked,
    showTopBar: els.showTopBar.checked,
    enableVoice: els.enableVoice.checked
  };
  
  await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
  
  // Notify tabs to update UI visibility
  chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings }).catch(() => {});
    });
  });
  
  els.settingsPanel.classList.add('hidden');
}

async function saveFirebaseConfig() {
  const firebase = {
    apiKey: els.firebaseApiKey.value.trim(),
    projectId: els.firebaseProjectId.value.trim(),
    appId: els.firebaseAppId.value.trim()
  };
  
  if (firebase.apiKey && firebase.projectId) {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = response?.settings || {};
    settings.firebase = firebase;
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    
    els.firebaseStatus.textContent = 'Configured ✓';
    els.firebaseStatus.classList.add('connected');
  } else {
    els.firebaseStatus.textContent = 'Please fill in API Key and Project ID';
    els.firebaseStatus.classList.remove('connected');
  }
}

async function triggerRefresh() {
  els.refreshBtn.textContent = '⏳';
  await chrome.runtime.sendMessage({ type: 'TRIGGER_SYNC' });
  setTimeout(loadUsageData, 2000);
  setTimeout(() => { els.refreshBtn.textContent = '🔄'; }, 2000);
}

// Event Listeners
els.settingsBtn.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
  if (!els.settingsPanel.classList.contains('hidden')) loadSettings();
});

els.closeSettings.addEventListener('click', () => els.settingsPanel.classList.add('hidden'));
els.refreshBtn.addEventListener('click', triggerRefresh);
els.saveSettings.addEventListener('click', saveSettings);
els.saveFirebase.addEventListener('click', saveFirebaseConfig);

els.firebaseHelp.addEventListener('click', (e) => {
  e.preventDefault();
  els.firebaseInstructions.classList.toggle('hidden');
});

els.viewUsageLink.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://claude.ai/settings/usage' });
});

// Initialize
loadUsageData();
loadSettings();
setInterval(loadUsageData, 5000);
