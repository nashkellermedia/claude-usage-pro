/**
 * Claude Usage Pro - Popup v2.0.0
 */

const els = {
  refreshBtn: document.getElementById('refreshBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  closeSettings: document.getElementById('closeSettings'),
  
  sessionPercent: document.getElementById('sessionPercent'),
  sessionBar: document.getElementById('sessionBar'),
  sessionMeta: document.getElementById('sessionMeta'),
  
  weeklyAllPercent: document.getElementById('weeklyAllPercent'),
  weeklyAllBar: document.getElementById('weeklyAllBar'),
  weeklyAllMeta: document.getElementById('weeklyAllMeta'),
  
  weeklySonnetPercent: document.getElementById('weeklySonnetPercent'),
  weeklySonnetBar: document.getElementById('weeklySonnetBar'),
  weeklySonnetMeta: document.getElementById('weeklySonnetMeta'),
  
  // Tracking Status
  trackingStatus: document.getElementById('trackingStatus'),
  trackingIndicator: document.getElementById('trackingIndicator'),
  trackingText: document.getElementById('trackingText'),
  
  // Settings
  badgeDisplay: document.getElementById('badgeDisplay'),
  showSidebar: document.getElementById('showSidebar'),
  showChatOverlay: document.getElementById('showChatOverlay'),
  enableVoice: document.getElementById('enableVoice'),
  
  // Firebase
  firebaseUrl: document.getElementById('firebaseUrl'),
  firebaseSecret: document.getElementById('firebaseSecret'),
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
      const val = usageData.weeklyAllModels.resetsAt;
      const isDayTime = /^[A-Za-z]{3,}/.test(val);
      els.weeklyAllMeta.textContent = isDayTime ? `Resets ${val}` : `Resets in ${val}`;
    }
  }
  
  // Weekly Sonnet
  if (usageData.weeklySonnet) {
    updateUsageDisplay(els.weeklySonnetPercent, els.weeklySonnetBar, usageData.weeklySonnet.percent || 0);
    if (usageData.weeklySonnet.resetsIn) {
      const val = usageData.weeklySonnet.resetsIn;
      const isDayTime = /^[A-Za-z]{3,}/.test(val);
      els.weeklySonnetMeta.textContent = isDayTime ? `Resets ${val}` : `Resets in ${val}`;
    }
  }
}

async function loadUsageData() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_USAGE_DATA' });
    if (response?.usageData) {
      updateUI(response.usageData);
    }
    
    await loadTrackingStatus();
  } catch (e) {
    console.error('[CUP Popup] Load error:', e);
  }
}

async function loadTrackingStatus() {
  try {
    const hybridStatus = await chrome.runtime.sendMessage({ type: 'GET_HYBRID_STATUS' });
    const firebaseStatus = await chrome.runtime.sendMessage({ type: 'GET_FIREBASE_STATUS' });
    
    updateTrackingStatus(hybridStatus, firebaseStatus);
  } catch (e) {
    console.error('[CUP Popup] Status error:', e);
  }
}

function updateTrackingStatus(hybrid, firebase) {
  if (!els.trackingIndicator || !els.trackingText) return;
  
  let statusText = '';
  let statusColor = '#888';
  
  if (!hybrid || !hybrid.initialized) {
    statusText = 'Initializing...';
    statusColor = '#888';
  } else if (!hybrid.hasBaseline) {
    statusText = 'No baseline - click refresh to sync';
    statusColor = '#f59e0b';
  } else if (hybrid.isStale) {
    const ageMin = Math.floor((hybrid.baselineAge || 0) / 60000);
    statusText = `Baseline stale (${ageMin}m old) - using estimates`;
    statusColor = '#f59e0b';
  } else {
    const ageMin = Math.floor((hybrid.baselineAge || 0) / 60000);
    const deltaTokens = hybrid.deltaTokens || 0;
    
    if (deltaTokens > 0) {
      statusText = `Tracking: +${deltaTokens.toLocaleString()} tokens since sync (${ageMin}m ago)`;
    } else {
      statusText = `Synced ${ageMin}m ago`;
    }
    statusColor = '#22c55e';
  }
  
  if (firebase?.enabled) {
    statusText += ' • Firebase: ✓';
  }
  
  els.trackingIndicator.style.color = statusColor;
  els.trackingText.textContent = statusText;
}

