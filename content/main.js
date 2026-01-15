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
    showTopBar: true,
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
  
  if (window.ChatUI && (settings.showChatOverlay || settings.showTopBar)) {
    window.cupChatUI = new ChatUI();
    window.cupChatUI.settings = settings;
    window.cupChatUI.initialize();
    await window.cupChatUI.injectUI();
  }
  
  // Initialize voice if enabled
  if (window.VoiceInput && settings.enableVoice) {
    window.CUP.log('Voice enabled, initializing...');
    window.cupVoice = new VoiceInput();
    window.cupVoice.initialize();
  } else {
    window.CUP.log('Voice not enabled or VoiceInput not available. enableVoice:', settings.enableVoice);
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
  
  // Model detection - watch for changes
  startModelWatcher();
  
  // Periodic UI check
  setInterval(() => {
    if (window.cupSidebar && settings.showSidebar) {
      window.cupSidebar.checkAndReinject();
    }
    if (window.cupChatUI) {
      window.cupChatUI.checkAndReinject();
    }
    // Also check voice button
    if (settings.enableVoice && !document.getElementById('cup-voice-btn')) {
      if (window.cupVoice) {
        window.cupVoice.injectButton();
      } else if (window.VoiceInput) {
        window.cupVoice = new VoiceInput();
        window.cupVoice.initialize();
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
  
  function startModelWatcher() {
    let lastModel = null;
    
    setInterval(() => {
      const model = detectCurrentModel();
      if (model && model !== lastModel) {
        lastModel = model;
        window.CUP.sendToBackground({ type: 'UPDATE_MODEL', model });
        window.CUP.log('Model changed to:', model);
      }
    }, 2000);
  }
  
  function detectCurrentModel() {
    // Check model selector button
    const modelButton = document.querySelector('[data-testid="model-selector"]') ||
                       document.querySelector('button[class*="model"]');
    
    if (modelButton) {
      const text = modelButton.textContent?.toLowerCase() || '';
      if (text.includes('opus')) return 'opus';
      if (text.includes('haiku')) return 'haiku';
      if (text.includes('sonnet')) return 'sonnet';
    }
    
    // Check for model name in composer area
    const composer = document.querySelector('[class*="composer"]') ||
                    document.querySelector('form');
    if (composer) {
      const text = composer.textContent?.toLowerCase() || '';
      if (text.includes('opus')) return 'opus';
      if (text.includes('haiku')) return 'haiku';
    }
    
    return 'sonnet';
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
    
    // Toggle top bar
    const topBar = document.getElementById('cup-top-bar');
    if (topBar) {
      topBar.style.display = settings.showTopBar ? '' : 'none';
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
