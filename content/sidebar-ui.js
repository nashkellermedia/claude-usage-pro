/**
 * Claude Usage Pro - Sidebar UI
 * 
 * Embeds usage information directly into Claude's sidebar,
 * appearing between Starred and Recent conversations.
 */

class SidebarUI {
  constructor() {
    this.container = null;
    this.progressBar = null;
    this.percentageDisplay = null;
    this.resetTimeDisplay = null;
    this.tooltip = null;
    this.isInjected = false;
  }
  
  /**
   * Initialize and inject the sidebar UI
   */
  async initialize() {
    window.CUP.log('SidebarUI: Initializing...');
    
    // Build the UI elements
    this.buildUI();
    
    // Find injection point and inject
    const success = await this.inject();
    
    if (success) {
      window.CUP.log('SidebarUI: Initialized successfully');
    } else {
      window.CUP.logWarn('SidebarUI: Could not inject into sidebar');
    }
  }
  
  /**
   * Build the sidebar UI components
   */
  buildUI() {
    // Main container
    this.container = document.createElement('div');
    this.container.className = 'cup-sidebar-section';
    this.container.id = 'cup-sidebar-usage';
    this.container.style.cssText = `
      margin: 0 8px 16px 8px;
      padding: 12px;
      background: var(--bg-200, rgba(0,0,0,0.05));
      border-radius: 8px;
      font-family: inherit;
    `;
    
    // Header row
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    `;
    
    const title = document.createElement('span');
    title.style.cssText = `
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-500, #6b7280);
    `;
    title.textContent = '📊 USAGE';
    
    // Settings button (optional)
    const settingsBtn = document.createElement('button');
    settingsBtn.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px;
      color: var(--text-400, #9ca3af);
      font-size: 12px;
    `;
    settingsBtn.textContent = '⚙️';
    settingsBtn.title = 'Open Usage Dashboard';
    settingsBtn.addEventListener('click', () => {
      // Open popup by clicking extension icon (can't do programmatically)
      window.CUP.log('Settings clicked - open extension popup');
    });
    
    header.appendChild(title);
    header.appendChild(settingsBtn);
    
    // Stats row
    const statsRow = document.createElement('div');
    statsRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 12px;
    `;
    
    // Left: percentage
    this.percentageDisplay = document.createElement('span');
    this.percentageDisplay.id = 'cup-percentage';
    this.percentageDisplay.style.cssText = `
      font-weight: 600;
      color: #2c84db;
    `;
    this.percentageDisplay.textContent = '0%';
    
    // Right: reset time
    this.resetTimeDisplay = document.createElement('span');
    this.resetTimeDisplay.id = 'cup-reset-time';
    this.resetTimeDisplay.style.cssText = `
      color: var(--text-400, #9ca3af);
      font-size: 11px;
    `;
    this.resetTimeDisplay.textContent = 'Reset: --';
    
    statsRow.appendChild(this.percentageDisplay);
    statsRow.appendChild(this.resetTimeDisplay);
    
    // Progress bar container
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
      height: 6px;
      background: var(--bg-300, rgba(0,0,0,0.1));
      border-radius: 3px;
      overflow: hidden;
      cursor: help;
    `;
    
    this.progressBar = document.createElement('div');
    this.progressBar.id = 'cup-progress-bar';
    this.progressBar.style.cssText = `
      height: 100%;
      width: 0%;
      background: #2c84db;
      border-radius: 3px;
      transition: width 0.3s ease, background-color 0.3s ease;
    `;
    
    progressContainer.appendChild(this.progressBar);
    
    // Tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.style.cssText = `
      position: fixed;
      background: var(--bg-500, #374151);
      color: var(--text-100, #f3f4f6);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 11px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
      z-index: 99999;
      white-space: nowrap;
    `;
    this.tooltip.textContent = '0 / 0 tokens (0%)';
    document.body.appendChild(this.tooltip);
    
    window.CUP.setupTooltip(progressContainer, this.tooltip);
    
    // Assemble
    this.container.appendChild(header);
    this.container.appendChild(statsRow);
    this.container.appendChild(progressContainer);
    
    window.CUP.log('SidebarUI: Built UI elements');
  }
  
  /**
   * Find sidebar and inject our UI
   */
  async inject() {
    window.CUP.log('SidebarUI: Looking for sidebar...');
    
    // Wait a bit for the page to fully render
    await window.CUP.sleep(1000);
    
    // Try to find sidebar
    const sidebar = window.CUP.findSidebar();
    
    if (!sidebar) {
      window.CUP.logWarn('SidebarUI: Sidebar not found');
      return false;
    }
    
    window.CUP.log('SidebarUI: Found sidebar:', sidebar);
    
    // Look for a good injection point
    // Try to find the scrollable container
    const scrollContainer = sidebar.querySelector('.overflow-y-auto') || 
                           sidebar.querySelector('[class*="overflow"]') ||
                           sidebar;
    
    // Look for "Starred" or "Recents" section headers
    const sections = scrollContainer.querySelectorAll('h3, [class*="text-xs"], [class*="uppercase"]');
    let injectionPoint = null;
    
    for (const section of sections) {
      const text = section.textContent.toLowerCase();
      if (text.includes('starred') || text.includes('recent') || text.includes('today')) {
        injectionPoint = section.closest('div') || section.parentElement;
        window.CUP.log('SidebarUI: Found injection point near:', text);
        break;
      }
    }
    
    // If no section found, try to inject at the top of the scrollable area
    if (!injectionPoint) {
      const innerContainer = scrollContainer.querySelector('.flex.flex-col') || 
                            scrollContainer.querySelector('[class*="flex-col"]') ||
                            scrollContainer;
      
      if (innerContainer && innerContainer.firstChild) {
        injectionPoint = innerContainer.firstChild;
        window.CUP.log('SidebarUI: Using first child as injection point');
      }
    }
    
    // Inject our container
    if (injectionPoint) {
      injectionPoint.parentNode.insertBefore(this.container, injectionPoint);
      this.isInjected = true;
      window.CUP.log('SidebarUI: Injected successfully');
      return true;
    } else {
      // Fallback: append to scrollContainer
      scrollContainer.prepend(this.container);
      this.isInjected = true;
      window.CUP.log('SidebarUI: Injected at top of sidebar');
      return true;
    }
  }
  
  /**
   * Check if UI is still in DOM and reinject if needed
   */
  async checkAndReinject() {
    if (!document.contains(this.container)) {
      window.CUP.log('SidebarUI: Container removed, reinjecting...');
      this.isInjected = false;
      await this.inject();
    }
  }
  
  /**
   * Update the display with usage data
   */
  update(usageData) {
    window.CUP.log('SidebarUI.update() called');
    
    if (!usageData) {
      window.CUP.logWarn('SidebarUI.update: usageData is null/undefined');
      return;
    }
    
    try {
      const percentage = usageData.getUsagePercentage();
      const weighted = usageData.getWeightedTotal();
      const cap = usageData.usageCap;
      const resetInfo = usageData.getResetTimeInfo();
      
      window.CUP.log('SidebarUI.update: percentage=' + percentage.toFixed(2) + '%, weighted=' + weighted + ', cap=' + cap);
      
      // Get color based on percentage
      let color = '#2c84db'; // Blue
      if (percentage >= 95) color = '#de2929'; // Red
      else if (percentage >= 80) color = '#f59e0b'; // Yellow
      
      // Update percentage display
      if (this.percentageDisplay) {
        this.percentageDisplay.textContent = percentage.toFixed(1) + '%';
        this.percentageDisplay.style.color = color;
        window.CUP.log('SidebarUI.update: Updated percentage to ' + this.percentageDisplay.textContent);
      } else {
        window.CUP.logError('percentageDisplay element is null!');
      }
      
      // Update progress bar
      if (this.progressBar) {
        this.progressBar.style.width = Math.min(percentage, 100) + '%';
        this.progressBar.style.backgroundColor = color;
        window.CUP.log('SidebarUI.update: Updated progress bar to ' + this.progressBar.style.width);
      } else {
        window.CUP.logError('progressBar element is null!');
      }
      
      // Update reset time
      if (this.resetTimeDisplay) {
        if (resetInfo.expired) {
          this.resetTimeDisplay.innerHTML = '<span style="color: #22c55e">Reset: Now!</span>';
        } else {
          this.resetTimeDisplay.textContent = 'Reset: ' + resetInfo.formatted;
        }
        window.CUP.log('SidebarUI.update: Updated reset time to ' + this.resetTimeDisplay.textContent);
      } else {
        window.CUP.logError('resetTimeDisplay element is null!');
      }
      
      // Update tooltip
      if (this.tooltip) {
        const formatted = this.formatNumber(weighted) + ' / ' + this.formatNumber(cap) + ' tokens (' + percentage.toFixed(1) + '%)';
        this.tooltip.textContent = formatted;
      }
      
      window.CUP.log('SidebarUI.update: Complete');
      
    } catch (error) {
      window.CUP.logError('SidebarUI.update error:', error);
    }
  }
  
  /**
   * Format large numbers
   */
  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  }
}

// Expose globally
window.SidebarUI = SidebarUI;

window.CUP.log('SidebarUI class loaded');
