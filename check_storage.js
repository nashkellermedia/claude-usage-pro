// Simple script to check chrome storage - paste into browser console
chrome.storage.local.get('usageAnalytics', (result) => {
  console.log('Full usageAnalytics:', result.usageAnalytics);
  if (result.usageAnalytics?.modelUsage) {
    console.log('modelUsage entries:');
    for (const [model, count] of Object.entries(result.usageAnalytics.modelUsage)) {
      console.log(`  ${model}:`, count, `(type: ${typeof count})`);
    }
  }
});
