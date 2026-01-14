/**
 * Claude Usage Pro - Fetch Interceptor (Page World)
 * Intercepts Claude API calls to track token usage
 */

(function() {
  'use strict';
  
  const originalFetch = window.fetch;
  
  // Dispatch event to content script
  function dispatch(type, data) {
    console.log('[Claude Usage Pro]', type, data);
    window.dispatchEvent(new CustomEvent('CUP_API_EVENT', {
      detail: { type, data }
    }));
  }
  
  // Estimate tokens from text
  function estimateTokens(text) {
    if (!text) return 0;
    // ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }
  
  // Parse streaming response
  async function parseStreamingResponse(response, url) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let thinkingText = '';
    let model = null;
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          try {
            const data = JSON.parse(line.slice(6));
            
            // Extract model
            if (data.model) model = data.model;
            
            // Track completion text
            if (data.type === 'content_block_delta') {
              if (data.delta?.type === 'text_delta') {
                fullText += data.delta.text || '';
              } else if (data.delta?.type === 'thinking_delta') {
                thinkingText += data.delta.thinking || '';
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error('[CUP] Stream parse error:', e);
    }
    
    const textTokens = estimateTokens(fullText);
    const thinkingTokens = estimateTokens(thinkingText);
    
    dispatch('MESSAGE_RECEIVED', {
      textTokens,
      thinkingTokens,
      totalTokens: textTokens + thinkingTokens,
      model
    });
  }
  
  // Intercept fetch
  window.fetch = async function(...args) {
    const [url, options] = args;
    const urlStr = typeof url === 'string' ? url : url?.url || '';
    
    // Only intercept Claude API calls
    if (!urlStr.includes('claude.ai/api')) {
      return originalFetch.apply(this, args);
    }
    
    try {
      // Track outgoing messages
      if (urlStr.includes('/chat_conversations') && urlStr.includes('/completion') && options?.method === 'POST') {
        const body = options.body;
        if (body) {
          try {
            const data = JSON.parse(body);
            const prompt = data.prompt || '';
            const tokens = estimateTokens(prompt);
            const attachments = data.attachments || [];
            
            dispatch('MESSAGE_SENT', {
              tokens,
              model: data.model,
              hasAttachments: attachments.length > 0
            });
          } catch (e) {}
        }
      }
      
      // Make the actual request
      const response = await originalFetch.apply(this, args);
      
      // Track conversation loads
      if (urlStr.match(/\/chat_conversations\/[a-f0-9-]+$/) && options?.method !== 'POST') {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();
          
          if (data.chat_messages) {
            let totalTokens = 0;
            let messageCount = 0;
            
            for (const msg of data.chat_messages) {
              messageCount++;
              if (msg.text) totalTokens += estimateTokens(msg.text);
              if (msg.content) {
                for (const block of msg.content) {
                  if (block.text) totalTokens += estimateTokens(block.text);
                }
              }
            }
            
            dispatch('CONVERSATION_LOADED', {
              conversationId: data.uuid,
              totalTokens,
              model: data.model || 'claude-sonnet-4',
              messageCount,
              projectTokens: 0,
              fileTokens: 0
            });
          }
        } catch (e) {}
      }
      
      // Track streaming responses
      if (urlStr.includes('/completion') && response.headers.get('content-type')?.includes('text/event-stream')) {
        const [streamResponse, returnResponse] = response.body.tee();
        parseStreamingResponse(new Response(streamResponse), urlStr);
        return new Response(returnResponse, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText
        });
      }
      
      return response;
      
    } catch (error) {
      console.error('[CUP] Fetch intercept error:', error);
      return originalFetch.apply(this, args);
    }
  };
  
  console.log('[Claude Usage Pro] Fetch interceptor injected into page');
})();
