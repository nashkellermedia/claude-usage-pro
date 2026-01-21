/**
 * Claude Usage Pro - Sidebar Widget
 * Collapsible usage display in Claude's sidebar
 */

class SidebarUI {
  constructor() {
    this.widget = null;
    this.expanded = true;
    this.thresholdWarning = 70;
    this.thresholdDanger = 90;
  }
  
  async initialize() {
    window.CUP.log('SidebarUI: Initializing...');
    
    // Check if user prefers minimized and load thresholds
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response?.settings?.sidebarMinimized) {
        this.expanded = false;
      }
      if (response?.settings) {
        this.thresholdWarning = response.settings.thresholdWarning || 70;
        this.thresholdDanger = response.settings.thresholdDanger || 90;
      }
    } catch (e) {}
    
    await this.injectWidget();
    window.CUP.log('SidebarUI: Initialized, expanded:', this.expanded);
  }
  
  async injectWidget() {
    // Wait for sidebar to be ready
    for (let i = 0; i < 20; i++) {
      // Look for Claude's sidebar navigation area
      const sidebar = document.querySelector('nav') || 
                     document.querySelector('[class*="sidebar"]') ||
                     document.querySelector('[class*="Sidebar"]');
      
      if (sidebar && !document.getElementById('cup-sidebar-widget')) {
        // Find a good insertion point - look for "Starred" or similar section
        const starredSection = Array.from(sidebar.querySelectorAll('div')).find(div => {
          return div.textContent?.includes('Starred') && div.children.length < 5;
        });
        
        // Create widget
        this.widget = document.createElement('div');
        this.widget.id = 'cup-sidebar-widget';
        const expandedClass = this.expanded ? 'expanded' : '';
        const expandIcon = this.expanded ? '▼' : '▶';
        this.widget.innerHTML = `
          <div class="cup-widget-inner">
            <div class="cup-widget-header ${expandedClass}" id="cup-widget-toggle">
              <span class="cup-widget-icon">📊</span>
              <span class="cup-widget-title">Usage</span>
              <span class="cup-widget-expand">${expandIcon}</span>
            </div>
            <div class="cup-widget-details ${expandedClass}" id="cup-widget-details">
              <div class="cup-usage-section">
                <div class="cup-usage-header">
                  <span class="cup-usage-label">Current Session</span>
                  <span class="cup-usage-percent" id="cup-sidebar-session">--%</span>
                </div>
                <div class="cup-usage-bar-bg">
                  <div class="cup-usage-bar" id="cup-sidebar-session-bar" style="width: 0%"></div>
                </div>
                <div class="cup-usage-meta" id="cup-sidebar-session-reset">Resets in --</div>
              </div>
              
              <div class="cup-usage-section">
                <div class="cup-usage-header">
                  <span class="cup-usage-label">Weekly (All Models)</span>
                  <span class="cup-usage-percent" id="cup-sidebar-weekly">--%</span>
                </div>
                <div class="cup-usage-bar-bg">
                  <div class="cup-usage-bar" id="cup-sidebar-weekly-bar" style="width: 0%"></div>
                </div>
                <div class="cup-usage-meta" id="cup-sidebar-weekly-reset">Resets --</div>
              </div>
              
              <div class="cup-usage-section">
                <div class="cup-usage-header">
                  <span class="cup-usage-label">Weekly (Sonnet)</span>
                  <span class="cup-usage-percent" id="cup-sidebar-sonnet">--%</span>
                </div>
                <div class="cup-usage-bar-bg">
                  <div class="cup-usage-bar cup-bar-sonnet" id="cup-sidebar-sonnet-bar" style="width: 0%"></div>
                </div>
                <div class="cup-usage-meta" id="cup-sidebar-sonnet-reset">Resets --</div>
              </div>
              
              <div class="cup-usage-section cup-time-section">
                <div class="cup-usage-header">
                  <span class="cup-usage-label">⏱️ Time Tracking</span>
                </div>
                <div class="cup-time-stats">
                  <div class="cup-time-row">
                    <span class="cup-time-label">Session:</span>
                    <span class="cup-time-value" id="cup-sidebar-time-session">0m</span>
                  </div>
                  <div class="cup-time-row">
                    <span class="cup-time-label">Today:</span>
                    <span class="cup-time-value" id="cup-sidebar-time-today">0m</span>
                  </div>
                  <div class="cup-time-row">
                    <span class="cup-time-label">This week:</span>
                    <span class="cup-time-value" id="cup-sidebar-time-week">0m</span>
                  </div>
                </div>
              </div>
              
              <a href="https://claude.ai/settings/usage" class="cup-usage-link">View full usage details →</a>
            </div>
          </div>
        `;
        
        // Insert widget
        if (starredSection) {
          starredSection.parentElement.insertBefore(this.widget, starredSection);
          window.CUP.log('SidebarUI: Inserted before', starredSection.textContent?.substring(0, 30));
        } else {
          // Fallback: insert at top of sidebar
          sidebar.insertBefore(this.widget, sidebar.firstChild);
          window.CUP.log('SidebarUI: Inserted at top of sidebar');
        }
        
        // Add toggle handler
        document.getElementById('cup-widget-toggle')?.addEventListener('click', () => {
          this.toggleExpand();
        });
        
        return;
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
    
    window.CUP.log('SidebarUI: Could not find sidebar');
  }
  
  toggleExpand() {
    const details = document.getElementById('cup-widget-details');
    const header = document.getElementById('cup-widget-toggle');
    const expand = this.widget?.querySelector('.cup-widget-expand');
    
    if (details) {
      this.expanded = !this.expanded;
      details.classList.toggle('expanded', this.expanded);
      header?.classList.toggle('expanded', this.expanded);
      if (expand) {
        expand.textContent = this.expanded ? '▼' : '▶';
      }
    }
  }
  
  update(usageData) {
    if (!usageData) return;
    
    // Update current session
    if (usageData.currentSession) {
      const pct = usageData.currentSession.percent || 0;
      this.updateElement('cup-sidebar-session', pct + '%');
      this.updateBar('cup-sidebar-session-bar', pct);
      this.colorizePercent('cup-sidebar-session', pct);
    }
    
    // Always update session reset time (use timestamp for dynamic countdown)
    const resetEl = document.getElementById('cup-sidebar-session-reset');
    if (resetEl) {
      const resetTimestamp = usageData.currentSession?.resetsAt;
      const resetStr = usageData.currentSession?.resetsIn;
      const displayTime = this.formatResetTime(resetTimestamp, resetStr);
      
      if (displayTime && displayTime !== '--') {
        resetEl.textContent = 'Resets in ' + displayTime;
        resetEl.style.cursor = 'default';
        resetEl.style.textDecoration = 'none';
        resetEl.onclick = null;
      } else {
        resetEl.textContent = 'Resets in -- (click to sync)';
        resetEl.style.cursor = 'pointer';
        resetEl.style.textDecoration = 'underline';
        resetEl.onclick = () => window.open('https://claude.ai/settings/usage', '_blank');
      }
    }
    
    // Update weekly all models
    if (usageData.weeklyAllModels) {
      const pct = usageData.weeklyAllModels.percent || 0;
      this.updateElement('cup-sidebar-weekly', pct + '%');
      this.updateBar('cup-sidebar-weekly-bar', pct);
      this.colorizePercent('cup-sidebar-weekly', pct);
      
      // Use timestamp for dynamic countdown
      const weeklyResetTs = usageData.weeklyAllModels.resetsAt;
      const weeklyResetStr = usageData.weeklyAllModels.resetsAtStr;
      const weeklyDisplayTime = this.formatResetTime(weeklyResetTs, weeklyResetStr);
      if (weeklyDisplayTime && weeklyDisplayTime !== '--') {
        this.updateElement('cup-sidebar-weekly-reset', 'Resets in ' + weeklyDisplayTime);
      }
    }
    
    // Update weekly sonnet
    if (usageData.weeklySonnet) {
      const pct = usageData.weeklySonnet.percent || 0;
      this.updateElement('cup-sidebar-sonnet', pct + '%');
      this.updateBar('cup-sidebar-sonnet-bar', pct);
      this.colorizePercent('cup-sidebar-sonnet', pct);
      
      // Use timestamp for dynamic countdown
      const sonnetResetTs = usageData.weeklySonnet.resetsAt;
      const sonnetResetStr = usageData.weeklySonnet.resetsIn;
      const sonnetDisplayTime = this.formatResetTime(sonnetResetTs, sonnetResetStr);
      if (sonnetDisplayTime && sonnetDisplayTime !== '--') {
        this.updateElement('cup-sidebar-sonnet-reset', 'Resets in ' + sonnetDisplayTime);
      }
    }
    
    // Update time tracking
    this.updateTimeDisplay();
  }
  
  async updateTimeDisplay() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TIME_DATA' });
      if (response?.timeData) {
        const td = response.timeData;
        
        // Session time from tracker
        if (window.cupTimeTracker) {
          const sessionMs = window.cupTimeTracker.getSessionTime();
          this.updateElement('cup-sidebar-time-session', this.formatTime(sessionMs));
        }
        
        // Today
        this.updateElement('cup-sidebar-time-today', this.formatTime(td.today?.ms || 0));
        
        // This week
        this.updateElement('cup-sidebar-time-week', this.formatTime(td.thisWeek?.ms || 0));
      }
    } catch (e) {
      // Ignore errors
    }
  }
  
  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }
  
  // Calculate remaining time from timestamp
  formatResetTime(timestamp, fallbackStr) {
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
      return '--';
    }
    
    return fallbackStr || '--';
  }

  updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  
  updateBar(id, percent) {
    const el = document.getElementById(id);
    if (el) {
      el.style.width = Math.min(percent, 100) + '%';
      
      // Color the bar based on percentage using custom thresholds
      if (percent >= this.thresholdDanger) {
        el.style.background = '#ef4444';
      } else if (percent >= this.thresholdWarning) {
        el.style.background = '#f59e0b';
      } else {
        el.style.background = '#22c55e';
      }
    }
  }
  
  colorizePercent(id, percent) {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (percent >= this.thresholdDanger) {
      el.style.color = '#ef4444';
    } else if (percent >= this.thresholdWarning) {
      el.style.color = '#f59e0b';
    } else {
      el.style.color = '#22c55e';
    }
  }
  
  checkAndReinject() {
    const widget = document.getElementById('cup-sidebar-widget');
    const sidebar = document.querySelector('nav[class*="flex-col"]');
    
    // Check if sidebar is collapsed/minimized (narrow width)
    if (sidebar) {
      const sidebarWidth = sidebar.offsetWidth;
      if (sidebarWidth < 150) {
        // Sidebar is collapsed - hide our widget
        if (widget) widget.style.display = 'none';
        return;
      } else {
        // Sidebar is expanded - show our widget
        if (widget) widget.style.display = '';
      }
    }
    
    if (!widget) {
      this.injectWidget();
    }
  }
}

window.SidebarUI = SidebarUI;
window.CUP.log('SidebarUI loaded');
