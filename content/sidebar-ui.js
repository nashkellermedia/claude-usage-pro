/**
 * Claude Usage Pro - Sidebar UI
 * Integrates seamlessly into Claude's existing sidebar
 */

class SidebarUI {
  constructor() {
    this.container = null;
    this.isExpanded = false;
    this.initialized = false;
  }
  
  async initialize() {
    window.CUP.log('SidebarUI: Initializing...');
    
    // Wait for sidebar to be available
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
    // Claude.ai sidebar selectors
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
        // Check if it looks like a sidebar (has chat links, etc)
        if (el.querySelector('a[href*="/chat"]') || 
            el.querySelector('[class*="starred"]') ||
            el.querySelector('[class*="recent"]') ||
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
        <span class="cup-widget-percent" id="cup-sidebar-percent">0%</span>
        <span class="cup-widget-expand" id="cup-expand-icon">▼</span>
      </div>
      
      <div class="cup-widget-progress-container">
        <div class="cup-widget-progress-bg">
          <div class="cup-widget-progress-bar" id="cup-sidebar-progress"></div>
        </div>
      </div>
      
      <div class="cup-widget-details" id="cup-widget-details">
        <div class="cup-widget-section">
          <span class="cup-widget-label">Used</span>
          <span class="cup-widget-value" id="cup-sidebar-used">0</span>
        </div>
        
        <div class="cup-widget-section">
          <span class="cup-widget-label">Remaining</span>
          <span class="cup-widget-value" id="cup-sidebar-remaining">45M</span>
        </div>
        
        <div class="cup-widget-divider"></div>
        
        <div class="cup-widget-section cup-model-section">
          <span class="cup-widget-label">By Model</span>
          <div class="cup-model-row">
            <span class="cup-model-dot cup-dot-sonnet"></span>
            <span class="cup-model-name">Sonnet</span>
            <span class="cup-model-value" id="cup-sidebar-sonnet">0</span>
          </div>
          <div class="cup-model-row">
            <span class="cup-model-dot cup-dot-opus"></span>
            <span class="cup-model-name">Opus (5x)</span>
            <span class="cup-model-value" id="cup-sidebar-opus">0</span>
          </div>
          <div class="cup-model-row">
            <span class="cup-model-dot cup-dot-haiku"></span>
            <span class="cup-model-name">Haiku</span>
            <span class="cup-model-value" id="cup-sidebar-haiku">0</span>
          </div>
        </div>
        
        <div class="cup-widget-divider"></div>
        
        <div class="cup-widget-section">
          <span class="cup-widget-label">Resets in</span>
          <span class="cup-widget-value cup-reset-countdown" id="cup-sidebar-reset">--:--</span>
        </div>
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
    
    // Find the best injection point - after "Starred" section
    const injectionPoints = [
      sidebar.querySelector('[class*="starred"]'),
      sidebar.querySelector('[class*="Starred"]'),
      sidebar.querySelector('div > ul'),
      sidebar.querySelector('[class*="recent"]'),
      sidebar.firstElementChild
    ];
    
    let injectionPoint = null;
    for (const point of injectionPoints) {
      if (point) {
        injectionPoint = point;
        break;
      }
    }
    
    if (injectionPoint && injectionPoint.parentNode) {
      // Insert after the injection point
      injectionPoint.parentNode.insertBefore(this.container, injectionPoint.nextSibling);
      window.CUP.log('SidebarUI: Injected after', injectionPoint.className || 'element');
    } else {
      // Fallback: prepend to sidebar
      sidebar.insertBefore(this.container, sidebar.firstChild);
      window.CUP.log('SidebarUI: Prepended to sidebar');
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
  
  update(usageData) {
    if (!usageData) return;
    
    const modelUsage = usageData.modelUsage || {};
    const multipliers = {
      'claude-sonnet-4': 1.0,
      'claude-haiku-4': 0.2,
      'claude-opus-4': 5.0
    };
    
    // Calculate weighted total
    let weightedTotal = 0;
    for (const [model, tokens] of Object.entries(modelUsage)) {
      weightedTotal += tokens * (multipliers[model] || 1.0);
    }
    
    const cap = usageData.usageCap || 45000000;
    const percentage = (weightedTotal / cap) * 100;
    const remaining = Math.max(0, cap - weightedTotal);
    
    // Update percentage
    const percentEl = document.getElementById('cup-sidebar-percent');
    if (percentEl) {
      percentEl.textContent = percentage.toFixed(1) + '%';
      
      // Color based on usage level
      if (percentage >= 90) {
        percentEl.style.color = 'var(--cup-danger)';
      } else if (percentage >= 70) {
        percentEl.style.color = 'var(--cup-warning)';
      } else {
        percentEl.style.color = 'var(--cup-success)';
      }
    }
    
    // Update progress bar
    const progressEl = document.getElementById('cup-sidebar-progress');
    if (progressEl) {
      progressEl.style.width = Math.min(percentage, 100) + '%';
      
      if (percentage >= 90) {
        progressEl.style.background = 'var(--cup-danger)';
      } else if (percentage >= 70) {
        progressEl.style.background = 'var(--cup-warning)';
      } else {
        progressEl.style.background = 'var(--cup-accent)';
      }
    }
    
    // Update text values
    this.updateElement('cup-sidebar-used', this.formatNumber(weightedTotal));
    this.updateElement('cup-sidebar-remaining', this.formatNumber(remaining));
    this.updateElement('cup-sidebar-sonnet', this.formatNumber(modelUsage['claude-sonnet-4'] || 0));
    this.updateElement('cup-sidebar-opus', this.formatNumber(modelUsage['claude-opus-4'] || 0));
    this.updateElement('cup-sidebar-haiku', this.formatNumber(modelUsage['claude-haiku-4'] || 0));
    
    // Update reset time
    if (usageData.resetTimestamp) {
      const msRemaining = usageData.resetTimestamp - Date.now();
      if (msRemaining > 0) {
        const hours = Math.floor(msRemaining / (1000 * 60 * 60));
        const mins = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
        this.updateElement('cup-sidebar-reset', `${hours}h ${mins}m`);
      } else {
        this.updateElement('cup-sidebar-reset', 'Now!');
      }
    }
  }
  
  updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  
  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  }
  
  checkAndReinject() {
    if (!document.getElementById('cup-sidebar-widget')) {
      this.injectIntoSidebar();
    }
  }
}

window.SidebarUI = SidebarUI;
window.CUP.log('SidebarUI loaded');
