# Testing Guide for v1.6.0

## What's New
1. **Context Usage Indicator** - Shows how full your current chat session is
2. **Firebase Settings Restored** - Can now configure Firebase sync again

## Testing Steps

### 1. Context Usage Indicator

**Location**: Top of any claude.ai page

**What to check**:
- [ ] A bar appears at the very top of the page
- [ ] Shows "Context Usage: X%" 
- [ ] Shows token estimate like "(5K / 200K tokens)"
- [ ] Progress bar is visible
- [ ] Color changes based on usage:
  - Green when starting a new chat
  - Yellow after many messages
  - Red in very long conversations

**Test in different scenarios**:
- [ ] Brand new chat (should be green, near 0%)
- [ ] Medium conversation (should be yellow, 60-85%)
- [ ] Very long chat (should be red, 85%+)

**Expected behavior**:
- Updates automatically every 2 seconds
- Gives helpful hints:
  - "✓ Good - Plenty of context available" (green)
  - "⚠️ Getting full - Consider wrapping up soon" (yellow)  
  - "🔴 High usage - Start a new session for best performance" (red)

### 2. Firebase Settings

**Location**: Click extension icon → Settings (⚙️) button

**What to check**:
- [ ] "Firebase Sync (Optional)" section is visible
- [ ] Text input field for Firebase URL
- [ ] Help icon (ℹ️) button next to label
- [ ] Click help icon shows setup instructions
- [ ] Instructions include Firebase console URL
- [ ] Instructions explain security rules
- [ ] Can type/paste Firebase URL into field
- [ ] URL saves when you click "Save Settings"

**To test saving**:
1. Paste any URL like `https://test-project.firebaseio.com`
2. Click "Save Settings"
3. Close popup
4. Open popup again → Settings
5. Verify URL is still there

### 3. Regression Testing

Make sure old features still work:

**Popup Stats**:
- [ ] Current Session percentage shows correctly
- [ ] Weekly All Models percentage shows correctly
- [ ] Weekly Sonnet percentage shows correctly
- [ ] Progress bars animate properly
- [ ] Colors change (green/yellow/red) based on usage

**Settings Panel**:
- [ ] Badge Display dropdown works
- [ ] Show Sidebar checkbox works
- [ ] Show Chat Input Stats checkbox works
- [ ] Enable Voice-to-Text checkbox works
- [ ] All settings save and persist

**Sidebar Widget** (left side of screen):
- [ ] Shows current usage stats
- [ ] Updates automatically
- [ ] Positioned between "Code" and "Starred"

**Chat Input Stats** (below chat box):
- [ ] Shows draft token count
- [ ] Shows session/weekly percentages
- [ ] Shows reset timer

## Common Issues & Solutions

### Context Indicator Not Showing
- Refresh the Claude.ai page
- Check browser console for errors (F12)
- Verify extension is enabled in chrome://extensions

### Firebase Settings Not Saving
- Make sure you clicked "Save Settings" button
- Check that URL is valid format
- Look for success message or error in console

### Context Percentage Seems Wrong
- This is an **estimate** based on message count
- More accurate on longer conversations
- Each message ≈ 800 tokens estimated

## Success Criteria

✅ Context indicator displays at top of page
✅ Firebase settings section visible in popup
✅ Help icon shows instructions when clicked
✅ Both features work without breaking existing functionality
✅ Extension version shows v1.6.0

## Need Help?

Check browser console (F12) for any error messages starting with:
- `[Claude Usage Pro]`
- `[CUP]`
