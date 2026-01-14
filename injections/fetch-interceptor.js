/**
 * Claude Usage Pro - Page World Fetch Interceptor
 * 
 * This script runs in the page's main world to intercept actual fetch calls.
 * It communicates back to the content script via custom events.
 */

(function() {
  'use strict';
  
  // Avoid double-injection
  if (window.__CUP_FETCH_INTERCEPTED__) return;
  window.__CUP_FETCH_INTERCEPTED__ = true;
  
  const originalFetch = window.fetch;
  
  // Helper to estimate tokens (simple char/4 estimate)
  function estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    return Math.ceil(text.length / 4);
  }
  
  // Helper to check if URL is relevant
  function isRelevantUrl(url) {
    return url.includes('claude.ai/api') || 
           url.includes('/api/organizations') ||
           url.includes('/api/chat_conversations');
  }
  
  function isCompletionUrl(url) {
    return url.includes('/completion') || 
           url.includes('/chat') ||
           url.includes('/retry_completion');
  }
  
  function isConversationUrl(url) {
    return url.includes('/chat_conversations/') && !url.includes('/completion');
  }
  
  // Dispatch event to content script
  function dispatchToContentScript(type, data) {
    window.dispatchEvent(new CustomEvent('CUP_API_EVENT', {
      detail: { type, data }
    }));
  }
  
  // Process outgoing request
  function processOutgoingRequest(url, body) {
    try {
      if (!body) return;
      
      let data;
      if (typeof body === 'string') {
        data = JSON.parse(body);
      } else {
        return; // Can't process non-string body
      }
      
      const prompt = data.prompt || data.content || '';
      const attachments = data.attachments || [];
      
      let tokens = estimateTokens(prompt);
      
      for (const att of attachments) {
        if (att.extracted_content) {
          tokens += estimateTokens(att.extracted_content);
        }
      }
      
      if (tokens > 0) {
        dispatchToContentScript('MESSAGE_SENT', {
          tokens,
          model: data.model,
          hasAttachments: attachments.length > 0
        });
      }
    } catch (e) {
      // Silently fail
    }
  }
  
  // Process streaming response
  async function processStreamingResponse(response, url) {
    try {
      const reader = response.body?.getReader();
      if (!reader) return;
      
      const decoder = new TextDecoder();
      let totalText = '';
      let thinkingText = '';
      let model = null;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') continue;
            
            try {
              const data = JSON.parse(jsonStr);
              
              // Capture model info
              if (data.model && !model) {
                model = data.model;
              }
              
              // Handle different response formats
              if (data.completion) {
                totalText += data.completion;
              } else if (data.delta?.text) {
                totalText += data.delta.text;
              } else if (data.content?.[0]?.text) {
                totalText += data.content[0].text;
              }
              
              // Handle thinking/reasoning tokens
              if (data.thinking) {
                thinkingText += data.thinking;
              }
            } catch (e) {
              // Not valid JSON
            }
          }
        }
      }
      
      const textTokens = estimateTokens(totalText);
      const thinkingTokens = estimateTokens(thinkingText);
      
      if (textTokens > 0 || thinkingTokens > 0) {
        dispatchToContentScript('MESSAGE_RECEIVED', {
          textTokens,
          thinkingTokens,
          totalTokens: textTokens + thinkingTokens,
          model
        });
      }
    } catch (e) {
      // Silently fail
    }
  }
  
  // Process conversation load
  async function processConversationResponse(response, url) {
    try {
      const data = await response.json();
      
      const conversationId = url.match(/chat_conversations\/([a-f0-9-]+)/)?.[1];
      const messages = data.chat_messages || [];
      const model = data.model || 'claude-sonnet-4';
      
      let totalTokens = 0;
      let projectTokens = 0;
      let fileTokens = 0;
      
      for (const msg of messages) {
        if (msg.text) {
          totalTokens += estimateTokens(msg.text);
        }
        
        if (msg.content) {
          for (const block of msg.content) {
            if (block.text) {
              totalTokens += estimateTokens(block.text);
            }
          }
        }
        
        if (msg.attachments) {
          for (const att of msg.attachments) {
            if (att.extracted_content) {
              fileTokens += estimateTokens(att.extracted_content);
            }
          }
        }
      }
      
      if (data.project?.prompt_template) {
        projectTokens = estimateTokens(data.project.prompt_template);
      }
      
      totalTokens += fileTokens + projectTokens;
      
      dispatchToContentScript('CONVERSATION_LOADED', {
        conversationId,
        totalTokens,
        model,
        messageCount: messages.length,
        projectTokens,
        fileTokens
      });
    } catch (e) {
      // Silently fail
    }
  }
  
  // Intercept fetch
  window.fetch = async function(...args) {
    const [url, options] = args;
    const urlString = typeof url === 'string' ? url : url.toString();
    
    if (!isRelevantUrl(urlString)) {
      return originalFetch.apply(this, args);
    }
    
    // Process outgoing completion requests
    if (isCompletionUrl(urlString) && options?.body) {
      processOutgoingRequest(urlString, options.body);
    }
    
    // Execute fetch
    const response = await originalFetch.apply(this, args);
    
    // Clone response for processing
    const clonedResponse = response.clone();
    const contentType = clonedResponse.headers.get('content-type') || '';
    
    // Process response asynchronously (don't block)
    if (isConversationUrl(urlString) && contentType.includes('application/json')) {
      processConversationResponse(clonedResponse, urlString);
    } else if (isCompletionUrl(urlString)) {
      // For streaming, we need to clone again because we're reading the body
      processStreamingResponse(response.clone(), urlString);
    }
    
    return response;
  };
  
  console.log('[Claude Usage Pro] Fetch interceptor injected into page');
})();
