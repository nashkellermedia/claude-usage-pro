/**
 * Claude Usage Pro - Sidebar UI
 * 
 * DOM Structure (from analysis):
 * Level 0: H3 "Starred"
 * Level 1: DIV.flex.flex-col.mb-4 (2 children: H3, UL)
 * Level 2: DIV.px-2.mt-4 (2 children: DIV.flex, DIV.flex) <-- Starred section container
 * Level 3: DIV.opacity-100
 * 
 * We need to insert BEFORE the DIV.px-2.mt-4 at Level 2
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
    for (let i = 0; i < 30; i++) {
      const starred = this.findStarredH3();
      if (starred) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  }
  
  findStarredH3() {
    const h3s = document.querySelectorAll('h3');
    for (const h3 of h3s) {
      if (h3.textContent?.trim() === 'Starred') {
        return h3;
      }
    }
    return null;
  }
  
  buildUI() {
    // Match Claude's sidebar structure: DIV.px-2.mt-4 containing our content
    this.container = document.createElement('div');
    this.container.id = 'cup-sidebar-widget';
    this.container.className = 'px-2 mt-4'; // Match Claude's styling
    this.container.innerHTML = `
      <div class="cup-widget-inner">
        <div class="cup-widget-header" id="cup-widget-toggle">
          <span class="cup-widget-icon">📊</span>
          <span class="cup-widget-title">Usage</span>
          <span class="cup-widget-expand" id="cup-expand-icon">▲</span>
        </div>
        
        <div class="cup-widget-details expanded" id="cup-widget-details">
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
          
          <div class="cup-usage-section">
            <div class="cup-usage-header">
              <span class="cup-usage-label">Weekly (Sonnet)</span>
              <span class="cup-usage-percent" id="cup-weekly-sonnet-percent">--%</span>
            </div>
            <div class="cup-usage-bar-bg">
              <div class="cup-usage-bar" id="cup-weekly-sonnet-bar"></div>
            </div>
            <div class="cup-usage-meta" id="cup-weekly-sonnet-meta">Resets in --</div>
          </div>
          
          <div class="cup-model-indicator">
            <span class="cup-model-label">Current:</span>
            <span class="cup-model-badge" id="cup-current-model">Sonnet 4.5</span>
          </div>
          
          <a href="https://claude.ai/settings/usage" class="cup-usage-link" target="_self">
            View full usage details →
          </a>
        </div>
      </div>
    `;
    
    this.container.querySelector('#cup-widget-toggle').addEventListener('click', () => {
      this.toggleExpand();
    });
  }
  
  async injectIntoSidebar() {
    const starredH3 = this.findStarredH3();
    
    if (!starredH3) {
      window.CUP.log('SidebarUI: Starred H3 not found');
      this.container.classList.add('cup-floating');
      document.body.appendChild(this.container);
      return;
    }
    
    // Navigate up the DOM:
    // H3 (Level 0) → DIV.flex.flex-col.mb-4 (Level 1) → DIV.px-2.mt-4 (Level 2)
    const level1 = starredH3.parentElement; // DIV.flex.flex-col.mb-4
    const level2 = level1?.parentElement;   // DIV.px-2.mt-4
    
    if (level2 && level2.classList.contains('px-2')) {
      // Insert our widget BEFORE level2 (the Starred section container)
      // into level2's parent (DIV.opacity-100)
      const level3 = level2.parentElement;
      if (level3) {
        level3.insertBefore(this.container, level2);
        window.CUP.log('SidebarUI: Inserted before DIV.px-2.mt-4 (Starred container)');
        return;
      }
    }
    
    // Fallback
    window.CUP.log('SidebarUI: Fallback - could not find correct insertion point');
    this.container.classList.add('cup-floating');
    document.body.appendChild(this.container);
  }
  
  toggleExpand() {
    this.isExpanded = !this.isExpanded;
    const details = document.getElementById('cup-widget-details');
    const icon = document.getElementById('cup-expand-icon');
    
    if (details) details.classList.toggle('expanded', this.isExpanded);
    if (icon) icon.textContent = this.isExpanded ? '▲' : '▼';
  }
  
  update(usageData) {
    if (!usageData) return;
    
    if (usageData.currentSession) {
      this.updateSection('session', usageData.currentSession.percent, usageData.currentSession.resetsIn, 'in');
    }
    
    if (usageData.weeklyAllModels) {
      this.updateSection('weekly-all', usageData.weeklyAllModels.percent, usageData.weeklyAllModels.resetsAt, 'at');
    }
    
    if (usageData.weeklySonnet) {
      this.updateSection('weekly-sonnet', usageData.weeklySonnet.percent, usageData.weeklySonnet.resetsIn, 'in');
    }
    
    this.updateCurrentModel(usageData.currentModel);
  }
  
  updateSection(section, percent, resetTime, resetType) {
    const percentEl = document.getElementById(`cup-${section}-percent`);
    const barEl = document.getElementById(`cup-${section}-bar`);
    const metaEl = document.getElementById(`cup-${section}-meta`);
    
    if (percentEl) {
      percentEl.textContent = percent + '%';
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
