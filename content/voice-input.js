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
    
    // Inject button
    this.injectButton();
  }
  
  injectButton() {
    // Wait for composer to be ready
    const tryInject = () => {
      const composer = document.querySelector('[class*="composer"]') ||
                      document.querySelector('form:has([contenteditable])');
      
      if (!composer) {
        setTimeout(tryInject, 1000);
        return;
      }
      
      // Find the button area (near send button)
      const sendButton = composer.querySelector('button[type="submit"]') ||
                        composer.querySelector('button[aria-label*="Send"]') ||
                        composer.querySelector('button:last-child');
      
      if (!sendButton || document.getElementById('cup-voice-btn')) {
        return;
      }
      
      // Create voice button
      this.button = document.createElement('button');
      this.button.id = 'cup-voice-btn';
      this.button.type = 'button';
      this.button.className = 'cup-voice-btn';
      this.button.innerHTML = '🎤';
      this.button.title = 'Voice Input (click to start/stop)';
      
      this.button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      });
      
      // Insert before send button
      sendButton.parentNode.insertBefore(this.button, sendButton);
      
      window.CUP.log('VoiceInput: Button injected');
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
    let interimTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    
    if (finalTranscript) {
      // Append to existing content
      if (input.contentEditable === 'true') {
        // For contenteditable
        const currentText = input.innerText || '';
        const newText = currentText + (currentText ? ' ' : '') + finalTranscript;
        input.innerText = newText;
        
        // Trigger input event for Claude to detect
        input.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Move cursor to end
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(input);
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
    // Recognition ended (might restart if continuous)
    if (this.isListening) {
      // Restart if we're still supposed to be listening
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
