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
    this.rateLimitState = null;
    this.countdownInterval = null;
  }
  
  async initialize() {
    window.CUP.log('SidebarUI: Initializing...');
    
    // Check if user prefers minimized and load thresholds
    try {
      const response = await window.CUP.sendToBackground({ type: 'GET_SETTINGS' });
      if (response?.settings?.sidebarMinimized) {
        this.expanded = false;
      }
      if (response?.settings) {
        this.thresholdWarning = response.settings.thresholdWarning || 70;
        this.thresholdDanger = response.settings.thresholdDanger || 90;
      }
    } catch (e) {}
    
    // Load rate limit state
    try {
      const response = await window.CUP.sendToBackground({ type: 'GET_RATE_LIMIT_STATE' });
      if (response?.rateLimitState) {
        this.rateLimitState = response.rateLimitState;
      }
    } catch (e) {}
    
    await this.injectWidget();
    
    // Listen for rate limit updates
    this.setupRateLimitListener();
    
    window.CUP.log('SidebarUI: Initialized, expanded:', this.expanded);
    
    // Set up sidebar collapse observer after a delay (ensures widget is stable)
    setTimeout(() => this.setupCollapseObserver(), 2000);
  }
  
  setupCollapseObserver() {
    const sidebar = document.querySelector('nav[class*="flex-col"]');
    if (!sidebar) {
      window.CUP.log('SidebarUI: No sidebar found for observer');
      return;
    }
    
    // Track if we've ever seen the sidebar expanded (prevents hiding on load)
    this.sidebarWasExpanded = sidebar.offsetWidth >= 150;
    
    // Use ResizeObserver for faster collapse detection
    if (typeof ResizeObserver !== 'undefined') {
      this.collapseObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          this.handleCollapseChange(width);
        }
      });
      this.collapseObserver.observe(sidebar);
      window.CUP.log('SidebarUI: Collapse observer attached, initial width:', sidebar.offsetWidth);
    }
  }
  
  handleCollapseChange(width) {
    const widget = document.getElementById('cup-sidebar-widget');
    if (!widget) return;
    
    const isCollapsed = width < 100;
    
    // Safety: only hide if we've previously seen sidebar expanded
    // This prevents hiding on initial page load
    if (width >= 150) {
      this.sidebarWasExpanded = true;
    }
    
    if (isCollapsed && this.sidebarWasExpanded) {
      widget.style.display = 'none';
    } else if (!isCollapsed) {
      widget.style.display = '';
    }
  }
  
  setupRateLimitListener() {
    // Register callback with API interceptor
    if (window.APIInterceptor) {
      window.APIInterceptor.on('onRateLimited', (state) => {
        this.handleRateLimitUpdate(state);
      });
    }
  }
  
  handleRateLimitUpdate(state) {
    this.rateLimitState = state;
    this.updateRateLimitDisplay();
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
              <span class="cup-rate-limit-badge" id="cup-rate-limit-badge" style="display: none;">LIMITED</span>
              <span class="cup-widget-expand">${expandIcon}</span>
            </div>
            <div class="cup-widget-details ${expandedClass}" id="cup-widget-details">
              <!-- Rate limit banner (hidden by default) -->
              <div class="cup-rate-limit-banner" id="cup-rate-limit-banner" style="display: none;">
                <div class="cup-rate-limit-title">
                  <span class="cup-rate-limit-icon">⛔</span>
                  Rate Limit Reached
                </div>
                <div class="cup-rate-limit-message" id="cup-rate-limit-message">
                  You've reached your usage limit.
                </div>
                <div class="cup-rate-limit-countdown" id="cup-rate-limit-countdown">
                  <span class="cup-countdown-icon">⏱️</span>
                  <span id="cup-rate-limit-time">Calculating...</span>
                </div>
              </div>
              
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
        
        // Update rate limit display if we have state
        if (this.rateLimitState?.isLimited) {
          this.updateRateLimitDisplay();
        }
        
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
  
  updateRateLimitDisplay() {
    const banner = document.getElementById('cup-rate-limit-banner');
    const badge = document.getElementById('cup-rate-limit-badge');
    const message = document.getElementById('cup-rate-limit-message');
    const countdown = document.getElementById('cup-rate-limit-countdown');
    const timeEl = document.getElementById('cup-rate-limit-time');
    
    if (!this.rateLimitState?.isLimited) {
      // Clear rate limit display
      if (banner) banner.style.display = 'none';
      if (badge) badge.style.display = 'none';
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
      return;
    }
    
    // Show rate limit banner
    if (banner) banner.style.display = 'block';
    if (badge) badge.style.display = 'inline-block';
    
    // Set message
    if (message) {
      let msg = this.rateLimitState.message || "You've reached your usage limit.";
      // Clean up the message
      if (msg.length > 100) {
        msg = msg.substring(0, 100) + '...';
      }
      message.textContent = msg;
    }
    
    // Update countdown
    if (this.rateLimitState.resetTime && countdown && timeEl) {
      countdown.style.display = 'flex';
      
      // Clear existing interval
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
      }
      
      // Update immediately
      this.updateCountdown(timeEl);
      
      // Start countdown interval
      this.countdownInterval = setInterval(() => {
        this.updateCountdown(timeEl);
      }, 1000);
    } else if (countdown) {
      countdown.style.display = 'none';
    }
  }
  
  updateCountdown(timeEl) {
    if (!this.rateLimitState?.resetTime || !timeEl) return;
    
    const now = Date.now();
    const remaining = this.rateLimitState.resetTime - now;
    
    if (remaining <= 0) {
      timeEl.textContent = 'Resetting now...';
      // Clear the interval and state
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
      // Notify that limit should be cleared
      window.CUP.sendToBackground({ type: 'RATE_LIMIT_CLEARED' });
      return;
    }
    
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
    
    let timeStr = '';
    if (hours > 0) {
      timeStr = `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      timeStr = `${minutes}m ${seconds}s`;
    } else {
      timeStr = `${seconds}s`;
    }
    
    timeEl.textContent = `Resets in ${timeStr}`;
  }
  
  update(usageData) {
    if (!usageData) return;
    
    // Update current session
    if (usageData.currentSession) {
      const pct = usageData.currentSession.percent || 0;
      this.updateElement('cup-sidebar-session', pct + '%');
      this.updateBar('cup-sidebar-session-bar', pct);
      this.colorizePercent('cup-sidebar-session', pct);
      
      // Auto-detect rate limit from 100% usage
      if (pct >= 100 && !this.rateLimitState?.isLimited) {
        this.handleRateLimitUpdate({
          isLimited: true,
          resetTime: usageData.currentSession.resetsAt,
          message: "You've reached 100% of your session limit.",
          source: 'usage'
        });
      }
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
      const response = await window.CUP.sendToBackground({ type: 'GET_TIME_DATA' });
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
