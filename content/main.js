/**
 * Claude Usage Pro - Main Content Script
 */

(async function() {
  // Initialize CUP namespace
  window.CUP = {
    debug: false,
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

  // Start API interceptor to capture conversation data
  if (window.APIInterceptor) {
    window.CUP.log('Starting API interceptor...');
    window.APIInterceptor.start();
  }
  
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
  
  // Initialize voice if enabled (voice-input.js handles its own re-injection)
  if (window.VoiceInput && settings.enableVoice) {
    window.CUP.log('Voice enabled, initializing...');
    window.cupVoice = new VoiceInput();
    window.cupVoice.initialize();
  }
  
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
              window.CUP.sendToBackground({ type: 'SYNC_SCRAPED_DATA', usageData: data });
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
  
  // Periodic UI check (sidebar and chat overlay only - voice handles itself)
  setInterval(() => {
    if (window.cupSidebar && settings.showSidebar) {
      window.cupSidebar.checkAndReinject();
    }
    if (window.cupChatUI && settings.showChatOverlay) {
      window.cupChatUI.checkAndReinject();
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
    
    // Toggle sidebar - create if needed and enabled
    const sidebarEl = document.getElementById('cup-sidebar-widget');
    let needsDataRefresh = false;
    
    if (settings.showSidebar) {
      if (!sidebarEl && window.SidebarUI && !window.cupSidebar) {
        window.CUP.log('Creating sidebar (was missing)...');
        window.cupSidebar = new SidebarUI();
        window.cupSidebar.initialize();
        needsDataRefresh = true;
      } else if (sidebarEl) {
        sidebarEl.style.display = '';
      }
    } else if (sidebarEl) {
      sidebarEl.style.display = 'none';
    }
    
    // Toggle chat overlay - create if needed and enabled
    const inputStats = document.getElementById('cup-input-stats');
    if (settings.showChatOverlay) {
      if (!inputStats && window.ChatUI && !window.cupChatUI) {
        window.CUP.log('Creating chat overlay (was missing)...');
        window.cupChatUI = new ChatUI();
        window.cupChatUI.initialize();
        window.cupChatUI.injectUI();
        needsDataRefresh = true;
      } else if (inputStats) {
        inputStats.style.display = '';
      }
    } else if (inputStats) {
      inputStats.style.display = 'none';
    }
    
    // If we created new UI elements, fetch and display current data
    if (needsDataRefresh) {
      chrome.runtime.sendMessage({ type: 'GET_USAGE_DATA' }).then(response => {
        if (response?.usageData) {
          if (window.cupSidebar) window.cupSidebar.update(response.usageData);
          if (window.cupChatUI) window.cupChatUI.updateUsage(response.usageData);
          window.CUP.log('Populated new UI with current data');
        }
      }).catch(() => {});
    }
    
    // Toggle voice
    if (settings.enableVoice) {
      if (!window.cupVoice && window.VoiceInput) {
        window.CUP.log('Enabling voice input...');
        window.cupVoice = new VoiceInput();
        window.cupVoice.initialize();
      }
    } else {
      const voiceBtn = document.querySelector('.cup-voice-btn');
      if (voiceBtn) {
        window.CUP.log('Disabling voice input...');
        voiceBtn.remove();
      }
      window.cupVoice = null;
    }
  }
  
})();
