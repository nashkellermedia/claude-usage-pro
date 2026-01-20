/**
 * Claude Usage Pro - Voice Input
 * Adds voice-to-text capability to Claude's chat input
 * Keyboard shortcut: Ctrl+Shift+V (or Cmd+Shift+V on Mac)
 */

class VoiceInput {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.button = null;
    this.supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    this.reinjecting = false;
  }
  
  initialize() {
    if (!this.supported) {
      window.CUP.log('VoiceInput: Speech recognition not supported');
      return;
    }
    
    window.CUP.log('VoiceInput: Initializing...');
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    
    this.recognition.onresult = (event) => this.handleResult(event);
    this.recognition.onerror = (event) => this.handleError(event);
    this.recognition.onend = () => this.handleEnd();
    
    this.injectButton();
    this.setupKeyboardShortcut();
    
    // Check button position frequently (every 500ms) to catch UI re-renders
    setInterval(() => this.ensureButtonExists(), 500);
    
    // Also watch for DOM changes near the composer
    this.setupMutationObserver();
  }
  
  setupKeyboardShortcut() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+V (Windows/Linux) or Cmd+Shift+V (Mac)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
        window.CUP.log('VoiceInput: Toggled via keyboard shortcut');
      }
    });
    window.CUP.log('VoiceInput: Keyboard shortcut registered (Ctrl/Cmd+Shift+V)');
  }
  
  setupMutationObserver() {
    // Watch for changes to the composer area that might remove our button
    const observer = new MutationObserver((mutations) => {
      // Debounce - only check if button is missing
      if (!this.button || !this.button.isConnected) {
        if (!this.reinjecting) {
          this.reinjecting = true;
          setTimeout(() => {
            this.injectButton();
            this.reinjecting = false;
          }, 100);
        }
      }
    });
    
    // Start observing once body is ready
    setTimeout(() => {
      observer.observe(document.body, { 
        childList: true, 
        subtree: true 
      });
    }, 2000);
  }
  
  findButtonContainer() {
    const contentEditable = document.querySelector('[contenteditable="true"]');
    if (!contentEditable) return null;
    
    // Find the form or main container
    let container = contentEditable;
    for (let i = 0; i < 10; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;
      if (container.tagName === 'FORM') break;
    }
    
    // Find the send button
    const allButtons = container.querySelectorAll('button');
    let sendButton = null;
    
    // Try aria-label first
    for (const btn of allButtons) {
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (ariaLabel.includes('send')) {
        sendButton = btn;
        break;
      }
    }
    
    // Fallback: look for orange/accent button
    if (!sendButton) {
      for (const btn of allButtons) {
        const style = window.getComputedStyle(btn);
        const bg = style.backgroundColor;
        if (bg.includes('232, 121, 83') || bg.includes('217, 119, 87') || bg.includes('249, 115, 22')) {
          sendButton = btn;
          break;
        }
      }
    }
    
    if (sendButton && sendButton.parentElement) {
      return { toolbar: sendButton.parentElement, sendButton };
    }
    
    return null;
  }
  
  injectButton() {
    // Remove any existing buttons first
    document.querySelectorAll('.cup-voice-btn').forEach(el => el.remove());
    
    const result = this.findButtonContainer();
    if (!result) {
      // Retry in a moment
      setTimeout(() => this.injectButton(), 500);
      return;
    }
    
    const { toolbar, sendButton } = result;
    
    // Create voice button
    this.button = document.createElement('button');
    this.button.className = 'cup-voice-btn';
    this.button.type = 'button';
    this.button.innerHTML = '🎤';
    this.button.title = 'Voice Input (Ctrl+Shift+V)';
    
    this.button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    });
    
    // Insert before send button
    toolbar.insertBefore(this.button, sendButton);
    window.CUP.log('VoiceInput: Button injected');
  }
  
  ensureButtonExists() {
    if (!this.button || !this.button.isConnected) {
      if (!this.reinjecting) {
        this.reinjecting = true;
        this.injectButton();
        setTimeout(() => { this.reinjecting = false; }, 200);
      }
    }
  }
  
  toggle() {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }
  
  start() {
    if (!this.recognition) return;
    
    // Ensure button exists before starting
    this.ensureButtonExists();
    
    try {
      this.recognition.start();
      this.isListening = true;
      this.updateButtonState();
      window.CUP.log('VoiceInput: Started listening');
    } catch (e) {
      window.CUP.logError('VoiceInput: Start error:', e);
    }
  }
  
  stop() {
    if (!this.recognition) return;
    
    try {
      this.recognition.stop();
      this.isListening = false;
      this.updateButtonState();
      window.CUP.log('VoiceInput: Stopped listening');
    } catch (e) {
      window.CUP.logError('VoiceInput: Stop error:', e);
    }
  }
  
  handleResult(event) {
    const input = document.querySelector('[contenteditable="true"]');
    if (!input) return;
    
    let finalTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      }
    }
    
    if (finalTranscript) {
      const p = input.querySelector('p') || input;
      const currentText = p.innerText || '';
      
      // Don't append to placeholder text
      const isPlaceholder = currentText.match(/^(Reply to|Type a message|Ask Claude|Message Claude)/i);
      const newText = isPlaceholder ? finalTranscript : currentText + (currentText ? ' ' : '') + finalTranscript;
      
      p.innerText = newText;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(p);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      
      window.CUP.log('VoiceInput: Transcribed:', finalTranscript);
    }
  }
  
  handleError(event) {
    window.CUP.logError('VoiceInput: Error:', event.error);
    
    if (event.error === 'not-allowed') {
      alert('Microphone access denied. Please allow microphone access in your browser settings.');
    }
    
    this.isListening = false;
    this.updateButtonState();
  }
  
  handleEnd() {
    if (this.isListening) {
      // Auto-restart if still supposed to be listening
      try {
        this.recognition.start();
      } catch (e) {
        this.isListening = false;
        this.updateButtonState();
      }
    }
  }
  
  updateButtonState() {
    // Find button fresh in case it was re-injected
    const btn = document.querySelector('.cup-voice-btn');
    if (!btn) return;
    
    if (this.isListening) {
      btn.innerHTML = '🔴';
      btn.classList.add('listening');
      btn.title = 'Listening... (click or Ctrl+Shift+V to stop)';
    } else {
      btn.innerHTML = '🎤';
      btn.classList.remove('listening');
      btn.title = 'Voice Input (Ctrl+Shift+V)';
    }
  }
}

window.VoiceInput = VoiceInput;
window.CUP.log('VoiceInput loaded');
