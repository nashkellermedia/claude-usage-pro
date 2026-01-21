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
  sidebarMinimized: document.getElementById('sidebarMinimized'),
  showChatOverlay: document.getElementById('showChatOverlay'),
  enableVoice: document.getElementById('enableVoice'),
  enableResetNotifications: document.getElementById('enableResetNotifications'),
  thresholdWarning: document.getElementById('thresholdWarning'),
  thresholdDanger: document.getElementById('thresholdDanger'),
  statsBarShowDraft: document.getElementById('statsBarShowDraft'),
  statsBarShowFiles: document.getElementById('statsBarShowFiles'),
  statsBarShowSession: document.getElementById('statsBarShowSession'),
  statsBarShowWeekly: document.getElementById('statsBarShowWeekly'),
  statsBarShowSonnet: document.getElementById('statsBarShowSonnet'),
  statsBarShowTimer: document.getElementById('statsBarShowTimer'),
  sessionSparkline: document.getElementById('sessionSparkline'),
  weeklyAllSparkline: document.getElementById('weeklyAllSparkline'),
  weeklySonnetSparkline: document.getElementById('weeklySonnetSparkline'),
  autoRefreshEnabled: document.getElementById('autoRefreshEnabled'),
  autoRefreshMinutes: document.getElementById('autoRefreshMinutes'),
  
  // Anthropic
  anthropicApiKey: document.getElementById('anthropicApiKey'),
  anthropicStatusDot: document.getElementById('anthropicStatusDot'),
  anthropicStatusText: document.getElementById('anthropicStatusText'),
  
  // Firebase
  firebaseDatabaseUrl: document.getElementById('firebaseDatabaseUrl'),
  firebaseSyncId: document.getElementById('firebaseSyncId'),
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

