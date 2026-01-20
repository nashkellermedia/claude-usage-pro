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
    this.lastContainerCheck = 0;
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
    
    // Periodically check button is in correct position
    setInterval(() => this.ensureButtonPosition(), 2000);
  }
  
  findButtonContainer() {
    // Find the contenteditable input
    const contentEditable = document.querySelector('[contenteditable="true"]');
    if (!contentEditable) return null;
    
    // Find the form or main container
    let container = contentEditable;
    for (let i = 0; i < 10; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;
      if (container.tagName === 'FORM') break;
    }
    
    // Find the button toolbar - usually a div with multiple buttons including send
    const allButtons = container.querySelectorAll('button');
    
    // Find the send button (usually has an arrow SVG or specific aria-label)
    let sendButton = null;
    for (const btn of allButtons) {
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (ariaLabel.includes('send')) {
        sendButton = btn;
        break;
      }
    }
    
    // If no aria-label, look for the orange/accent button
    if (!sendButton) {
      for (const btn of allButtons) {
        const style = window.getComputedStyle(btn);
        if (style.backgroundColor.includes('232, 121, 83') || 
            style.backgroundColor.includes('217, 119, 87')) {
          sendButton = btn;
          break;
        }
      }
    }
    
    if (sendButton && sendButton.parentElement) {
      return {
        toolbar: sendButton.parentElement,
        sendButton: sendButton
      };
    }
    
    return null;
  }
  
  injectButton() {
    // Remove any existing buttons first
    const existing = document.querySelectorAll('.cup-voice-btn');
    existing.forEach(el => el.remove());
    
    const tryInject = (attempt = 0) => {
      if (attempt > 15) {
        window.CUP.log('VoiceInput: Failed to inject after 15 attempts');
        return;
      }
      
      const result = this.findButtonContainer();
      if (!result) {
        setTimeout(() => tryInject(attempt + 1), 1000);
        return;
      }
      
      const { toolbar, sendButton } = result;
      
      // Create voice button
      this.button = document.createElement('button');
      this.button.className = 'cup-voice-btn';
      this.button.type = 'button';
      this.button.innerHTML = '🎤';
      this.button.title = 'Voice Input (click to start/stop)';
      
      this.button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      });
      
      // Always insert RIGHT BEFORE the send button (which should be last)
      toolbar.insertBefore(this.button, sendButton);
      
      window.CUP.log('VoiceInput: Button injected before send button');
    };
    
    tryInject();
  }
  
  ensureButtonPosition() {
    // Check if button exists and is in DOM
    if (!this.button || !this.button.isConnected) {
      window.CUP.log('VoiceInput: Button missing, re-injecting');
      this.injectButton();
      return;
    }
    
    // Check if button is in the right position (right before send button)
    const result = this.findButtonContainer();
    if (!result) return;
    
    const { sendButton } = result;
    
    // Button should be immediately before send button
    if (this.button.nextElementSibling !== sendButton) {
      window.CUP.log('VoiceInput: Button in wrong position, moving');
      sendButton.parentElement.insertBefore(this.button, sendButton);
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
      if (input.contentEditable === 'true') {
        const p = input.querySelector('p') || input;
        const currentText = p.innerText || '';
        const newText = currentText + (currentText ? ' ' : '') + finalTranscript;
        p.innerText = newText;
        
        input.dispatchEvent(new Event('input', { bubbles: true }));
        
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(p);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
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
