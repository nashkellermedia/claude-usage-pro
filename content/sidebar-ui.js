/**
 * Claude Usage Pro - Sidebar UI Component
 * 
 * Features:
 * - Progress bar with percentage
 * - Model breakdown (Sonnet/Opus/Haiku)
 * - Reset countdown timer
 * - Expandable details view
 * - Color-coded warnings
 */

class SidebarUI {
  constructor() {
    this.container = null;
    this.isExpanded = false;
    this.initialized = false;
  }
  
  async initialize() {
    window.CUP.log('SidebarUI: Initializing...');
    
    this.buildUI();
    
    // Try to find sidebar
    const sidebar = await this.findSidebar();
    if (sidebar) {
      this.injectIntoSidebar(sidebar);
    } else {
      window.CUP.log('SidebarUI: Sidebar not found, will create floating widget');
      this.createFloatingWidget();
    }
    
    this.initialized = true;
    window.CUP.log('SidebarUI: Initialized successfully');
  }
  
  buildUI() {
    this.container = document.createElement('div');
    this.container.id = 'cup-sidebar-widget';
    this.container.innerHTML = `
      <div class="cup-widget-header" id="cup-widget-toggle">
        <span class="cup-widget-icon">📊</span>
        <span class="cup-widget-title">Usage</span>
        <span class="cup-widget-percent" id="cup-sidebar-percent">0%</span>
        <span class="cup-widget-expand">▼</span>
      </div>
      
      <div class="cup-widget-progress-container">
        <div class="cup-widget-progress-bg">
          <div class="cup-widget-progress-bar" id="cup-sidebar-progress"></div>
        </div>
      </div>
      
      <div class="cup-widget-details" id="cup-widget-details">
        <div class="cup-widget-section">
          <div class="cup-widget-label">Total Used</div>
          <div class="cup-widget-value" id="cup-sidebar-used">0</div>
        </div>
        
        <div class="cup-widget-section">
          <div class="cup-widget-label">Remaining</div>
          <div class="cup-widget-value" id="cup-sidebar-remaining">45M</div>
        </div>
        
        <div class="cup-widget-divider"></div>
        
        <div class="cup-widget-section cup-model-section">
          <div class="cup-widget-label">By Model</div>
          <div class="cup-model-row">
            <span class="cup-model-dot cup-dot-sonnet"></span>
            <span class="cup-model-name">Sonnet (1x)</span>
            <span class="cup-model-value" id="cup-sidebar-sonnet">0</span>
          </div>
          <div class="cup-model-row">
            <span class="cup-model-dot cup-dot-opus"></span>
            <span class="cup-model-name">Opus (5x)</span>
            <span class="cup-model-value" id="cup-sidebar-opus">0</span>
          </div>
          <div class="cup-model-row">
            <span class="cup-model-dot cup-dot-haiku"></span>
            <span class="cup-model-name">Haiku (0.2x)</span>
            <span class="cup-model-value" id="cup-sidebar-haiku">0</span>
          </div>
        </div>
        
        <div class="cup-widget-divider"></div>
        
        <div class="cup-widget-section">
          <div class="cup-widget-label">Messages</div>
          <div class="cup-widget-value" id="cup-sidebar-messages">0</div>
        </div>
        
        <div class="cup-widget-section">
          <div class="cup-widget-label">Resets In</div>
          <div class="cup-widget-value cup-reset-countdown" id="cup-sidebar-reset">--:--</div>
        </div>
        
        <div class="cup-widget-section cup-sync-section">
          <div class="cup-widget-label">Last Sync</div>
          <div class="cup-widget-value cup-sync-time" id="cup-sidebar-sync">Never</div>
        </div>
      </div>
    `;
    
    // Add toggle listener
    setTimeout(() => {
      const toggle = document.getElementById('cup-widget-toggle');
      if (toggle) {
        toggle.addEventListener('click', () => this.toggleExpand());
      }
    }, 100);
    
    window.CUP.log('SidebarUI: Built UI elements');
  }
  
  async findSidebar() {
    const selectors = [
      'nav.flex-col',
      'nav[aria-label*="Sidebar"]',
      '[class*="sidebar"]',
      'aside',
      '[class*="side-nav"]'
    ];
    
    for (const sel of selectors) {
      const sidebar = document.querySelector(sel);
      if (sidebar) {
        window.CUP.log('Found sidebar with selector:', sel);
        return sidebar;
      }
    }
    return null;
  }
  
