# Claude Usage Pro - Changelog

## v1.6.0 (Current)

### New Features

#### 🎯 Context Usage Indicator
- **Visual progress bar** at the top of every Claude.ai page
- Shows real-time estimate of context usage in current chat
- **Color-coded warnings**:
  - 🟢 **Green (0-60%)**: Good - Plenty of context available
  - 🟡 **Yellow (60-85%)**: Warning - Getting full, consider wrapping up
  - 🔴 **Red (85-100%)**: Danger - High usage, start new session for best performance
- Displays estimated tokens used vs. total (e.g., "45K / 200K tokens")
- Updates every 2 seconds
- Helps you know when to start a new chat session to maintain Claude's performance

#### 🔥 Firebase Settings Restored
- Added back Firebase configuration in Settings panel
- Input field for Firebase Realtime Database URL
- Built-in help button (ℹ️) with complete setup instructions
- Optional cross-device sync capability
- Instructions include:
  - How to create a Firebase project
  - Setting up Realtime Database
  - Configuring security rules
  - Getting your database URL

### Technical Changes
- Added `content/context-indicator.js` for context tracking
- Enhanced CSS for Firebase fields and help tooltips
- Updated popup.js to handle Firebase URL storage
- Improved manifest structure

### Files Modified
- `popup/popup.html` - Added Firebase settings section
- `popup/popup.js` - Added Firebase handling and help toggle
- `popup/popup.css` - Added styles for Firebase inputs and help icon
- `content/styles.css` - Added context indicator styles
- `content/main.js` - Initialize context indicator
- `manifest.json` - Added context-indicator.js, bumped to v1.6.0

---

## v1.5.0

### Features
- Voice-to-text input with microphone button
- Customizable badge display options
- Independent UI component toggles
- Enhanced sidebar positioning
- Improved model detection

### Bug Fixes
- Fixed Opus 4.5 model detection
- Corrected sidebar placement between Code and Starred sections
- Improved data scraping accuracy

---

## v1.4.0 and Earlier
- Initial release with usage tracking
- Sidebar widget implementation
- Chat overlay stats
- Weekly usage limits tracking
