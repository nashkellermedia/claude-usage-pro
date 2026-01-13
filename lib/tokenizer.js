/**
 * Claude Usage Pro - Simple Token Estimator
 * 
 * Uses a character-based estimation with adjustments for common patterns.
 * For more accuracy, users can provide an Anthropic API key in settings.
 * 
 * Claude's tokenizer averages ~4 characters per token for English text.
 * We apply a 1.2x safety multiplier to be conservative.
 */

const TokenEstimator = {
  // Average chars per token (Claude uses ~4 for English)
  CHARS_PER_TOKEN: 4,
  
  // Safety multiplier to avoid underestimating
  SAFETY_MULTIPLIER: 1.15,
  
  /**
   * Estimate token count for text
   */
  countTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    
    // Basic character-based estimation
    let estimate = text.length / this.CHARS_PER_TOKEN;
    
    // Adjust for code (tends to have more tokens per char)
    const codeBlockCount = (text.match(/```/g) || []).length / 2;
    if (codeBlockCount > 0) {
      estimate *= 1.1;
    }
    
    // Adjust for lots of numbers/special chars
    const specialCharRatio = (text.match(/[^a-zA-Z\s]/g) || []).length / text.length;
    if (specialCharRatio > 0.3) {
      estimate *= 1.15;
    }
    
    // Apply safety multiplier
    estimate *= this.SAFETY_MULTIPLIER;
    
    return Math.ceil(estimate);
  },
  
  /**
   * Estimate tokens for a message object
   */
  countMessageTokens(message) {
    if (!message) return 0;
    
    let total = 0;
    
    // Count text content
    if (message.text) {
      total += this.countTokens(message.text);
    }
    
    // Count thinking/reasoning (if present)
    if (message.thinking) {
      total += this.countTokens(message.thinking);
    }
    
    // Count tool inputs
    if (message.input) {
      total += this.countTokens(JSON.stringify(message.input));
    }
    
    // Recursively count nested content
    if (message.content) {
      if (Array.isArray(message.content)) {
        for (const item of message.content) {
          total += this.countMessageTokens(item);
        }
      } else if (typeof message.content === 'object') {
        total += this.countMessageTokens(message.content);
      } else if (typeof message.content === 'string') {
        total += this.countTokens(message.content);
      }
    }
    
    return total;
  },
  
  /**
   * Estimate file tokens based on file metadata
   */
  estimateFileTokens(fileMetadata) {
    if (!fileMetadata) return 0;
    
    // Images: Based on dimensions (Claude processes images at specific resolutions)
    if (fileMetadata.file_kind === 'image') {
      const width = fileMetadata.preview_asset?.image_width || 1000;
      const height = fileMetadata.preview_asset?.image_height || 1000;
      
      // Claude uses ~765 tokens for a 768x768 image tile
      const tiles = Math.ceil(width / 768) * Math.ceil(height / 768);
      return tiles * 765;
    }
    
    // PDFs: Estimate based on page count or file size
    if (fileMetadata.file_kind === 'pdf') {
      const pages = fileMetadata.page_count || 1;
      // Average ~800 tokens per page
      return pages * 800;
    }
    
    // Text files: Use extracted text if available
    if (fileMetadata.extracted_text) {
      return this.countTokens(fileMetadata.extracted_text);
    }
    
    // Fallback: Estimate based on file size (~1 token per 4 bytes for text)
    if (fileMetadata.file_size) {
      return Math.ceil(fileMetadata.file_size / 4);
    }
    
    return 500; // Default estimate
  }
};

// Expose globally
window.TokenEstimator = TokenEstimator;
