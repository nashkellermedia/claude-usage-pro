# Testing Guide

## After Update

```bash
cd ~/claude-usage-pro
git pull
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Click refresh on **Claude Usage Pro**
3. Go to https://claude.ai
4. Open Console (F12)

## What to Look For

### ✅ **Should See (Our Extension)**:
```
📊 Message Tracker initialized
🎯 Claude Usage Pro content script loaded!
🚀 Initializing Claude Usage Pro...
✅ Message tracking started
✅ Claude Usage Pro initialized!
```

### ❌ **Ignore (Claude.ai Errors)**:
- `[Statsig]` - Analytics
- `[Intercom]` - Chat widget
- `WebSocket connection` - Real-time features
- `Failed to fetch (statsig.anthropic.com)` - Blocked by adblocker
- `net::ERR_BLOCKED_BY_CLIENT` - Blocked by adblocker

## Testing Steps

### 1. Check Badge Exists
- Look at **bottom-right corner** of page
- Should see green badge with "0% ⚡"

### 2. Test Hover
- Hover mouse over the badge
- Should see popup overlay appear above badge with:
  - Usage Overview header
  - Today: 0 / 100.0K
  - Cost: $0.00 / $1.00
  - Messages: 0
  - Resets: XX h YY m
  - Dashboard button

### 3. Test Tracking
- Send a message to Claude
- Watch console for:
  ```
  📈 Recording usage: {inputTokens: XXX, outputTokens: XXX}
  📬 Service worker received message: UPDATE_STATS
  📊 Updating stats: {tokens: XXX, cost: X.XX}
  ✅ Stats updated: {tokensUsed: XXX, ...}
  ```
- Badge should update to show percentage

### 4. Test Popup
- Click extension icon in toolbar
- Should see dashboard with updated stats

## Debugging

### If Badge Doesn't Appear:
```javascript
// In console:
document.getElementById('claude-usage-badge')
// Should return: <div id="claude-usage-badge">...</div>
```

### If Hover Doesn't Work:
```javascript
// In console:
const badge = document.getElementById('claude-usage-badge');
badge.dispatchEvent(new Event('mouseenter'));
// Overlay should appear
```

### If No Tracking:
```javascript
// In console:
window.ClaudeMessageTracker
// Should return: MessageTracker {conversationTokens: Map(0), ...}
```

### Check Storage:
```javascript
// In console:
chrome.storage.local.get('currentStats', (r) => console.log(r))
// Should show current stats
```

## Common Issues

**Q: Badge not visible?**
A: Check z-index conflicts. Try:
```javascript
document.getElementById('claude-usage-badge').style.zIndex = '999999'
```

**Q: No tracking happening?**
A: Check if tracker started:
```javascript
window.ClaudeMessageTracker.isTracking // should be true
```

**Q: Service worker crashed?**
A: Go to `chrome://extensions` → Details → Inspect service worker
Look for errors

**Q: Overlay positioned wrong?**
A: The overlay should be `position: fixed` at `bottom: 80px, right: 20px`

## Expected Console Output After Sending Message

```
📈 Recording usage: {inputTokens: 523, outputTokens: 1842, cachedTokens: 0, model: "claude-sonnet-4"}
📬 Service worker received message: UPDATE_STATS
📊 Updating stats: {tokens: 2365, cost: 0.02883, messages: 1}
✅ Stats updated: {tokensUsed: 2365, costUsed: 0.02883, messagesCount: 1, ...}
📊 Usage update received: {tokensUsed: 2365, usagePercentage: 2.365, ...}
```
