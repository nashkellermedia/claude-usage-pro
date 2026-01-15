/**
 * Claude Usage Pro - Main Content Script
 */

(async function() {
  // Initialize CUP namespace
  window.CUP = {
    debug: true,
    log: (...args) => {
      if (window.CUP.debug) console.log('[Claude Usage Pro]', ...args);
    },
    logError: (...args) => {
      console.error('[Claude Usage Pro]', ...args);
    },
    sendToBackground: (message) => {
      return chrome.runtime.sendMessage(message).catch(e => {
        window.CUP.logError('sendToBackground failed:', e);
      });
    }
  };
  
  window.CUP.log('Initializing...');
  
  // Load settings
  let settings = {
    showSidebar: true,
    showChatOverlay: true,
    enableVoice: false
  };
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response?.settings) {
      settings = { ...settings, ...response.settings };
      window.CUP.log('Loaded settings:', settings);
    }
  } catch (e) {
    window.CUP.logError('Failed to load settings:', e);
  }
  
  // Wait for page load
  await new Promise(r => setTimeout(r, 1500));
  
  // Initialize components based on settings
  if (window.UsageScraper) {
    window.cupScraper = new UsageScraper();
  }
  
  if (window.SidebarUI && settings.showSidebar) {
    window.cupSidebar = new SidebarUI();
    await window.cupSidebar.initialize();
  }
  
  if (window.ChatUI && settings.showChatOverlay) {
    window.cupChatUI = new ChatUI();
    window.cupChatUI.initialize();
    await window.cupChatUI.injectUI();
  }
  
  // Initialize voice if enabled
  if (window.VoiceInput && settings.enableVoice) {
    window.CUP.log('Voice enabled, initializing...');
    window.cupVoice = new VoiceInput();
    window.cupVoice.initialize();
  }
  
  // Context indicator disabled - using sidebar and chat overlay instead
  // if (window.ContextIndicator) {
  //   window.CUP.log('Initializing context indicator...');
  //   window.cupContextIndicator = new ContextIndicator();
  //   window.cupContextIndicator.initialize();
  //   document.body.classList.add('cup-context-active');
  // }
  
  // Load initial data
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_USAGE_DATA' });
    if (response?.usageData) {
      updateAllUI(response.usageData);
    }
  } catch (e) {}
  
  // Trigger a scrape if on usage page
  if (window.location.pathname.includes('/settings/usage')) {
    setTimeout(() => {
      if (window.cupScraper) {
        window.cupScraper.scrapeCurrentPage();
      }
    }, 2000);
  }
  
  // Listen for messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    window.CUP.log('Received message:', message.type);
    
    switch (message.type) {
      case 'USAGE_UPDATED':
        updateAllUI(message.usageData);
        break;
        
      case 'SCRAPE_USAGE':
        if (window.cupScraper) {
          window.cupScraper.scrapeUsage().then(data => {
            if (data) {
              window.CUP.sendToBackground({ type: 'SYNC_SCRAPED_DATA', data });
            }
          });
        }
        break;
        
      case 'SETTINGS_UPDATED':
        window.CUP.log('Settings updated:', message.settings);
        handleSettingsUpdate(message.settings);
        break;
    }
    sendResponse({ received: true });
    return true;
  });
  
  // Periodic UI check
  setInterval(() => {
    if (window.cupSidebar && settings.showSidebar) {
      window.cupSidebar.checkAndReinject();
      // Update context usage in sidebar
      if (window.cupSidebar.updateContextUsage) {
        window.cupSidebar.updateContextUsage();
      }
    }
    if (window.cupChatUI && settings.showChatOverlay) {
      window.cupChatUI.checkAndReinject();
      // Update context usage in chat overlay
      if (window.cupChatUI.updateContextUsage) {
        window.cupChatUI.updateContextUsage();
      }
    }
    // Check voice button
    if (settings.enableVoice) {
      const voiceBtns = document.querySelectorAll('.cup-voice-btn, #cup-voice-btn');
      if (voiceBtns.length === 0) {
        // No button exists, inject it
        if (window.cupVoice) {
          window.cupVoice.injectButton();
        }
      } else if (voiceBtns.length > 1) {
        // Duplicates exist, remove all but first
        window.CUP.log('Removing duplicate voice buttons:', voiceBtns.length);
        for (let i = 1; i < voiceBtns.length; i++) {
          voiceBtns[i].remove();
        }
      }
    }
  }, 5000);
  
  window.CUP.log('Initialized successfully');
  
  function updateAllUI(usageData) {
    if (window.cupSidebar) {
      window.cupSidebar.update(usageData);
    }
    if (window.cupChatUI) {
      window.cupChatUI.updateUsage(usageData);
    }
  }
  
  function handleSettingsUpdate(newSettings) {
    settings = { ...settings, ...newSettings };
    window.CUP.log('Applied settings:', settings);
    
    // Toggle sidebar
    const sidebarEl = document.getElementById('cup-sidebar-widget');
    if (sidebarEl) {
      sidebarEl.style.display = settings.showSidebar ? '' : 'none';
    }
    
    // Toggle chat overlay
    const inputStats = document.getElementById('cup-input-stats');
    if (inputStats) {
      inputStats.style.display = settings.showChatOverlay ? '' : 'none';
    }
    
    // Toggle voice
    const voiceBtn = document.getElementById('cup-voice-btn');
    if (settings.enableVoice) {
      if (!voiceBtn && window.VoiceInput) {
        window.CUP.log('Enabling voice input...');
        window.cupVoice = new VoiceInput();
        window.cupVoice.initialize();
      }
    } else {
      if (voiceBtn) {
        window.CUP.log('Disabling voice input...');
        voiceBtn.remove();
        window.cupVoice = null;
      }
    }
  }
  
})();