// Refresh button: Opens usage page in background, auto-closes after 5 seconds
async function triggerRefresh() {
  els.refreshBtn.textContent = '⏳';
  els.refreshBtn.disabled = true;
  
  try {
    const tab = await chrome.tabs.create({ 
      url: 'https://claude.ai/settings/usage',
      active: false
    });
    
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_USAGE' });
      } catch (e) {}
      
      setTimeout(async () => {
        try {
          await chrome.tabs.remove(tab.id);
        } catch (e) {}
        
        await loadUsageData();
        
        els.refreshBtn.textContent = '✓';
        setTimeout(() => {
          els.refreshBtn.textContent = '🔄';
          els.refreshBtn.disabled = false;
        }, 1000);
      }, 3000);
    }, 2000);
    
  } catch (e) {
    console.error('[CUP Popup] Refresh error:', e);
    els.refreshBtn.textContent = '❌';
    setTimeout(() => {
      els.refreshBtn.textContent = '🔄';
      els.refreshBtn.disabled = false;
    }, 1000);
  }
}

async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = response?.settings || {};
    
    if (settings.badgeDisplay) els.badgeDisplay.value = settings.badgeDisplay;
    els.showSidebar.checked = settings.showSidebar !== false;
    els.showChatOverlay.checked = settings.showChatOverlay !== false;
    els.enableVoice.checked = settings.enableVoice === true;
    
    if (settings.firebaseUrl) {
      els.firebaseUrl.value = settings.firebaseUrl;
    }
    if (settings.firebaseSecret) {
      // Show masked secret
      els.firebaseSecret.value = '••••••••' + settings.firebaseSecret.slice(-4);
      updateFirebaseStatus(true);
    } else if (settings.firebaseUrl) {
      updateFirebaseStatus(true, 'Connected (no secret - data unprotected!)');
    }
  } catch (e) {
    console.error('[CUP Popup] Load settings error:', e);
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
  
  // Handle Firebase secret - don't overwrite with masked value
  const secretValue = els.firebaseSecret.value.trim();
  if (secretValue && !secretValue.startsWith('••••')) {
    settings.firebaseSecret = secretValue;
  }
  // If masked, we need to preserve the existing secret
  // The background will handle this by merging with existing settings
  
  try {
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    
    els.saveSettings.textContent = '✓ Saved!';
    setTimeout(() => els.saveSettings.textContent = 'Save Settings', 1500);
    
    if (settings.firebaseUrl) {
      const hasSecret = secretValue && !secretValue.startsWith('••••');
      updateFirebaseStatus(true, hasSecret ? null : 'Connected (no secret - add one for security)');
    } else {
      updateFirebaseStatus(false);
    }
    
  } catch (e) {
    console.error('[CUP Popup] Save settings error:', e);
    els.saveSettings.textContent = 'Error!';
    setTimeout(() => els.saveSettings.textContent = 'Save Settings', 1500);
  }
}

function updateFirebaseStatus(connected, customMessage) {
  if (connected) {
    els.firebaseStatusDot.style.background = '#22c55e';
    els.firebaseStatusText.textContent = customMessage || 'Connected & Protected';
  } else {
    els.firebaseStatusDot.style.background = '#6b7280';
    els.firebaseStatusText.textContent = 'Not configured';
  }
}

