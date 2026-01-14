/**
 * Claude Usage Pro - Sidebar UI
 * Shows usage percentages in a clear, easy-to-read format
 */

class SidebarUI {
  constructor() {
    this.container = null;
    this.isExpanded = true; // Start expanded
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
          <span class="cup-model-badge" id="cup-current-model">Sonnet</span>
        </div>
        
        <!-- Quick link to usage page -->
        <a href="https://claude.ai/settings/usage" class="cup-usage-link" target="_self">
          View full usage details →
        </a>
      </div>
    `;
    
    // Toggle handler
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
    
    // Find injection point after Starred section
    const starredSection = sidebar.querySelector('[class*="starred"]') ||
                          sidebar.querySelector('[class*="Starred"]');
    
    if (starredSection && starredSection.parentNode) {
      starredSection.parentNode.insertBefore(this.container, starredSection.nextSibling);
      window.CUP.log('SidebarUI: Injected after Starred');
    } else {
      // Find first section and insert after
      const firstSection = sidebar.querySelector('div > ul') || sidebar.firstElementChild;
      if (firstSection && firstSection.parentNode) {
        firstSection.parentNode.insertBefore(this.container, firstSection.nextSibling);
      } else {
        sidebar.appendChild(this.container);
      }
      window.CUP.log('SidebarUI: Injected into sidebar');
    }
  }
  
  toggleExpand() {
    this.isExpanded = !this.isExpanded;
    const details = document.getElementById('cup-widget-details');
    const icon = document.getElementById('cup-expand-icon');
    
    if (details) {
      details.classList.toggle('expanded', this.isExpanded);
    }
    if (icon) {
      icon.textContent = this.isExpanded ? '▲' : '▼';
    }
  }
  
  /**
   * Update with scraped usage data
   */
  update(usageData) {
    if (!usageData) return;
    
    // Handle scraped percentage data (from usage page)
    if (usageData.currentSession) {
      this.updateSection('session', usageData.currentSession);
    }
    if (usageData.weeklyAllModels) {
      this.updateSection('weekly-all', usageData.weeklyAllModels);
    }
    if (usageData.weeklySonnet) {
      this.updateSection('weekly-sonnet', usageData.weeklySonnet);
    }
    
    // Handle legacy token-based data (convert to percentage)
    if (usageData.modelUsage && !usageData.currentSession) {
      const cap = usageData.usageCap || 45000000;
      let total = 0;
      
      const modelUsage = usageData.modelUsage;
      total += (modelUsage['claude-sonnet-4'] || 0);
      total += (modelUsage['claude-opus-4'] || 0) * 5;
      total += (modelUsage['claude-haiku-4'] || 0) * 0.2;
      
      const percent = Math.round((total / cap) * 100);
      
      this.updateSection('session', {
        percent: percent,
        resetsIn: this.formatResetTime(usageData.resetTimestamp)
      });
    }
    
    // Update current model
    if (usageData.currentModel) {
      this.updateCurrentModel(usageData.currentModel);
    }
  }
  
  updateSection(section, data) {
    const percentEl = document.getElementById(`cup-${section}-percent`);
    const barEl = document.getElementById(`cup-${section}-bar`);
    const metaEl = document.getElementById(`cup-${section}-meta`);
    
    if (percentEl && data.percent !== undefined) {
      percentEl.textContent = data.percent + '%';
      
      // Color based on percentage
      if (data.percent >= 90) {
        percentEl.style.color = 'var(--cup-danger)';
      } else if (data.percent >= 70) {
        percentEl.style.color = 'var(--cup-warning)';
      } else {
        percentEl.style.color = 'var(--cup-success)';
      }
    }
    
    if (barEl && data.percent !== undefined) {
      barEl.style.width = Math.min(data.percent, 100) + '%';
      
      if (data.percent >= 90) {
        barEl.style.background = 'var(--cup-danger)';
      } else if (data.percent >= 70) {
        barEl.style.background = 'var(--cup-warning)';
      } else {
        barEl.style.background = 'var(--cup-accent)';
      }
    }
    
    if (metaEl) {
      if (data.resetsIn) {
        metaEl.textContent = `Resets in ${data.resetsIn}`;
      } else if (data.resetsAt) {
        metaEl.textContent = `Resets ${data.resetsAt}`;
      }
    }
  }
  
  updateCurrentModel(model) {
    const badge = document.getElementById('cup-current-model');
    if (!badge) return;
    
    const modelLower = (model || '').toLowerCase();
    
    if (modelLower.includes('opus')) {
      badge.textContent = 'Opus 4.5';
      badge.className = 'cup-model-badge cup-badge-opus';
    } else if (modelLower.includes('haiku')) {
      badge.textContent = 'Haiku 4.5';
      badge.className = 'cup-model-badge cup-badge-haiku';
    } else {
      badge.textContent = 'Sonnet 4.5';
      badge.className = 'cup-model-badge cup-badge-sonnet';
    }
  }
  
  formatResetTime(timestamp) {
    if (!timestamp) return '--';
    const ms = timestamp - Date.now();
    if (ms <= 0) return 'now';
    
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
  
  checkAndReinject() {
    if (!document.getElementById('cup-sidebar-widget')) {
      this.injectIntoSidebar();
    }
  }
}

window.SidebarUI = SidebarUI;
window.CUP.log('SidebarUI loaded');