// Format reset time from timestamp or string
function formatResetTime(timestamp, fallbackStr) {
  // If timestamp is a valid future timestamp (> year 2020 in ms), calculate countdown
  if (timestamp && typeof timestamp === 'number' && timestamp > 1577836800000) {
    const now = Date.now();
    const remaining = timestamp - now;
    
    if (remaining <= 0) return 'now';
    
    const minutes = Math.floor(remaining / (60 * 1000));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m`;
    }
  }
  
  // If fallback is also a large number (raw timestamp), don't use it
  if (fallbackStr && typeof fallbackStr === 'number') {
    return null;
  }
  
  return fallbackStr || null;
}

function updateUsageDisplay(el, barEl, percent) {
  if (!el || !barEl) return;
  
  // Get custom thresholds from settings inputs (fallback to defaults)
  const warningThreshold = parseInt(els.thresholdWarning?.value) || 70;
  const dangerThreshold = parseInt(els.thresholdDanger?.value) || 90;
  
  el.textContent = percent + '%';
  barEl.style.width = Math.min(percent, 100) + '%';
  
  el.classList.remove('warning', 'danger');
  barEl.classList.remove('warning', 'danger');
  
  if (percent >= dangerThreshold) {
    el.classList.add('danger');
    barEl.classList.add('danger');
  } else if (percent >= warningThreshold) {
    el.classList.add('warning');
    barEl.classList.add('warning');
  }
}

function updateUI(usageData) {
  if (!usageData) return;
  
  if (usageData.currentSession) {
    updateUsageDisplay(els.sessionPercent, els.sessionBar, usageData.currentSession.percent || 0);
    const sessionReset = formatResetTime(usageData.currentSession.resetsAt, usageData.currentSession.resetsIn);
    let metaText = sessionReset ? `Resets in ${sessionReset}` : '';
    
    // Add prediction if available
    if (usageData.predictions?.session?.formatted && usageData.currentSession.percent < 100) {
      const pred = usageData.predictions.session.formatted;
      metaText += metaText ? ` · Limit in ~${pred}` : `Limit in ~${pred}`;
    }
    if (metaText) els.sessionMeta.textContent = metaText;
  }
  
  if (usageData.weeklyAllModels) {
    updateUsageDisplay(els.weeklyAllPercent, els.weeklyAllBar, usageData.weeklyAllModels.percent || 0);
    const weeklyReset = formatResetTime(usageData.weeklyAllModels.resetsAt, usageData.weeklyAllModels.resetsAtStr);
    let metaText = weeklyReset ? `Resets in ${weeklyReset}` : '';
    
    // Add prediction if available
    if (usageData.predictions?.weeklyAll?.formatted && usageData.weeklyAllModels.percent < 100) {
      const pred = usageData.predictions.weeklyAll.formatted;
      metaText += metaText ? ` · Limit in ~${pred}` : `Limit in ~${pred}`;
    }
    if (metaText) els.weeklyAllMeta.textContent = metaText;
  }
  
  if (usageData.weeklySonnet) {
    updateUsageDisplay(els.weeklySonnetPercent, els.weeklySonnetBar, usageData.weeklySonnet.percent || 0);
    const sonnetReset = formatResetTime(usageData.weeklySonnet.resetsAt, usageData.weeklySonnet.resetsIn);
    let metaText = sonnetReset ? `Resets in ${sonnetReset}` : '';
    
    // Add prediction if available
    if (usageData.predictions?.weeklySonnet?.formatted && usageData.weeklySonnet.percent < 100) {
      const pred = usageData.predictions.weeklySonnet.formatted;
      metaText += metaText ? ` · Limit in ~${pred}` : `Limit in ~${pred}`;
    }
    if (metaText) els.weeklySonnetMeta.textContent = metaText;
  }
  
  // Show burn rate in tracking status area if available
  const burnRateStatus = document.getElementById('burnRateStatus');
  const burnRateEl = document.getElementById('burnRate');
  if (usageData.predictions?.burnRate?.tokensPerHour > 0) {
    const rate = Math.round(usageData.predictions.burnRate.tokensPerHour).toLocaleString();
    if (burnRateEl) burnRateEl.textContent = `${rate} tokens/hr`;
    if (burnRateStatus) burnRateStatus.style.display = '';
  } else {
    if (burnRateStatus) burnRateStatus.style.display = 'none';
  }
}

async function loadUsageData() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_USAGE_DATA' });
    if (response?.usageData) {
      updateUI(response.usageData);
    }
    await loadTrackingStatus();
    await loadSparklines();
  } catch (e) {
    console.error('[CUP Popup] Load error:', e);
  }
}

async function loadSparklines() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SPARKLINE_DATA', days: 7 });
    if (response?.sparkline) {
      drawSparkline(els.sessionSparkline, response.sparkline, 'session');
      drawSparkline(els.weeklyAllSparkline, response.sparkline, 'weeklyAll');
      drawSparkline(els.weeklySonnetSparkline, response.sparkline, 'weeklySonnet');
    }
  } catch (e) {
    console.error('[CUP Popup] Sparkline error:', e);
  }
}

function drawSparkline(canvas, data, key) {
  if (!canvas || !data || data.length === 0) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const padding = 4;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Extract values for this metric, filtering out nulls
  const values = data.map(d => d[key]).filter(v => v !== null);
  if (values.length < 2) {
    // Not enough data - show placeholder
    ctx.fillStyle = '#666';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Not enough data', width / 2, height / 2 + 3);
    return;
  }
  
  const max = Math.max(...values, 100); // At least 100 for percentage scale
  const min = 0;
  const range = max - min || 1;
  
  // Calculate points
  const points = [];
  const stepX = (width - padding * 2) / (data.length - 1);
  
  data.forEach((d, i) => {
    if (d[key] !== null) {
      const x = padding + i * stepX;
      const y = height - padding - ((d[key] - min) / range) * (height - padding * 2);
      points.push({ x, y, value: d[key], date: d.date });
    }
  });
  
  if (points.length < 2) return;
  
  // Draw line
  ctx.beginPath();
  ctx.strokeStyle = key === 'weeklySonnet' ? '#a855f7' : '#6b8afd';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  
  // Draw gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  const color = key === 'weeklySonnet' ? '168, 85, 247' : '107, 138, 253';
  gradient.addColorStop(0, 'rgba(' + color + ', 0.3)');
  gradient.addColorStop(1, 'rgba(' + color + ', 0.05)');
  
  ctx.beginPath();
  ctx.moveTo(points[0].x, height - padding);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, height - padding);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  
  // Draw dots
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = key === 'weeklySonnet' ? '#a855f7' : '#6b8afd';
    ctx.fill();
  });
  
  // Store points for tooltip
  canvas.sparklinePoints = points;
  
  // Add mousemove handler for tooltip
  if (!canvas.hasTooltipHandler) {
    canvas.hasTooltipHandler = true;
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      
      // Find closest point
      let closest = null;
      let closestDist = Infinity;
      for (const p of canvas.sparklinePoints || []) {
        const dist = Math.abs(p.x - x);
        if (dist < closestDist) {
          closestDist = dist;
          closest = p;
        }
      }
      
      if (closest && closestDist < 15) {
        const dateStr = new Date(closest.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        canvas.title = dateStr + ': ' + closest.value + '%';
      } else {
        canvas.title = '7-day trend';
      }
    });
  }
}

async function loadTrackingStatus() {
  try {
    const hybridStatus = await chrome.runtime.sendMessage({ type: 'GET_HYBRID_STATUS' });
    const firebaseStatus = await chrome.runtime.sendMessage({ type: 'GET_FIREBASE_STATUS' });
    const settingsResp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    updateTrackingStatus(hybridStatus, firebaseStatus, settingsResp?.settings);
  } catch (e) {
    console.error('[CUP Popup] Status error:', e);
  }
}

function updateTrackingStatus(hybrid, firebase, settings) {
  if (!els.trackingIndicator || !els.trackingText) return;
  
  let parts = [];
  let statusColor = '#22c55e'; // Start green, downgrade if issues
  let issues = [];
  
  // Baseline status
  if (!hybrid || !hybrid.initialized) {
    parts.push('⏳ Initializing...');
    statusColor = '#888';
  } else if (!hybrid.hasBaseline) {
    parts.push('⚠️ No baseline');
    issues.push('Click 🔄 to sync usage data');
    statusColor = '#f59e0b';
  } else {
    const ageMin = Math.floor((hybrid.baselineAge || 0) / 60000);
    const deltaTokens = hybrid.deltaTokens || 0;
    
    // Show baseline age with icon
    if (hybrid.isStale) {
      parts.push(`📊 ${ageMin}m ago (stale)`);
      issues.push('Baseline is stale - click 🔄 to refresh');
      if (statusColor === '#22c55e') statusColor = '#f59e0b';
    } else {
      parts.push(`📊 ${ageMin}m ago`);
    }
    
    // Show tracked tokens if any
    if (deltaTokens > 0) {
      parts.push(`+${deltaTokens.toLocaleString()}`);
    }
  }
  
  // Token counting status
  if (settings?.anthropicApiKey) {
    parts.push('🎯'); // Accurate counting enabled
  }
  
  // Firebase status
  if (firebase?.enabled || firebase?.authenticated) {
    if (firebase.authenticated) {
      const pushAge = firebase.lastPush ? Math.floor((Date.now() - firebase.lastPush) / 1000) : null;
      const pullAge = firebase.lastPull ? Math.floor((Date.now() - firebase.lastPull) / 1000) : null;
      
      if (pushAge !== null || pullAge !== null) {
        const recentSync = Math.min(pushAge || 9999, pullAge || 9999);
        if (recentSync < 60) {
          parts.push(`☁️ ${recentSync}s`);
        } else if (recentSync < 3600) {
          parts.push(`☁️ ${Math.floor(recentSync / 60)}m`);
        } else {
          parts.push('☁️ >1h');
          if (statusColor === '#22c55e') statusColor = '#f59e0b';
        }
      } else {
        parts.push('☁️ ✓');
      }
    } else {
      parts.push('☁️ ✗');
      issues.push('Firebase not authenticated - check settings');
      if (statusColor === '#22c55e') statusColor = '#f59e0b';
    }
  }
  
  els.trackingIndicator.style.color = statusColor;
  els.trackingText.textContent = parts.join(' • ');
  
  // Set tooltip with detailed status
  let tooltip = 'Tracking Status:\n';
  tooltip += hybrid?.hasBaseline ? '✓ Baseline data loaded\n' : '✗ No baseline data\n';
  tooltip += settings?.anthropicApiKey ? '✓ Accurate token counting (API)\n' : '○ Estimated token counting\n';
  tooltip += firebase?.authenticated ? '✓ Firebase sync enabled\n' : '○ Firebase sync disabled\n';
  if (issues.length > 0) {
    tooltip += '\nIssues:\n• ' + issues.join('\n• ');
  }
  els.trackingText.title = tooltip;
  els.trackingIndicator.title = tooltip;
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
    els.sidebarMinimized.checked = settings.sidebarMinimized === true;
    els.showChatOverlay.checked = settings.showChatOverlay !== false;
    els.enableVoice.checked = settings.enableVoice === true;
    els.enableResetNotifications.checked = settings.enableResetNotifications !== false; // default true
    
    // Thresholds
    els.thresholdWarning.value = settings.thresholdWarning || 70;
    els.thresholdDanger.value = settings.thresholdDanger || 90;
    
    // Stats bar visibility
    els.statsBarShowDraft.checked = settings.statsBarShowDraft !== false;
    els.statsBarShowFiles.checked = settings.statsBarShowFiles !== false;
    els.statsBarShowSession.checked = settings.statsBarShowSession !== false;
    els.statsBarShowWeekly.checked = settings.statsBarShowWeekly !== false;
    els.statsBarShowSonnet.checked = settings.statsBarShowSonnet !== false;
    els.statsBarShowTimer.checked = settings.statsBarShowTimer !== false;
    
    // Auto-refresh settings
    els.autoRefreshEnabled.checked = settings.autoRefreshEnabled === true;
    els.autoRefreshMinutes.value = settings.autoRefreshMinutes || 30;
    
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
    if (settings.firebaseSyncId) {
      els.firebaseSyncId.value = settings.firebaseSyncId;
    }
    if (settings.firebaseApiKey) {
      els.firebaseApiKey.value = '••••••••' + settings.firebaseApiKey.slice(-8);
    }
    
    // Update Firebase status
    const fbStatus = await chrome.runtime.sendMessage({ type: 'GET_FIREBASE_STATUS' });
    if (fbStatus?.authenticated) {
      const syncId = settings.firebaseSyncId;
      const statusText = syncId 
        ? `Connected (Sync: ${syncId})`
        : `Connected (UID: ${fbStatus.uid?.slice(0,8)}...)`;
      updateFirebaseStatus(true, statusText);
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
    sidebarMinimized: els.sidebarMinimized.checked,
    showChatOverlay: els.showChatOverlay.checked,
    enableVoice: els.enableVoice.checked,
    enableResetNotifications: els.enableResetNotifications.checked,
    thresholdWarning: parseInt(els.thresholdWarning.value) || 70,
    thresholdDanger: parseInt(els.thresholdDanger.value) || 90,
    statsBarShowDraft: els.statsBarShowDraft.checked,
    statsBarShowFiles: els.statsBarShowFiles.checked,
    statsBarShowSession: els.statsBarShowSession.checked,
    statsBarShowWeekly: els.statsBarShowWeekly.checked,
    statsBarShowSonnet: els.statsBarShowSonnet.checked,
    statsBarShowTimer: els.statsBarShowTimer.checked,
    autoRefreshEnabled: els.autoRefreshEnabled.checked,
    autoRefreshMinutes: parseInt(els.autoRefreshMinutes.value) || 30,
    firebaseDatabaseUrl: els.firebaseDatabaseUrl.value.trim().replace(/\/+$/, ''),  // Strip trailing slashes
    firebaseSyncId: els.firebaseSyncId.value.trim()
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
  console.log('[CUP Popup] Loading analytics for', days, 'days');
  try {
    // First, ensure we have a snapshot recorded
    const usageResponse = await chrome.runtime.sendMessage({ type: 'GET_USAGE_DATA', recordSnapshot: true });
    console.log('[CUP Popup] Usage data response:', usageResponse);
    
    const [response, timeResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_ANALYTICS_SUMMARY', days }),
      chrome.runtime.sendMessage({ type: 'GET_TIME_DATA' })
    ]);
    const timeData = timeResponse?.timeData;
    console.log('[CUP Popup] Analytics response:', JSON.stringify(response, null, 2));
    
    if (response?.summary) {
      console.log('[CUP Popup] Calling displayAnalytics with:', response.summary);
      displayAnalytics(response.summary, timeData);
    } else {
      console.log('[CUP Popup] No summary in response, showing empty state');
      els.analyticsSummary.innerHTML = '<p>No analytics data yet.</p><p class="hint">Click refresh to start tracking your usage.</p>';
    }
  } catch (e) {
    console.error('[CUP Popup] Analytics error:', e);
    els.analyticsSummary.innerHTML = '<p>Error loading analytics. Try refreshing.</p>';
  }
}

function displayAnalytics(summary, timeData = null) {
  console.log('[CUP Popup] displayAnalytics called with:', summary, timeData);
  if (!summary || !summary.averageUsage || summary.days === 0) {
    els.analyticsSummary.innerHTML = '<p>No historical snapshots yet.</p><p class="hint">Click refresh in the main popup to sync usage data and start tracking.</p>';
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
  
  // Weekly comparison
  let weeklyHtml = '';
  if (summary.weeklyStats) {
    const ws = summary.weeklyStats;
    let trendIcon = '';
    let trendClass = '';
    if (ws.weekOverWeekChange !== null) {
      if (ws.weekOverWeekChange > 0) {
        trendIcon = `↑ ${ws.weekOverWeekChange}%`;
        trendClass = 'warning';
      } else if (ws.weekOverWeekChange < 0) {
        trendIcon = `↓ ${Math.abs(ws.weekOverWeekChange)}%`;
        trendClass = 'success';
      } else {
        trendIcon = '→ 0%';
      }
    }
    
    // Daily breakdown bars
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let dailyBars = '';
    for (let i = 0; i < 7; i++) {
      const data = ws.dailyBreakdown[i] || { avg: 0 };
      const barWidth = Math.min(100, data.avg);
      const isBusiest = dayNames[i] === ws.busiestDay && data.avg > 0;
      dailyBars += `<div class="daily-bar-row">
        <span class="day-label">${dayNames[i]}</span>
        <div class="daily-bar-container">
          <div class="daily-bar${isBusiest ? ' busiest' : ''}" style="width: ${barWidth}%"></div>
        </div>
        <span class="day-value">${data.avg}%</span>
      </div>`;
    }
    
    weeklyHtml = `
    <div class="analytics-card">
      <h4>📅 This Week vs Last</h4>
      <div class="analytics-stat"><span class="label">This week:</span><span class="value">${ws.thisWeekAvg}%</span></div>
      <div class="analytics-stat"><span class="label">Last week:</span><span class="value">${ws.lastWeekAvg}%</span></div>
      ${trendIcon ? `<div class="analytics-stat"><span class="label">Change:</span><span class="value ${trendClass}">${trendIcon}</span></div>` : ''}
      ${ws.busiestDay ? `<div class="analytics-stat"><span class="label">Busiest:</span><span class="value">${ws.busiestDay} (${ws.busiestDayAvg}%)</span></div>` : ''}
    </div>
    <div class="analytics-card">
      <h4>📊 Daily Breakdown</h4>
      <div class="daily-breakdown">${dailyBars}</div>
    </div>`;
  }
  
  // Time stats
  let timeHtml = '';
  if (timeData) {
    const formatTime = (ms) => {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) return `${hours}h ${minutes % 60}m`;
      if (minutes > 0) return `${minutes}m`;
      return `${seconds}s`;
    };
    
    timeHtml = `
    <div class="analytics-card">
      <h4>⏱️ Time Spent</h4>
      <div class="analytics-stat"><span class="label">Today:</span><span class="value">${formatTime(timeData.today?.ms || 0)}</span></div>
      <div class="analytics-stat"><span class="label">This week:</span><span class="value">${formatTime(timeData.thisWeek?.ms || 0)}</span></div>
      <div class="analytics-stat"><span class="label">All time:</span><span class="value">${formatTime(timeData.allTime?.ms || 0)}</span></div>
    </div>`;
  }
  
  els.analyticsSummary.innerHTML = `
    <div class="analytics-card">
      <h3>📊 ${summary.period}</h3>
      <p class="analytics-meta">${summary.days} days of data</p>
    </div>
    ${weeklyHtml}
    ${timeHtml}
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

els.pushFirebaseBtn = document.getElementById('pushFirebaseBtn');
if (els.pushFirebaseBtn) {
  els.pushFirebaseBtn.addEventListener('click', async () => {
    els.pushFirebaseBtn.disabled = true;
    els.pushFirebaseBtn.textContent = '⏳';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'PUSH_TO_FIREBASE' });
      if (result?.success) {
        els.pushFirebaseBtn.textContent = '✓';
      } else {
        els.pushFirebaseBtn.textContent = '❌';
        console.error('[CUP Popup] Push failed:', result?.error);
      }
    } catch (e) {
      els.pushFirebaseBtn.textContent = '❌';
      console.error('[CUP Popup] Push error:', e);
    }
    setTimeout(() => {
      els.pushFirebaseBtn.textContent = '⬆️ Push';
      els.pushFirebaseBtn.disabled = false;
    }, 1500);
  });
}