  injectIntoSidebar(sidebar) {
    // Look for a good injection point
    const targets = [
      '[class*="starred"]',
      '[class*="recent"]',
      '[class*="history"]',
      'ul',
      'div'
    ];
    
    let injectionPoint = null;
    for (const sel of targets) {
      const el = sidebar.querySelector(sel);
      if (el) {
        injectionPoint = el;
        window.CUP.log('SidebarUI: Found injection point near:', sel);
        break;
      }
    }
    
    if (injectionPoint) {
      injectionPoint.parentNode.insertBefore(this.container, injectionPoint);
    } else {
      sidebar.insertBefore(this.container, sidebar.firstChild);
    }
    
    this.container.classList.add('cup-in-sidebar');
    window.CUP.log('SidebarUI: Injected successfully');
  }
  
  createFloatingWidget() {
    this.container.classList.add('cup-floating');
    document.body.appendChild(this.container);
    window.CUP.log('SidebarUI: Created floating widget');
  }
  
  toggleExpand() {
    this.isExpanded = !this.isExpanded;
    const details = document.getElementById('cup-widget-details');
    const expand = this.container.querySelector('.cup-widget-expand');
    
    if (details) {
      details.style.display = this.isExpanded ? 'block' : 'none';
    }
    if (expand) {
      expand.textContent = this.isExpanded ? '▲' : '▼';
    }
  }
  
  update(usageData) {
    if (!usageData) return;
    
    window.CUP.log('SidebarUI.update() called');
    
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
    
    window.CUP.log(`SidebarUI.update: percentage=${percentage.toFixed(2)}%, weighted=${weightedTotal}, cap=${cap}`);
    
    // Update percentage display
    const percentEl = document.getElementById('cup-sidebar-percent');
    if (percentEl) {
      percentEl.textContent = percentage.toFixed(1) + '%';
      
      // Color based on usage
      if (percentage >= 90) {
        percentEl.style.color = '#ef4444';
      } else if (percentage >= 70) {
        percentEl.style.color = '#f59e0b';
      } else {
        percentEl.style.color = '#22c55e';
      }
      window.CUP.log(`SidebarUI.update: Updated percentage to ${percentage.toFixed(1)}%`);
    }
    
    // Update progress bar
    const progressEl = document.getElementById('cup-sidebar-progress');
    if (progressEl) {
      progressEl.style.width = Math.min(percentage, 100) + '%';
      
      if (percentage >= 90) {
        progressEl.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
      } else if (percentage >= 70) {
        progressEl.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
      } else {
        progressEl.style.background = 'linear-gradient(90deg, #2563eb, #8b5cf6)';
      }
      window.CUP.log(`SidebarUI.update: Updated progress bar to ${percentage}%`);
    }
    
    // Update totals
    this.updateElement('cup-sidebar-used', this.formatNumber(weightedTotal));
    this.updateElement('cup-sidebar-remaining', this.formatNumber(remaining));
    
    // Update model breakdown
    this.updateElement('cup-sidebar-sonnet', this.formatNumber(modelUsage['claude-sonnet-4'] || 0));
    this.updateElement('cup-sidebar-opus', this.formatNumber(modelUsage['claude-opus-4'] || 0));
    this.updateElement('cup-sidebar-haiku', this.formatNumber(modelUsage['claude-haiku-4'] || 0));
    
    // Update messages count
    this.updateElement('cup-sidebar-messages', (usageData.messagesCount || 0).toLocaleString());
    
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
      window.CUP.log(`SidebarUI.update: Updated reset time`);
    }
    
    // Update sync time
    if (usageData.lastSynced) {
      const ago = Math.round((Date.now() - usageData.lastSynced) / 60000);
      this.updateElement('cup-sidebar-sync', ago < 1 ? 'Just now' : `${ago}m ago`);
    }
    
    window.CUP.log('SidebarUI.update: Complete');
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
      this.initialize();
    }
  }
}

window.SidebarUI = SidebarUI;
window.CUP.log('SidebarUI class loaded');
