/**
 * Claude Usage Pro - Popup v2.1.0
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
  
  trackingIndicator: document.getElementById('trackingIndicator'),
  trackingText: document.getElementById('trackingText'),
  
  // Settings
  badgeDisplay: document.getElementById('badgeDisplay'),
  showSidebar: document.getElementById('showSidebar'),
  showChatOverlay: document.getElementById('showChatOverlay'),
  enableVoice: document.getElementById('enableVoice'),
  
  // Anthropic
  anthropicApiKey: document.getElementById('anthropicApiKey'),
  anthropicStatusDot: document.getElementById('anthropicStatusDot'),
  anthropicStatusText: document.getElementById('anthropicStatusText'),
  
  // Firebase
  firebaseDatabaseUrl: document.getElementById('firebaseDatabaseUrl'),
  firebaseApiKey: document.getElementById('firebaseApiKey'),
  firebaseHelp: document.getElementById('firebaseHelp'),
  firebaseInstructions: document.getElementById('firebaseInstructions'),
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

// Store original values to detect real changes
let originalSettings = {};

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
  
  if (usageData.currentSession) {
    updateUsageDisplay(els.sessionPercent, els.sessionBar, usageData.currentSession.percent || 0);
    if (usageData.currentSession.resetsIn) {
      els.sessionMeta.textContent = `Resets in ${usageData.currentSession.resetsIn}`;
    }
  }
  
  if (usageData.weeklyAllModels) {
    updateUsageDisplay(els.weeklyAllPercent, els.weeklyAllBar, usageData.weeklyAllModels.percent || 0);
    if (usageData.weeklyAllModels.resetsAt) {
      const val = usageData.weeklyAllModels.resetsAt;
      const isDayTime = /^[A-Za-z]{3,}/.test(val);
      els.weeklyAllMeta.textContent = isDayTime ? `Resets ${val}` : `Resets in ${val}`;
    }
  }
  
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
  } else if (!hybrid.hasBaseline) {
    statusText = 'No baseline - click refresh to sync';
    statusColor = '#f59e0b';
  } else if (hybrid.isStale) {
    const ageMin = Math.floor((hybrid.baselineAge || 0) / 60000);
    statusText = `Baseline stale (${ageMin}m old)`;
    statusColor = '#f59e0b';
  } else {
    const ageMin = Math.floor((hybrid.baselineAge || 0) / 60000);
    const deltaTokens = hybrid.deltaTokens || 0;
    
    if (deltaTokens > 0) {
      statusText = `+${deltaTokens.toLocaleString()} tokens (${ageMin}m ago)`;
    } else {
      statusText = `Synced ${ageMin}m ago`;
    }
    statusColor = '#22c55e';
  }
  
  if (firebase?.authenticated) {
    statusText += ' • Firebase ✓';
  }
  
  els.trackingIndicator.style.color = statusColor;
  els.trackingText.textContent = statusText;
}

async function triggerRefresh() {
  els.refreshBtn.textContent = '⏳';
  els.refreshBtn.disabled = true;
  
  let tabId = null;
  
  try {
    // Create tab
    const tab = await chrome.tabs.create({ 
      url: 'https://claude.ai/settings/usage',
      active: false
    });
    tabId = tab.id;
    
    // Wait for tab to fully load
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(); // Continue anyway after timeout
      }, 15000);
      
      const listener = (id, info) => {
        if (id === tabId && info.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      
      chrome.tabs.onUpdated.addListener(listener);
    });
    
    console.log('[CUP Popup] Tab loaded, waiting for content script...');
    
    // Wait for content script to initialize and auto-scrape
    // Content script auto-scrapes after 2 seconds on usage page
    await new Promise(r => setTimeout(r, 4000));
    
    // Try to trigger scrape via message
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_USAGE' });
      console.log('[CUP Popup] Sent SCRAPE_USAGE message');
    } catch (e) {
      console.log('[CUP Popup] Message failed, using scripting API...');
      // Fallback: use scripting API to trigger scrape directly
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => {
            if (window.cupScraper) {
              window.cupScraper.scrapeCurrentPage();
              return true;
            }
            return false;
          }
        });
        console.log('[CUP Popup] Executed scrape via scripting API');
      } catch (e2) {
        console.log('[CUP Popup] Scripting API failed:', e2.message);
      }
    }
    
    // Wait for scrape to complete and sync
    await new Promise(r => setTimeout(r, 2000));
    
    // Close the tab
    try { 
      await chrome.tabs.remove(tabId); 
      tabId = null;
    } catch (e) {}
    
    // Reload data in popup
    await loadUsageData();
    
    els.refreshBtn.textContent = '✓';
    setTimeout(() => {
      els.refreshBtn.textContent = '🔄';
      els.refreshBtn.disabled = false;
    }, 1500);
    
  } catch (e) {
    console.error('[CUP Popup] Refresh error:', e);
    
    // Try to clean up tab
    if (tabId) {
      try { await chrome.tabs.remove(tabId); } catch (e2) {}
    }
    
    els.refreshBtn.textContent = '❌';
    setTimeout(() => {
      els.refreshBtn.textContent = '🔄';
      els.refreshBtn.disabled = false;
    }, 1500);
  }
}

async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = response?.settings || {};
    
    // Store original values
    originalSettings = { ...settings };
    
    if (settings.badgeDisplay) els.badgeDisplay.value = settings.badgeDisplay;
    els.showSidebar.checked = settings.showSidebar !== false;
    els.showChatOverlay.checked = settings.showChatOverlay !== false;
    els.enableVoice.checked = settings.enableVoice === true;
    
    // Anthropic API key
    if (settings.anthropicApiKey) {
      els.anthropicApiKey.value = '••••••••' + settings.anthropicApiKey.slice(-8);
      updateAnthropicStatus(true);
    } else {
      updateAnthropicStatus(false);
    }
    
    // Firebase
    if (settings.firebaseDatabaseUrl) {
      els.firebaseDatabaseUrl.value = settings.firebaseDatabaseUrl;
    }
    if (settings.firebaseApiKey) {
      els.firebaseApiKey.value = '••••••••' + settings.firebaseApiKey.slice(-8);
    }
    
    // Update Firebase status
    const fbStatus = await chrome.runtime.sendMessage({ type: 'GET_FIREBASE_STATUS' });
    if (fbStatus?.authenticated) {
      updateFirebaseStatus(true, `Connected (UID: ${fbStatus.uid?.slice(0,8)}...)`);
    } else if (settings.firebaseDatabaseUrl && settings.firebaseApiKey) {
      updateFirebaseStatus(false, 'Not authenticated - check API key');
    } else {
      updateFirebaseStatus(false);
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
    firebaseDatabaseUrl: els.firebaseDatabaseUrl.value.trim()
  };
  
  // Handle Anthropic API key - only update if changed from masked value
  const anthropicValue = els.anthropicApiKey.value.trim();
  if (anthropicValue && anthropicValue.startsWith('sk-ant-')) {
    settings.anthropicApiKey = anthropicValue;
  } else if (!anthropicValue) {
    settings.anthropicApiKey = '';
  } else if (anthropicValue.startsWith('••••')) {
    // Keep original
    settings.anthropicApiKey = originalSettings.anthropicApiKey || '';
  }
  
  // Handle Firebase API key - only update if changed from masked value
  const firebaseKeyValue = els.firebaseApiKey.value.trim();
  if (firebaseKeyValue && firebaseKeyValue.startsWith('AIza')) {
    settings.firebaseApiKey = firebaseKeyValue;
  } else if (!firebaseKeyValue) {
    settings.firebaseApiKey = '';
  } else if (firebaseKeyValue.startsWith('••••')) {
    // Keep original
    settings.firebaseApiKey = originalSettings.firebaseApiKey || '';
  }
  
  try {
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    
    els.saveSettings.textContent = '✓ Saved!';
    setTimeout(() => els.saveSettings.textContent = 'Save Settings', 1500);
    
    // Update status displays
    if (settings.anthropicApiKey) {
      updateAnthropicStatus(true);
    } else {
      updateAnthropicStatus(false);
    }
    
    // Reload to get updated Firebase status
    setTimeout(loadSettings, 500);
  } catch (e) {
    console.error('[CUP Popup] Save settings error:', e);
    els.saveSettings.textContent = 'Error!';
    setTimeout(() => els.saveSettings.textContent = 'Save Settings', 1500);
  }
}

function updateAnthropicStatus(configured) {
  if (configured) {
    els.anthropicStatusDot.style.background = '#22c55e';
    els.anthropicStatusText.textContent = 'Configured - using accurate token counting (FREE)';
  } else {
    els.anthropicStatusDot.style.background = '#6b7280';
    els.anthropicStatusText.textContent = 'Not configured (using estimates)';
  }
}

function updateFirebaseStatus(connected, customMessage) {
  if (connected) {
    els.firebaseStatusDot.style.background = '#22c55e';
    els.firebaseStatusText.textContent = customMessage || 'Connected & Authenticated';
  } else {
    els.firebaseStatusDot.style.background = '#6b7280';
    els.firebaseStatusText.textContent = customMessage || 'Not configured';
  }
}

async function loadAnalytics(days = 30) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ANALYTICS_SUMMARY', days });
    if (response?.summary) {
      displayAnalytics(response.summary);
    } else {
      els.analyticsSummary.innerHTML = '<p>No analytics data yet. Use Claude to generate data.</p>';
    }
  } catch (e) {
    els.analyticsSummary.innerHTML = '<p>Error loading analytics</p>';
  }
}

function displayAnalytics(summary) {
  if (!summary || !summary.averageUsage) {
    els.analyticsSummary.innerHTML = '<p>No analytics data yet.</p>';
    return;
  }
  
  let thresholdHtml = '';
  if (summary.thresholdHits) {
    const hits = summary.thresholdHits;
    thresholdHtml = `
    <div class="analytics-card">
      <h4>⚠️ Threshold Alerts</h4>
      <div class="analytics-stat"><span class="label">Hit 70%:</span><span class="value">${hits.by70 || 0}x</span></div>
      <div class="analytics-stat"><span class="label">Hit 90%:</span><span class="value warning">${hits.by90 || 0}x</span></div>
      <div class="analytics-stat"><span class="label">Maxed:</span><span class="value danger">${hits.by100 || 0}x</span></div>
    </div>`;
  }
  
  let modelHtml = '';
  if (summary.modelPreference && Object.keys(summary.modelPreference).length > 0) {
    const models = Object.entries(summary.modelPreference)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([model, count]) => `<div class="analytics-stat"><span class="label">${model}:</span><span class="value">${count}</span></div>`)
      .join('');
    modelHtml = `<div class="analytics-card"><h4>🤖 Models Used</h4>${models}</div>`;
  }
  
  els.analyticsSummary.innerHTML = `
    <div class="analytics-card">
      <h3>📊 ${summary.period}</h3>
      <p class="analytics-meta">${summary.days} days of data</p>
    </div>
    <div class="analytics-card">
      <h4>📈 Average Usage</h4>
      <div class="analytics-stat"><span class="label">Session:</span><span class="value">${summary.averageUsage.session}%</span></div>
      <div class="analytics-stat"><span class="label">Weekly:</span><span class="value">${summary.averageUsage.weeklyAll}%</span></div>
    </div>
    <div class="analytics-card">
      <h4>🔥 Peak Usage</h4>
      <div class="analytics-stat"><span class="label">Session:</span><span class="value">${summary.peakUsage?.session || 0}%</span></div>
      <div class="analytics-stat"><span class="label">Weekly:</span><span class="value">${summary.peakUsage?.weeklyAll || 0}%</span></div>
    </div>
    ${thresholdHtml}
    ${modelHtml}
  `;
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
els.usagePageBtn = document.getElementById('usagePageBtn');

els.usagePageBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://claude.ai/settings/usage' });
});

els.settingsBtn.addEventListener('click', () => els.settingsPanel.classList.toggle('hidden'));
els.closeSettings.addEventListener('click', () => els.settingsPanel.classList.add('hidden'));
els.refreshBtn.addEventListener('click', triggerRefresh);
els.saveSettings.addEventListener('click', saveSettings);

if (els.firebaseHelp) {
  els.firebaseHelp.addEventListener('click', () => els.firebaseInstructions.classList.toggle('hidden'));
}

els.viewAnalytics.addEventListener('click', () => {
  els.analyticsPanel.classList.toggle('hidden');
  if (!els.analyticsPanel.classList.contains('hidden')) loadAnalytics(30);
});
els.closeAnalytics.addEventListener('click', () => els.analyticsPanel.classList.add('hidden'));
els.exportAnalytics.addEventListener('click', exportAnalyticsData);

// Initialize
loadUsageData();
loadSettings();
setInterval(loadUsageData, 5000);
