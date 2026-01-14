/**
 * Claude Usage Pro - Sidebar UI
 * Displays percentage-based usage data
 */

class SidebarUI {
  constructor() {
    this.container = null;
    this.isExpanded = true;
    this.initialized = false;
  }
  
  async initialize() {
    window.CUP.log('SidebarUI: Initializing...');
    
    await this.waitForSidebar();
    this.buildUI();
    await this.injectIntoSidebar();
    
    this.initialized = true;
    window.CUP.log('SidebarUI: Initialized');
  }
  
  async waitForSidebar() {
    for (let i = 0; i < 20; i++) {
      const sidebar = this.findSidebar();
      if (sidebar) return sidebar;
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  }
  
  findSidebar() {
    const selectors = [
      'nav[class*="flex-col"]',
      'nav.flex.flex-col',
      '[class*="Sidebar"]',
      '[class*="sidebar"]',
      'aside nav',
      'nav'
    ];
    
    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        if (el.querySelector('a[href*="/chat"]') || 
            el.querySelector('[class*="starred"]') ||
            el.innerText?.includes('New chat')) {
          return el;
        }
      }
    }
    return null;
  }
  
  buildUI() {
    this.container = document.createElement('div');
    this.container.id = 'cup-sidebar-widget';
    this.container.innerHTML = `
      <div class="cup-widget-header" id="cup-widget-toggle">
        <span class="cup-widget-icon">📊</span>
        <span class="cup-widget-title">Usage</span>
        <span class="cup-widget-expand" id="cup-expand-icon">▲</span>
      </div>
      
      <div class="cup-widget-details expanded" id="cup-widget-details">
        <!-- Current Session -->
        <div class="cup-usage-section">
          <div class="cup-usage-header">
            <span class="cup-usage-label">Current Session</span>
            <span class="cup-usage-percent" id="cup-session-percent">--%</span>
          </div>
          <div class="cup-usage-bar-bg">
            <div class="cup-usage-bar" id="cup-session-bar"></div>
          </div>
          <div class="cup-usage-meta" id="cup-session-meta">Resets in --</div>
        </div>
        
        <!-- Weekly All Models -->
        <div class="cup-usage-section">
          <div class="cup-usage-header">
            <span class="cup-usage-label">Weekly (All Models)</span>
            <span class="cup-usage-percent" id="cup-weekly-all-percent">--%</span>
          </div>
          <div class="cup-usage-bar-bg">
            <div class="cup-usage-bar" id="cup-weekly-all-bar"></div>
          </div>
          <div class="cup-usage-meta" id="cup-weekly-all-meta">Resets --</div>
        </div>
        
        <!-- Weekly Sonnet -->
        <div class="cup-usage-section">
          <div class="cup-usage-header">
            <span class="cup-usage-label">Weekly (Sonnet)</span>
            <span class="cup-usage-percent" id="cup-weekly-sonnet-percent">--%</span>
          </div>
          <div class="cup-usage-bar-bg">
            <div class="cup-usage-bar cup-bar-sonnet" id="cup-weekly-sonnet-bar"></div>
          </div>
          <div class="cup-usage-meta" id="cup-weekly-sonnet-meta">Resets in --</div>
        </div>
        
        <!-- Current Model -->
        <div class="cup-model-indicator">
          <span class="cup-model-label">Current:</span>
          <span class="cup-model-badge" id="cup-current-model">Sonnet 4.5</span>
        </div>
        
        <!-- Link to usage page -->
        <a href="https://claude.ai/settings/usage" class="cup-usage-link" target="_self">
          View full usage details →
        </a>
      </div>
    `;
    
    this.container.querySelector('#cup-widget-toggle').addEventListener('click', () => {
      this.toggleExpand();
    });
  }
  
  async injectIntoSidebar() {
    const sidebar = this.findSidebar();
    
    if (!sidebar) {
      window.CUP.log('SidebarUI: No sidebar found, using floating widget');
      this.container.classList.add('cup-floating');
      document.body.appendChild(this.container);
      return;
    }
    
    const starredSection = sidebar.querySelector('[class*="starred"]') ||
                          sidebar.querySelector('[class*="Starred"]');
    
    if (starredSection && starredSection.parentNode) {
      starredSection.parentNode.insertBefore(this.container, starredSection.nextSibling);
    } else {
      const firstSection = sidebar.querySelector('div > ul') || sidebar.firstElementChild;
      if (firstSection && firstSection.parentNode) {
        firstSection.parentNode.insertBefore(this.container, firstSection.nextSibling);
      } else {
        sidebar.appendChild(this.container);
      }
    }
    
    window.CUP.log('SidebarUI: Injected into sidebar');
  }
  
  toggleExpand() {
    this.isExpanded = !this.isExpanded;
    const details = document.getElementById('cup-widget-details');
    const icon = document.getElementById('cup-expand-icon');
    
    if (details) details.classList.toggle('expanded', this.isExpanded);
    if (icon) icon.textContent = this.isExpanded ? '▲' : '▼';
  }
  
  /**
   * Update UI with usage data
   */
  update(usageData) {
    if (!usageData) return;
    
    window.CUP.log('SidebarUI: Updating with data:', JSON.stringify(usageData));
    
    // Update Current Session
    if (usageData.currentSession) {
      this.updateSection('session', usageData.currentSession.percent, usageData.currentSession.resetsIn, 'in');
    }
    
    // Update Weekly All Models
    if (usageData.weeklyAllModels) {
      this.updateSection('weekly-all', usageData.weeklyAllModels.percent, usageData.weeklyAllModels.resetsAt, 'at');
    }
    
    // Update Weekly Sonnet
    if (usageData.weeklySonnet) {
      this.updateSection('weekly-sonnet', usageData.weeklySonnet.percent, usageData.weeklySonnet.resetsIn, 'in');
    }
    
    // Update current model
    this.updateCurrentModel(usageData.currentModel);
  }
  
  updateSection(section, percent, resetTime, resetType) {
    const percentEl = document.getElementById(`cup-${section}-percent`);
    const barEl = document.getElementById(`cup-${section}-bar`);
    const metaEl = document.getElementById(`cup-${section}-meta`);
    
    if (percentEl) {
      percentEl.textContent = percent + '%';
      
      // Color based on percentage
      percentEl.style.color = percent >= 90 ? 'var(--cup-danger)' : 
                              percent >= 70 ? 'var(--cup-warning)' : 
                              'var(--cup-success)';
    }
    
    if (barEl) {
      barEl.style.width = Math.min(percent, 100) + '%';
      barEl.style.background = percent >= 90 ? 'var(--cup-danger)' : 
                               percent >= 70 ? 'var(--cup-warning)' : 
                               'var(--cup-accent)';
    }
    
    if (metaEl && resetTime) {
      metaEl.textContent = resetType === 'in' ? `Resets in ${resetTime}` : `Resets ${resetTime}`;
    }
  }
  
  updateCurrentModel(model) {
    const badge = document.getElementById('cup-current-model');
    if (!badge) return;
    
    const m = (model || 'sonnet').toLowerCase();
    
    badge.className = 'cup-model-badge';
    
    if (m.includes('opus')) {
      badge.textContent = 'Opus 4.5';
      badge.classList.add('cup-badge-opus');
    } else if (m.includes('haiku')) {
      badge.textContent = 'Haiku 4.5';
      badge.classList.add('cup-badge-haiku');
    } else {
      badge.textContent = 'Sonnet 4.5';
      badge.classList.add('cup-badge-sonnet');
    }
  }
  
  checkAndReinject() {
    if (!document.getElementById('cup-sidebar-widget')) {
      this.injectIntoSidebar();
    }
  }
}

window.SidebarUI = SidebarUI;
window.CUP.log('SidebarUI loaded');
