// Run this in the browser console on claude.ai to check model tracking
// This will help diagnose why models aren't showing up

console.log('=== Claude Usage Pro - Model Tracking Debug ===');

// 1. Check storage
chrome.storage.local.get('usageAnalytics', (result) => {
  console.log('\n1. Storage Data:');
  console.log('  usageAnalytics exists:', !!result.usageAnalytics);
  
  if (result.usageAnalytics) {
    console.log('  modelUsage:', result.usageAnalytics.modelUsage);
    console.log('  dailySnapshots keys:', Object.keys(result.usageAnalytics.dailySnapshots || {}));
    
    if (result.usageAnalytics.modelUsage) {
      console.log('\n  Model entries:');
      for (const [model, count] of Object.entries(result.usageAnalytics.modelUsage)) {
        console.log(`    ${model}: ${count} (type: ${typeof count})`);
      }
    } else {
      console.log('  modelUsage is empty or undefined');
    }
  }
});

// 2. Manually trigger a model recording
console.log('\n2. Testing manual model recording...');
chrome.runtime.sendMessage({
  type: 'ADD_TOKEN_DELTA',
  inputTokens: 100,
  outputTokens: 200,
  model: 'claude-sonnet-4-20250514'
}, (response) => {
  console.log('  Response:', response);
  
  // Check storage again
  setTimeout(() => {
    chrome.storage.local.get('usageAnalytics', (result) => {
      console.log('\n3. After manual trigger:');
      console.log('  modelUsage:', result.usageAnalytics?.modelUsage);
    });
  }, 500);
});

console.log('\n4. Check background service worker:');
console.log('  Open chrome://extensions');
console.log('  Find "Claude Usage Pro"');
console.log('  Click "service worker" link');
console.log('  Look for [UsageAnalytics] or [CUP BG] logs');
