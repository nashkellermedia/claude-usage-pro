/**
 * Claude Usage Pro - Voice Input
 * Adds voice-to-text capability to Claude's chat input
 * Keyboard shortcut: Ctrl+Shift+V (or Cmd+Shift+V on Mac)
 */

class VoiceInput {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    this.lastInjectAttempt = 0;
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
    
    this.setupKeyboardShortcut();
    
    // Initial injection
    this.injectButton();
    
    // Simple interval - check every 300ms, inject if missing
    setInterval(() => {
      const btn = document.querySelector('.cup-voice-btn');
      if (!btn) {
        this.injectButton();
      }
    }, 300);
    
    window.CUP.log('VoiceInput: Initialized with 300ms monitor');
  }
  
  setupKeyboardShortcut() {
    // Ctrl+Shift+V to toggle
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      }
    });
    
    // Hold-to-talk with X key (when not typing in an input)
    this.holdToTalkActive = false;
    
    document.addEventListener('keydown', (e) => {
      // Only X key, not in an input field, not repeating
      if (e.key.toLowerCase() !== 'x' || e.repeat) return;
      if (this.isTypingInInput()) return;
      
      e.preventDefault();
      if (!this.holdToTalkActive && !this.isListening) {
        this.holdToTalkActive = true;
        this.start();
        window.CUP.log('VoiceInput: Hold-to-talk started');
      }
    });
    
    document.addEventListener('keyup', (e) => {
      if (e.key.toLowerCase() !== 'x') return;
      
      if (this.holdToTalkActive) {
        this.holdToTalkActive = false;
        this.stop();
        window.CUP.log('VoiceInput: Hold-to-talk ended');
      }
    });
  }
  
  isTypingInInput() {
    const active = document.activeElement;
    if (!active) return false;
    
    const tagName = active.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea') return true;
    if (active.contentEditable === 'true') return true;
    if (active.closest('[contenteditable="true"]')) return true;
    
    return false;
  }
  
  findSendButton() {
    // Strategy 1: aria-label contains "send"
    let sendBtn = document.querySelector('button[aria-label*="Send" i]');
    if (sendBtn) return sendBtn;
    
    // Strategy 2: Find contenteditable, go up to form, find buttons
    const editor = document.querySelector('[contenteditable="true"]');
    if (!editor) return null;
    
    let container = editor;
    for (let i = 0; i < 10; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;
      if (container.tagName === 'FORM') break;
    }
    
    // Look for send button by color (orange-ish)
    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
      // Skip if it's our button
      if (btn.classList.contains('cup-voice-btn')) continue;
      
      const style = window.getComputedStyle(btn);
      const bg = style.backgroundColor;
      
      // Orange/coral colors Claude uses for send
      if (bg.includes('232, 121, 83') || 
          bg.includes('217, 119, 87') || 
          bg.includes('249, 115, 22') ||
          bg.includes('234, 88, 12')) {
        return btn;
      }
    }
    
    // Strategy 3: Last button in the toolbar area near editor
    const toolbar = editor.closest('form')?.querySelector('div:last-child');
    if (toolbar) {
      const btns = toolbar.querySelectorAll('button:not(.cup-voice-btn)');
      if (btns.length > 0) {
        return btns[btns.length - 1];
      }
    }
    
    return null;
  }
  
  injectButton() {
    // Throttle injection attempts
    const now = Date.now();
    if (now - this.lastInjectAttempt < 100) return;
    this.lastInjectAttempt = now;
    
    // Remove ALL existing voice buttons first
    document.querySelectorAll('.cup-voice-btn').forEach(el => el.remove());
    
    const sendButton = this.findSendButton();
    if (!sendButton || !sendButton.parentElement) {
      return; // Will retry on next interval
    }
    
    // Create button
    const btn = document.createElement('button');
    btn.className = 'cup-voice-btn';
    btn.type = 'button';
    btn.innerHTML = this.isListening ? '🔴' : '🎤';
    btn.title = this.isListening ? 'Listening... (Ctrl+Shift+V to stop)' : 'Voice Input (hold X or Ctrl+Shift+V)';
    if (this.isListening) btn.classList.add('listening');
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    });
    
    // Insert before send button
    sendButton.parentElement.insertBefore(btn, sendButton);
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
    const btn = document.querySelector('.cup-voice-btn');
    if (!btn) return;
    
    if (this.isListening) {
      btn.innerHTML = '🔴';
      btn.classList.add('listening');
      btn.title = 'Listening... (Ctrl+Shift+V to stop)';
    } else {
      btn.innerHTML = '🎤';
      btn.classList.remove('listening');
      btn.title = 'Voice Input (hold X or Ctrl+Shift+V)';
    }
  }
}

window.VoiceInput = VoiceInput;
window.CUP.log('VoiceInput loaded');
