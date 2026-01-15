// Debug script to find attachment elements in Claude's UI
// Run this in the console when you have an attachment added

function debugAttachments() {
  console.log('=== Debugging Claude Attachment Elements ===');
  
  // Find the composer area
  const contentEditable = document.querySelector('[contenteditable="true"]');
  console.log('ContentEditable found:', !!contentEditable);
  
  if (!contentEditable) return;
  
  // Walk up the tree and log each level
  let el = contentEditable;
  let level = 0;
  console.log('\n--- Ancestor tree from contenteditable ---');
  while (el && level < 10) {
    console.log(`Level ${level}:`, {
      tag: el.tagName,
      class: el.className?.substring?.(0, 100),
      id: el.id,
      testId: el.getAttribute?.('data-testid'),
      childCount: el.children?.length
    });
    el = el.parentElement;
    level++;
  }
  
  // Now search for anything that looks like an attachment
  console.log('\n--- Searching for attachment-like elements ---');
  
  const searches = [
    'img[src^="blob:"]',
    'img[src*="uploads"]',
    'img[src*="thumbnail"]',
    '[data-testid]',
    '[class*="file"]',
    '[class*="File"]',
    '[class*="attachment"]',
    '[class*="Attachment"]',
    '[class*="upload"]',
    '[class*="Upload"]',
    '[class*="image"]',
    '[class*="Image"]',
    '[class*="preview"]',
    '[class*="Preview"]',
    '[class*="thumbnail"]',
    '[class*="Thumbnail"]',
    'button[aria-label]',
    '[role="img"]',
    '[aria-label*="file"]',
    '[aria-label*="image"]',
    '[aria-label*="remove"]',
    '[aria-label*="Remove"]'
  ];
  
  const found = new Map();
  
  for (const selector of searches) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        for (const el of elements) {
          // Create a unique key
          const key = el.outerHTML.substring(0, 200);
          if (!found.has(key)) {
            found.set(key, {
              selector,
              tag: el.tagName,
              class: el.className?.substring?.(0, 150),
              testId: el.getAttribute('data-testid'),
              ariaLabel: el.getAttribute('aria-label'),
              src: el.src?.substring?.(0, 100),
              alt: el.alt,
              title: el.title,
              role: el.getAttribute('role'),
              innerText: el.innerText?.substring?.(0, 50)
            });
          }
        }
      }
    } catch (e) {}
  }
  
  console.log(`Found ${found.size} unique elements:`);
  for (const [key, info] of found) {
    console.log('\nElement:', info);
  }
  
  // Specifically look near the contenteditable
  console.log('\n--- Elements near contenteditable (siblings/parent siblings) ---');
  const parent = contentEditable.parentElement;
  if (parent) {
    for (const child of parent.children) {
      if (child !== contentEditable) {
        console.log('Sibling:', {
          tag: child.tagName,
          class: child.className?.substring?.(0, 100),
          testId: child.getAttribute?.('data-testid'),
          innerHTML: child.innerHTML?.substring?.(0, 200)
        });
      }
    }
  }
  
  // Look in grandparent
  const grandparent = parent?.parentElement;
  if (grandparent) {
    console.log('\n--- Grandparent children ---');
    for (const child of grandparent.children) {
      console.log('GP Child:', {
        tag: child.tagName,
        class: child.className?.substring?.(0, 100),
        testId: child.getAttribute?.('data-testid')
      });
    }
  }
  
  console.log('\n=== End Debug ===');
}

// Run it
debugAttachments();

// Also expose globally for manual runs
window.debugAttachments = debugAttachments;
