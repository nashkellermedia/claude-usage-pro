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
  
  // Tracking Status
  trackingStatus: document.getElementById('trackingStatus'),
  trackingIndicator: document.getElementById('trackingIndicator'),
  trackingText: document.getElementById('trackingText'),
  
  // Settings
  badgeDisplay: document.getElementById('badgeDisplay'),
  showSidebar: document.getElementById('showSidebar'),
  showChatOverlay: document.getElementById('showChatOverlay'),
  enableVoice: document.getElementById('enableVoice'),
  
  // API Key
  anthropicApiKey: document.getElementById('anthropicApiKey'),
  apiKeyStatus: document.getElementById('apiKeyStatus'),
  apiKeyStatusDot: document.getElementById('apiKeyStatusDot'),
  apiKeyStatusText: document.getElementById('apiKeyStatusText'),
  validateApiKey: document.getElementById('validateApiKey'),
  
  // Firebase
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
    
    // Also load hybrid tracker status
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
  let statusColor = '#888'; // gray
  
  if (!hybrid || !hybrid.initialized) {
    statusText = 'Initializing...';
    statusColor = '#888';
  } else if (!hybrid.hasBaseline) {
    statusText = 'No baseline - visit Usage page to sync';
    statusColor = '#f59e0b'; // yellow
  } else if (hybrid.isStale) {
    const ageMin = Math.floor((hybrid.baselineAge || 0) / 60000);
    statusText = `Baseline stale (${ageMin}m old) - using estimates`;
    statusColor = '#f59e0b'; // yellow
  } else {
    const ageMin = Math.floor((hybrid.baselineAge || 0) / 60000);
    const deltaTokens = hybrid.deltaTokens || 0;
    
    if (deltaTokens > 0) {
      statusText = `Tracking: +${deltaTokens.toLocaleString()} tokens since sync (${ageMin}m ago)`;
    } else {
      statusText = `Synced ${ageMin}m ago`;
    }
    statusColor = '#22c55e'; // green
  }
  
  // Add Firebase status
  if (firebase?.enabled) {
    statusText += ' • Firebase: ✓';
  }
  
  els.trackingIndicator.style.color = statusColor;
  els.trackingText.textContent = statusText;
}

async function triggerRefresh() {
  els.refreshBtn.textContent = '⏳';
  els.refreshBtn.disabled = true;
  
  try {
    // Try to trigger scrape on active Claude tab
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*', active: true });
    if (tabs.length > 0) {
      await chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRAPE_USAGE' });
    }
    
    // Then refresh our display
    await loadUsageData();
    
    els.refreshBtn.textContent = '✓';
    setTimeout(() => {
      els.refreshBtn.textContent = '🔄';
      els.refreshBtn.disabled = false;
    }, 1000);
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
    const result = await chrome.storage.sync.get([
      'badgeDisplay', 
      'showSidebar', 
      'showChatOverlay',
      'enableVoice',
      'firebaseUrl',
      'anthropicApiKey'
    ]);
    
    if (result.badgeDisplay) els.badgeDisplay.value = result.badgeDisplay;
    if (typeof result.showSidebar !== 'undefined') els.showSidebar.checked = result.showSidebar;
    if (typeof result.showChatOverlay !== 'undefined') els.showChatOverlay.checked = result.showChatOverlay;
    if (typeof result.enableVoice !== 'undefined') els.enableVoice.checked = result.enableVoice;
    if (result.firebaseUrl) {
      els.firebaseUrl.value = result.firebaseUrl;
      updateFirebaseStatus(true);
    }
    if (result.anthropicApiKey) {
      // Show masked key
      els.anthropicApiKey.value = result.anthropicApiKey;
      updateApiKeyStatus(true, 'API key configured - using accurate counting');
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
  
  // Handle API key
  const apiKey = els.anthropicApiKey.value.trim();
  if (apiKey && apiKey.startsWith('sk-ant-')) {
    settings.anthropicApiKey = apiKey;
  } else if (!apiKey) {
    // Clear the key
    await chrome.storage.sync.remove('anthropicApiKey');
  }
  
  try {
    await chrome.storage.sync.set(settings);
    
    // Notify background
    await chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings });
    
    // Notify all Claude tabs
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings });
      } catch (e) {}
    }
    
    els.saveSettings.textContent = '✓ Saved!';
    setTimeout(() => els.saveSettings.textContent = 'Save Settings', 1500);
    
    // Update Firebase status
    if (settings.firebaseUrl) {
      updateFirebaseStatus(true);
    } else {
      updateFirebaseStatus(false);
    }
    
  } catch (e) {
    console.error('[CUP Popup] Save settings error:', e);
    els.saveSettings.textContent = 'Error!';
    setTimeout(() => els.saveSettings.textContent = 'Save Settings', 1500);
  }
}

function updateFirebaseStatus(connected) {
  if (connected) {
    els.firebaseStatusDot.style.background = '#22c55e';
    els.firebaseStatusText.textContent = 'Connected';
  } else {
    els.firebaseStatusDot.style.background = '#6b7280';
    els.firebaseStatusText.textContent = 'Not configured';
  }
}

function updateApiKeyStatus(valid, message) {
  if (valid) {
    els.apiKeyStatusDot.style.background = '#22c55e';
    els.apiKeyStatusText.textContent = message || 'API key valid - using accurate counting';
  } else {
    els.apiKeyStatusDot.style.background = '#6b7280';
    els.apiKeyStatusText.textContent = message || 'Not configured (using estimates)';
  }
}

async function validateAnthropicApiKey() {
  const apiKey = els.anthropicApiKey.value.trim();
  
  if (!apiKey) {
    updateApiKeyStatus(false, 'No API key entered');
    return;
  }
  
  if (!apiKey.startsWith('sk-ant-')) {
    updateApiKeyStatus(false, 'Invalid format - should start with sk-ant-');
    return;
  }
  
  els.validateApiKey.textContent = 'Testing...';
  els.validateApiKey.disabled = true;
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'test' }]
      })
    });
    
    if (response.ok) {
      updateApiKeyStatus(true, 'API key valid ✓ - using accurate counting');
      els.validateApiKey.textContent = '✓ Valid!';
    } else if (response.status === 401) {
      updateApiKeyStatus(false, 'Invalid API key');
      els.validateApiKey.textContent = 'Invalid Key';
    } else {
      updateApiKeyStatus(false, `API error: ${response.status}`);
      els.validateApiKey.textContent = 'Error';
    }
  } catch (e) {
    updateApiKeyStatus(false, 'Connection failed');
    els.validateApiKey.textContent = 'Failed';
  }
  
  setTimeout(() => {
    els.validateApiKey.textContent = 'Test API Key';
    els.validateApiKey.disabled = false;
  }, 2000);
}

// Analytics functions
async function loadAnalytics(days = 30) {
  try {
    const response = await chrome.runtime.sendMessage({ 
      type: 'GET_ANALYTICS_SUMMARY',
      days 
    });
    
    console.log('[CUP Popup] Analytics response:', response);
    
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
  // Safety check for missing data
  if (!summary || !summary.averageUsage) {
    els.analyticsSummary.innerHTML = '<p>No analytics data available yet. Use Claude to generate usage data.</p>';
    return;
  }
  
  // Build threshold hits section
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
  
  // Build model preference section
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

// API Key validation
if (els.validateApiKey) {
  els.validateApiKey.addEventListener('click', validateAnthropicApiKey);
}

// Firebase help toggle
if (els.firebaseHelp) {
  els.firebaseHelp.addEventListener('click', () => {
    els.firebaseInstructions.classList.toggle('hidden');
  });
}

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