els.pullFirebaseBtn = document.getElementById('pullFirebaseBtn');
if (els.pullFirebaseBtn) {
  els.pullFirebaseBtn.addEventListener('click', async () => {
    els.pullFirebaseBtn.disabled = true;
    els.pullFirebaseBtn.textContent = '⏳';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'SYNC_FROM_FIREBASE' });
      if (result?.success) {
        els.pullFirebaseBtn.textContent = '✓';
        // Reload settings to show updated values
        await loadSettings();
        await loadUsageData();
      } else {
        els.pullFirebaseBtn.textContent = '❌';
        console.error('[CUP Popup] Pull failed:', result?.error);
      }
    } catch (e) {
      els.pullFirebaseBtn.textContent = '❌';
      console.error('[CUP Popup] Pull error:', e);
    }
    setTimeout(() => {
      els.pullFirebaseBtn.textContent = '⬇️ Pull';
      els.pullFirebaseBtn.disabled = false;
    }, 1500);
  });
}

if (els.firebaseHelp) {
  els.firebaseHelp.addEventListener('click', () => {
    els.firebaseInstructions.classList.toggle('hidden');
    if (!els.firebaseInstructions.classList.contains('hidden')) {
      setTimeout(() => {
        els.firebaseInstructions.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  });
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

// Auto-normalize Firebase URL on blur
if (els.firebaseDatabaseUrl) {
  els.firebaseDatabaseUrl.addEventListener('blur', function() {
    const currentVal = this.value;
    const cleanedVal = currentVal.trim().replace(/\/+$/, '');
    if (cleanedVal !== currentVal) {
      this.value = cleanedVal;
    }
  });
}
