/**
 * Claude Usage Pro - Voice Input
 * Adds voice-to-text capability to Claude's chat input
 */

class VoiceInput {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.button = null;
    this.supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }
  
  initialize() {
    if (!this.supported) {
      window.CUP.log('VoiceInput: Speech recognition not supported');
      return;
    }
    
    window.CUP.log('VoiceInput: Initializing...');
    
    // Set up speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    
    this.recognition.onresult = (event) => this.handleResult(event);
    this.recognition.onerror = (event) => this.handleError(event);
    this.recognition.onend = () => this.handleEnd();
    
    // Inject button with retry
    this.injectButton();
  }
  
  injectButton() {
    if (document.getElementById('cup-voice-btn')) {
      window.CUP.log('VoiceInput: Button already exists');
      return;
    }
    
    // Try multiple strategies to find the right place
    const tryInject = (attempt = 0) => {
      if (attempt > 10) {
        window.CUP.log('VoiceInput: Failed to inject after 10 attempts');
        return;
      }
      
      window.CUP.log('VoiceInput: Injection attempt', attempt);
      
      // Strategy 1: Find the send button by aria-label
      let sendButton = document.querySelector('button[aria-label="Send Message"]') ||
                       document.querySelector('button[aria-label*="Send"]');
      
      // Strategy 2: Find button with SVG arrow icon near contenteditable
      if (!sendButton) {
        const contentEditable = document.querySelector('[contenteditable="true"]');
        if (contentEditable) {
          const form = contentEditable.closest('form');
          if (form) {
            // Look for the last button in the form area
            const buttons = form.querySelectorAll('button');
            for (const btn of buttons) {
              if (btn.querySelector('svg') && !btn.textContent.trim()) {
                sendButton = btn;
                break;
              }
            }
          }
        }
      }
      
      // Strategy 3: Find by looking for orange/accent colored button
      if (!sendButton) {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const style = window.getComputedStyle(btn);
          if (style.backgroundColor.includes('rgb(232, 121, 83)') || 
              btn.className.includes('bg-accent')) {
            sendButton = btn;
            break;
          }
        }
      }
      
      if (!sendButton) {
        window.CUP.log('VoiceInput: Send button not found, retrying...');
        setTimeout(() => tryInject(attempt + 1), 1000);
        return;
      }
      
      window.CUP.log('VoiceInput: Found send button:', sendButton);
      
      // Create voice button
      this.button = document.createElement('button');
      this.button.id = 'cup-voice-btn';
      this.button.type = 'button';
      this.button.innerHTML = '🎤';
      this.button.title = 'Voice Input (click to start/stop)';
      
      this.button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      });
      
      // Insert before send button
      if (sendButton.parentNode) {
        sendButton.parentNode.insertBefore(this.button, sendButton);
        window.CUP.log('VoiceInput: Button injected successfully');
      } else {
        window.CUP.log('VoiceInput: Could not insert button - no parent node');
      }
    };
    
    tryInject();
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
    const input = document.querySelector('[contenteditable="true"]') ||
                 document.querySelector('textarea');
    
    if (!input) return;
    
    let finalTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      }
    }
    
    if (finalTranscript) {
      // For contenteditable (Claude uses this)
      if (input.contentEditable === 'true') {
        // Get current content
        const p = input.querySelector('p') || input;
        const currentText = p.innerText || '';
        const newText = currentText + (currentText ? ' ' : '') + finalTranscript;
        p.innerText = newText;
        
        // Trigger input event
        input.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Move cursor to end
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(p);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // For textarea
        const currentText = input.value || '';
        input.value = currentText + (currentText ? ' ' : '') + finalTranscript;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
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
      try {
        this.recognition.start();
      } catch (e) {
        this.isListening = false;
        this.updateButtonState();
      }
    }
  }
  
  updateButtonState() {
    if (!this.button) return;
    
    if (this.isListening) {
      this.button.innerHTML = '🔴';
      this.button.classList.add('listening');
      this.button.title = 'Listening... (click to stop)';
    } else {
      this.button.innerHTML = '🎤';
      this.button.classList.remove('listening');
      this.button.title = 'Voice Input (click to start)';
    }
  }
}

window.VoiceInput = VoiceInput;
window.CUP.log('VoiceInput loaded');
