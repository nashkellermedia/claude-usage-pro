# Changes v1.6.1

## Based on User Feedback

### ❌ Removed
- **Top context indicator bar** - User found it too intrusive

### ✅ Changed
- **Moved context usage to sidebar** - Added "💬 Context Usage" section in left sidebar widget
- **Added context to chat overlay** - Bottom bar now shows context percentage alongside other stats
- **Enhanced chat overlay background** - Added semi-transparent background with blur to prevent blending into chat text

### Details

**Sidebar Widget** (left side):
- New section: "💬 Context Usage: XX%"
- Progress bar with color coding (green/yellow/red)
- Status hints:
  - "✓ Good - plenty available" (0-60%)
  - "⚠️ Getting full" (60-85%)
  - "🔴 Start new session" (85-100%)

**Chat Overlay** (below input):
- Added "💬 Context: XX%" stat
- Now shows: Draft | Context | Session | Weekly | Sonnet | Timer
- Background: `rgba(255, 255, 255, 0.95)` with backdrop blur
- Dark mode support: `rgba(30, 30, 30, 0.95)`

**Updates**:
- Both sidebar and chat overlay update context every 5 seconds
- Same estimation: ~800 tokens per message + 5K system prompt
- Consistent color coding across both displays

## Files Modified
- `content/sidebar-ui.js` - Added context section and update logic
- `content/chat-ui.js` - Added context stat and update logic
- `content/styles.css` - Added background/blur to chat overlay
- `content/main.js` - Disabled top indicator, added periodic updates

## Result
✅ Context usage is now integrated into existing UI elements
✅ No intrusive top bar
✅ Chat overlay stands out with visible background
✅ Information available in two convenient locations
