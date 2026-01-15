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
  
  // Settings
  badgeDisplay: document.getElementById('badgeDisplay'),
  showSidebar: document.getElementById('showSidebar'),
  showChatOverlay: document.getElementById('showChatOverlay'),
  enableVoice: document.getElementById('enableVoice'),
  firebaseUrl: document.getElementById('firebaseUrl'),
  firebaseHelp: document.getElementById('firebaseHelp'),
  firebaseInstructions: document.getElementById('firebaseInstructions'),
  firebaseStatus: document.getElementById('firebaseStatus'),
  firebaseStatusDot: document.getElementById('firebaseStatusDot'),
  firebaseStatusText: document.getElementById('firebaseStatusText'),
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
    
    els.badgeDisplay.value = settings.badgeDisplay || 'session';
    els.showSidebar.checked = settings.showSidebar !== false;
    els.showChatOverlay.checked = settings.showChatOverlay !== false;
    els.enableVoice.checked = settings.enableVoice === true;
    els.firebaseUrl.value = settings.firebaseUrl || '';
    
    // Update Firebase status
    await updateFirebaseStatus();
  } catch (e) {
    console.error('[CUP Popup] Settings error:', e);
  }
}

async function updateFirebaseStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_FIREBASE_STATUS' });
    const status = response || { enabled: false };
    
    if (status.enabled) {
      els.firebaseStatusDot.className = 'status-indicator connected';
      els.firebaseStatusText.textContent = `✓ Connected - ${status.deviceName || 'Unknown device'}`;
      if (status.lastSyncTime) {
        els.firebaseStatusText.textContent += ` (Last sync: ${status.lastSyncTime})`;
      }
    } else {
      els.firebaseStatusDot.className = 'status-indicator';
      els.firebaseStatusText.textContent = 'Not configured';
    }
  } catch (e) {
    console.error('[CUP Popup] Firebase status error:', e);
  }
}

async function saveSettings() {
  const settings = {
    badgeDisplay: els.badgeDisplay.value,
    showSidebar: els.showSidebar.checked,
    showChatOverlay: els.showChatOverlay.checked,
    enableVoice: els.enableVoice.checked,
    firebaseUrl: els.firebaseUrl.value.trim()
  };
  
  await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
  
  // Update Firebase status after save
  await updateFirebaseStatus();
  
  // Notify tabs to update UI visibility
  chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings }).catch(() => {});
    });
  });
  
  // Show brief success message
  els.saveSettings.textContent = '✓ Saved!';
  setTimeout(() => {
    els.saveSettings.textContent = 'Save Settings';
  }, 1500);
  
  els.settingsPanel.classList.add('hidden');
}

async function triggerRefresh() {
  els.refreshBtn.textContent = '⏳';
  await chrome.runtime.sendMessage({ type: 'TRIGGER_SYNC' });
  setTimeout(loadUsageData, 2000);
  setTimeout(() => { els.refreshBtn.textContent = '🔄'; }, 2000);
}

// Firebase help toggle
els.firebaseHelp.addEventListener('click', (e) => {
  e.preventDefault();
  els.firebaseInstructions.classList.toggle('hidden');
});

// Event Listeners
els.settingsBtn.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
  if (!els.settingsPanel.classList.contains('hidden')) loadSettings();
});

els.closeSettings.addEventListener('click', () => els.settingsPanel.classList.add('hidden'));
els.refreshBtn.addEventListener('click', triggerRefresh);
els.saveSettings.addEventListener('click', saveSettings);

els.viewUsageLink.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://claude.ai/settings/usage' });
});

// Initialize
loadUsageData();
loadSettings();
setInterval(loadUsageData, 5000);
