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
  saveSettings: document.getElementById('saveSettings'),
  
  // Analytics
  viewAnalytics: document.getElementById('viewAnalytics'),
  analyticsPanel: document.getElementById('analyticsPanel'),
  closeAnalytics: document.getElementById('closeAnalytics'),
  analyticsSummary: document.getElementById('analyticsSummary'),
  exportAnalytics: document.getElementById('exportAnalytics')
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

// Analytics functions
async function loadAnalytics(days = 30) {
  try {
    const response = await chrome.runtime.sendMessage({ 
      type: 'GET_ANALYTICS_SUMMARY',
      days 
    });
    
    if (response?.summary) {
      displayAnalytics(response.summary);
    }
  } catch (e) {
    console.error('[CUP Popup] Analytics error:', e);
    els.analyticsSummary.innerHTML = '<p>Error loading analytics</p>';
  }
}

function displayAnalytics(summary) {
  const html = `
    <div class="analytics-card">
      <h3>📊 ${summary.period}</h3>
      <p class="analytics-meta">${summary.days} days of data</p>
    </div>
    
    <div class="analytics-card">
      <h4>Average Usage</h4>
      <div class="analytics-stat">
        <span class="label">Session:</span>
        <span class="value">${summary.averageUsage.session}%</span>
      </div>
      <div class="analytics-stat">
        <span class="label">Weekly (All):</span>
        <span class="value">${summary.averageUsage.weeklyAll}%</span>
      </div>
      <div class="analytics-stat">
        <span class="label">Weekly (Sonnet):</span>
        <span class="value">${summary.averageUsage.weeklySonnet}%</span>
      </div>
    </div>
    
    <div class="analytics-card">
      <h4>Peak Usage</h4>
      <div class="analytics-stat">
        <span class="label">Session:</span>
        <span class="value ${summary.peakUsage.session >= 90 ? 'danger' : ''}">${summary.peakUsage.session}%</span>
      </div>
      <div class="analytics-stat">
        <span class="label">Weekly (All):</span>
        <span class="value ${summary.peakUsage.weeklyAll >= 90 ? 'danger' : ''}">${summary.peakUsage.weeklyAll}%</span>
      </div>
      <div class="analytics-stat">
        <span class="label">Weekly (Sonnet):</span>
        <span class="value ${summary.peakUsage.weeklySonnet >= 90 ? 'danger' : ''}">${summary.peakUsage.weeklySonnet}%</span>
      </div>
    </div>
    
    <div class="analytics-card">
      <h4>Threshold Alerts</h4>
      <p>Times you hit usage thresholds:</p>
      <div class="analytics-stat">
        <span class="label">70% warnings:</span>
        <span class="value">${summary.thresholdHits.by70}</span>
      </div>
      <div class="analytics-stat">
        <span class="label">90% warnings:</span>
        <span class="value">${summary.thresholdHits.by90}</span>
      </div>
      <div class="analytics-stat">
        <span class="label">100% maxed out:</span>
        <span class="value danger">${summary.thresholdHits.by100}</span>
      </div>
    </div>
    
    ${Object.keys(summary.modelPreference).length > 0 ? `
    <div class="analytics-card">
      <h4>Model Preference</h4>
      ${Object.entries(summary.modelPreference).map(([model, count]) => `
        <div class="analytics-stat">
          <span class="label">${model}:</span>
          <span class="value">${count} checks</span>
        </div>
      `).join('')}
    </div>
    ` : ''}
  `;
  
  els.analyticsSummary.innerHTML = html;
}

async function exportAnalyticsData() {
  try {
    els.exportAnalytics.textContent = 'Exporting...';
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_ANALYTICS' });
    
    if (response?.data) {
      // Create download
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `claude-usage-analytics-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      els.exportAnalytics.textContent = '✓ Exported!';
      setTimeout(() => {
        els.exportAnalytics.textContent = 'Export Data';
      }, 2000);
    }
  } catch (e) {
    console.error('[CUP Popup] Export error:', e);
    els.exportAnalytics.textContent = 'Export Failed';
    setTimeout(() => {
      els.exportAnalytics.textContent = 'Export Data';
    }, 2000);
  }
}

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

// Analytics listeners
els.viewAnalytics.addEventListener('click', () => {
  els.analyticsPanel.classList.toggle('hidden');
  if (!els.analyticsPanel.classList.contains('hidden')) {
    loadAnalytics(30);
  }
});

els.closeAnalytics.addEventListener('click', () => {
  els.analyticsPanel.classList.add('hidden');
});

els.exportAnalytics.addEventListener('click', exportAnalyticsData);

// Initialize
loadUsageData();
loadSettings();
setInterval(loadUsageData, 5000);
