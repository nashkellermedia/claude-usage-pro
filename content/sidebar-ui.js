/**
 * Claude Usage Pro - Sidebar Widget
 * Collapsible usage display in Claude's sidebar
 */

class SidebarUI {
  constructor() {
    this.widget = null;
    this.expanded = true;
  }
  
  async initialize() {
    window.CUP.log('SidebarUI: Initializing...');
    await this.injectWidget();
    window.CUP.log('SidebarUI: Initialized');
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
        this.widget.innerHTML = `
          <div class="cup-widget-inner">
            <div class="cup-widget-header" id="cup-widget-toggle">
              <span class="cup-widget-icon">📊</span>
              <span class="cup-widget-title">Usage</span>
              <span class="cup-widget-expand">▼</span>
            </div>
            <div class="cup-widget-details expanded" id="cup-widget-details">
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
    const expand = this.widget?.querySelector('.cup-widget-expand');
    
    if (details) {
      this.expanded = !this.expanded;
      details.classList.toggle('expanded', this.expanded);
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
    
    // Always update session reset time
    const resetEl = document.getElementById('cup-sidebar-session-reset');
    if (resetEl) {
      const resetTime = usageData.currentSession?.resetsIn || '--';
      if (resetTime && resetTime !== '--') {
        resetEl.textContent = 'Resets in ' + resetTime;
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
      
      if (usageData.weeklyAllModels.resetsAt) {
        this.updateElement('cup-sidebar-weekly-reset', 'Resets ' + usageData.weeklyAllModels.resetsAt);
      }
    }
    
    // Update weekly sonnet
    if (usageData.weeklySonnet) {
      const pct = usageData.weeklySonnet.percent || 0;
      this.updateElement('cup-sidebar-sonnet', pct + '%');
      this.updateBar('cup-sidebar-sonnet-bar', pct);
      this.colorizePercent('cup-sidebar-sonnet', pct);
      
      if (usageData.weeklySonnet.resetsIn && usageData.weeklySonnet.resetsIn !== '--') {
        const resetVal = usageData.weeklySonnet.resetsIn;
        // Check if it's a day/time format (e.g., "Thu 1:00 AM") vs duration (e.g., "5 hr")
        const isDayTime = /^[A-Za-z]{3,}/.test(resetVal);
        this.updateElement('cup-sidebar-sonnet-reset', isDayTime ? 'Resets ' + resetVal : 'Resets in ' + resetVal);
      }
    }
    
  }
  

  updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  
  updateBar(id, percent) {
    const el = document.getElementById(id);
    if (el) {
      el.style.width = Math.min(percent, 100) + '%';
      
      // Color the bar based on percentage
      if (percent >= 90) {
        el.style.background = '#ef4444';
      } else if (percent >= 70) {
        el.style.background = '#f59e0b';
      } else {
        el.style.background = '#22c55e';
      }
    }
  }
  
  colorizePercent(id, percent) {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (percent >= 90) {
      el.style.color = '#ef4444';
    } else if (percent >= 70) {
      el.style.color = '#f59e0b';
    } else {
      el.style.color = '#22c55e';
    }
  }
  
  checkAndReinject() {
    if (!document.getElementById('cup-sidebar-widget')) {
      this.injectWidget();
    }
  }
}

window.SidebarUI = SidebarUI;
window.CUP.log('SidebarUI loaded');
