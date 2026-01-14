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
    for (let i = 0; i < 30; i++) {
      // Wait for Starred section to appear as indicator sidebar is ready
      const starred = this.findStarredSection();
      if (starred) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  }
  
  findStarredSection() {
    // Find element that contains "Starred" text
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    while (walker.nextNode()) {
      if (walker.currentNode.textContent.trim() === 'Starred') {
        return walker.currentNode.parentElement;
      }
    }
    return null;
  }
  
  findCodeSection() {
    // Find the Code link/section
    const allLinks = document.querySelectorAll('a, button, div');
    for (const el of allLinks) {
      const text = el.textContent?.trim();
      if (text === 'Code' && el.querySelector('svg, [class*="icon"]')) {
        return el;
      }
    }
    
    // Fallback: find by text content
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    while (walker.nextNode()) {
      if (walker.currentNode.textContent.trim() === 'Code') {
        return walker.currentNode.parentElement;
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
    `;
    
    this.container.querySelector('#cup-widget-toggle').addEventListener('click', () => {
      this.toggleExpand();
    });
  }
  
  async injectIntoSidebar() {
    // Strategy: Find "Starred" text element, then find its container, 
    // and insert our widget right before that container
    
    const starredTextEl = this.findStarredSection();
    
    if (!starredTextEl) {
      window.CUP.log('SidebarUI: Starred section not found, using floating');
      this.container.classList.add('cup-floating');
      document.body.appendChild(this.container);
      return;
    }
    
    // The "Starred" text is inside a heading/label element
    // We need to find its parent container that represents the whole "Starred" section
    // This is typically a few levels up
    
    let starredSection = starredTextEl;
    
    // Walk up to find the section container
    // We're looking for a container that has siblings (other sections like Code, Artifacts, etc)
    for (let i = 0; i < 5; i++) {
      const parent = starredSection.parentElement;
      if (!parent) break;
      
      // Check if parent has multiple children that look like nav sections
      const siblings = Array.from(parent.children);
      if (siblings.length > 1) {
        // Found the level with multiple sections
        // Insert before the Starred section at this level
        parent.insertBefore(this.container, starredSection);
        window.CUP.log('SidebarUI: Injected before Starred at level', i);
        return;
      }
      
      starredSection = parent;
    }
    
    // Fallback: just insert before whatever element we found
    if (starredTextEl.parentElement) {
      starredTextEl.parentElement.insertBefore(this.container, starredTextEl);
      window.CUP.log('SidebarUI: Fallback - inserted before Starred text parent');
    } else {
      this.container.classList.add('cup-floating');
      document.body.appendChild(this.container);
      window.CUP.log('SidebarUI: Using floating widget');
    }
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