async function loadAnalytics(days = 30) {
  try {
    const response = await chrome.runtime.sendMessage({ 
      type: 'GET_ANALYTICS_SUMMARY',
      days 
    });
    
    if (response?.summary) {
      displayAnalytics(response.summary);
    } else {
      els.analyticsSummary.innerHTML = '<p>No analytics data available yet. Use Claude to generate usage data.</p>';
    }
  } catch (e) {
    console.error('[CUP Popup] Analytics error:', e);
    els.analyticsSummary.innerHTML = '<p>Error loading analytics</p>';
  }
}

function displayAnalytics(summary) {
  if (!summary || !summary.averageUsage) {
    els.analyticsSummary.innerHTML = '<p>No analytics data available yet. Use Claude to generate usage data.</p>';
    return;
  }
  
  let thresholdHtml = '';
  if (summary.thresholdHits) {
    const hits = summary.thresholdHits;
    thresholdHtml = `
    <div class="analytics-card">
      <h4>⚠️ Threshold Alerts</h4>
      <div class="analytics-stat">
        <span class="label">Hit 70%:</span>
        <span class="value">${hits.by70 || 0} times</span>
      </div>
      <div class="analytics-stat">
        <span class="label">Hit 90%:</span>
        <span class="value warning">${hits.by90 || 0} times</span>
      </div>
      <div class="analytics-stat">
        <span class="label">Maxed out:</span>
        <span class="value danger">${hits.by100 || 0} times</span>
      </div>
    </div>`;
  }
  
  let modelHtml = '';
  if (summary.modelPreference && Object.keys(summary.modelPreference).length > 0) {
    const models = Object.entries(summary.modelPreference)
      .sort((a, b) => b[1] - a[1])
      .map(([model, count]) => `<div class="analytics-stat"><span class="label">${model}:</span><span class="value">${count}</span></div>`)
      .join('');
    modelHtml = `
    <div class="analytics-card">
      <h4>🤖 Model Usage</h4>
      ${models}
    </div>`;
  }
  
  const html = `
    <div class="analytics-card">
      <h3>📊 ${summary.period || 'Usage Summary'}</h3>
      <p class="analytics-meta">${summary.days || 0} days of data</p>
    </div>
    
    <div class="analytics-card">
      <h4>📈 Average Usage</h4>
      <div class="analytics-stat">
        <span class="label">Session:</span>
        <span class="value">${summary.averageUsage.session || 0}%</span>
      </div>
      <div class="analytics-stat">
        <span class="label">Weekly (All):</span>
        <span class="value">${summary.averageUsage.weeklyAll || 0}%</span>
      </div>
      <div class="analytics-stat">
        <span class="label">Weekly (Sonnet):</span>
        <span class="value">${summary.averageUsage.weeklySonnet || 0}%</span>
      </div>
    </div>
    
    <div class="analytics-card">
      <h4>🔥 Peak Usage</h4>
      <div class="analytics-stat">
        <span class="label">Session:</span>
        <span class="value">${summary.peakUsage?.session || 0}%</span>
      </div>
      <div class="analytics-stat">
        <span class="label">Weekly (All):</span>
        <span class="value">${summary.peakUsage?.weeklyAll || 0}%</span>
      </div>
      <div class="analytics-stat">
        <span class="label">Weekly (Sonnet):</span>
        <span class="value">${summary.peakUsage?.weeklySonnet || 0}%</span>
      </div>
    </div>
    
    ${thresholdHtml}
    ${modelHtml}
  `;
  
  els.analyticsSummary.innerHTML = html;
}

async function exportAnalyticsData() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_ANALYTICS' });
    
    if (response?.data) {
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `claude-usage-analytics-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    console.error('[CUP Popup] Export error:', e);
  }
}

// Event Listeners
els.settingsBtn.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
});

els.closeSettings.addEventListener('click', () => {
  els.settingsPanel.classList.add('hidden');
});

els.refreshBtn.addEventListener('click', triggerRefresh);
els.saveSettings.addEventListener('click', saveSettings);

if (els.firebaseHelp) {
  els.firebaseHelp.addEventListener('click', () => {
    els.firebaseInstructions.classList.toggle('hidden');
  });
}

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
