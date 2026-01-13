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
    this.isInjected = false;
  }
  
  /**
   * Initialize and inject the sidebar UI
   */
  async initialize() {
    // Build the UI elements
    this.buildUI();
    
    // Find injection point and inject
    await this.inject();
    
    CUP.log('Sidebar UI initialized');
  }
  
  /**
   * Build the sidebar UI components
   */
  buildUI() {
    // Main container
    this.container = document.createElement('div');
    this.container.className = 'cup-sidebar-section flex flex-col mb-4';
    this.container.id = 'cup-sidebar-usage';
    
    // Header row
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between px-2 pb-2';
    
    const title = document.createElement('h3');
    title.className = 'text-text-500 text-xs select-none font-medium';
    title.textContent = 'Usage';
    
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'cup-settings-btn hover:bg-bg-400 rounded p-1 transition-colors';
    settingsBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 24 24" class="text-text-400 hover:text-text-200">
        <path d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
      </svg>
    `;
    settingsBtn.title = 'Usage Settings';
    settingsBtn.addEventListener('click', () => this.openSettings());
    
    header.appendChild(title);
    header.appendChild(settingsBtn);
    
    // Content area
    const content = document.createElement('div');
    content.className = 'px-2';
    
    // Stats row
    const statsRow = document.createElement('div');
    statsRow.className = 'flex items-center justify-between mb-1 text-xs';
    
    // Left side: percentage
    const leftStats = document.createElement('div');
    leftStats.className = 'flex items-center gap-1';
    
    const allLabel = document.createElement('span');
    allLabel.className = 'text-text-500';
    allLabel.textContent = 'All:';
    
    this.percentageDisplay = document.createElement('span');
    this.percentageDisplay.className = 'cup-percentage font-medium';
    this.percentageDisplay.style.color = CUP.COLORS.BLUE;
    this.percentageDisplay.textContent = '0%';
    
    leftStats.appendChild(allLabel);
    leftStats.appendChild(this.percentageDisplay);
    
    // Right side: reset time
    this.resetTimeDisplay = document.createElement('div');
    this.resetTimeDisplay.className = 'text-text-400 text-xs';
    this.resetTimeDisplay.textContent = 'Reset: --';
    
    statsRow.appendChild(leftStats);
    statsRow.appendChild(this.resetTimeDisplay);
    
    // Progress bar
    const progressContainer = document.createElement('div');
    progressContainer.className = 'cup-progress-container bg-bg-400 rounded-full h-1.5 overflow-hidden';
    
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'cup-progress-bar h-full transition-all duration-300';
    this.progressBar.style.width = '0%';
    this.progressBar.style.backgroundColor = CUP.COLORS.BLUE;
    
    progressContainer.appendChild(this.progressBar);
    
    // Tooltip for progress bar
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'cup-tooltip fixed bg-bg-500 text-text-100 text-xs px-2 py-1 rounded shadow-lg opacity-0 pointer-events-none transition-opacity z-50';
    this.tooltip.textContent = '0 / 0 tokens (0%)';
    document.body.appendChild(this.tooltip);
    
    CUP.setupTooltip(progressContainer, this.tooltip);
    
    // Assemble
    content.appendChild(statsRow);
    content.appendChild(progressContainer);
    
    this.container.appendChild(header);
    this.container.appendChild(content);
  }
  
  /**
   * Find sidebar containers and inject our UI
   */
  async inject() {
    // Wait for sidebar to be ready
    const sidebar = await CUP.waitForElement(document, CUP.SELECTORS.SIDEBAR_NAV, 10000);
    if (!sidebar) {
      CUP.logError('Could not find sidebar');
      return;
    }
    
    // Find the container that holds all sections
    const containerWrapper = sidebar.querySelector('.flex.flex-grow.flex-col.overflow-y-auto');
    if (!containerWrapper) {
      CUP.logError('Could not find sidebar container wrapper');
      return;
    }
    
    // Find sections
    const containers = containerWrapper.querySelectorAll('.transition-all.duration-200');
    if (!containers.length) {
      CUP.logError('Could not find sidebar sections');
      return;
    }
    
    // Get the last container's content area
    const lastContainer = containers[containers.length - 1];
    const mainContainer = lastContainer.querySelector('.px-2.mt-4') || lastContainer.querySelector('.px-2');
    
    if (!mainContainer) {
      CUP.logError('Could not find main container in sidebar');
      return;
    }
    
    // Look for starred or recents section to insert before
    const starredSection = mainContainer.querySelector('div.flex.flex-col.mb-4');
    const targetSection = starredSection || mainContainer.firstChild;
    
    if (targetSection) {
      mainContainer.insertBefore(this.container, targetSection);
    } else {
      mainContainer.prepend(this.container);
    }
    
    this.isInjected = true;
    CUP.log('Sidebar UI injected');
  }
  
  /**
   * Check if UI is still in DOM and reinject if needed
   */
  async checkAndReinject() {
    if (!this.isInjected || !document.contains(this.container)) {
      CUP.log('Sidebar UI missing, reinjecting...');
      this.isInjected = false;
      await this.inject();
    }
  }
  
  /**
   * Update the display with usage data
   */
  update(usageData) {
    if (!usageData || !this.isInjected) return;
    
    const percentage = usageData.getUsagePercentage();
    const color = CUP.getUsageColor(percentage);
    const weighted = usageData.getWeightedTotal();
    const cap = usageData.usageCap;
    const resetInfo = usageData.getResetTimeInfo();
    
    // Update percentage display
    this.percentageDisplay.textContent = `${percentage.toFixed(1)}%`;
    this.percentageDisplay.style.color = color;
    
    // Update progress bar
    this.progressBar.style.width = `${Math.min(percentage, 100)}%`;
    this.progressBar.style.backgroundColor = color;
    
    // Update reset time
    if (resetInfo.expired) {
      this.resetTimeDisplay.innerHTML = `<span style="color: ${CUP.COLORS.GREEN}">Reset: Now!</span>`;
    } else {
      this.resetTimeDisplay.textContent = `Reset: ${resetInfo.formatted}`;
    }
    
    // Update tooltip
    this.tooltip.textContent = `${CUP.formatNumber(weighted)} / ${CUP.formatNumber(cap)} tokens (${percentage.toFixed(1)}%)`;
  }
  
  /**
   * Open settings (placeholder)
   */
  openSettings() {
    CUP.log('Settings clicked');
    // TODO: Implement settings panel
    CUP.sendToBackground({ type: 'OPEN_POPUP' });
  }
}

// Expose globally
window.SidebarUI = SidebarUI;
