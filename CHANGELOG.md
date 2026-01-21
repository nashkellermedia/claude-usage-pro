# Changelog

## [2.3.2] - 2026-01-21

### Fixed
- **Model Tracking Debug Logging**
  - Added detailed logging to recordModelUsage() to diagnose tracking issues
  - Added modelUsage summary logs on initialization
  - Helps identify if models are being recorded correctly

### Technical
- Added logging: "[UsageAnalytics] Model usage recorded: {model} - count: {count}"
- Added logging: "[UsageAnalytics] modelUsage entries: {count}"
- Added logging for when recordModelUsage called with no model

# Changelog

## [2.3.1] - 2026-01-21

### Fixed
- **Model Breakdown Display** (Issue #XX)
  - Fixed "[object Object]" appearing in analytics model breakdown
  - Added data validation filter to skip corrupted model usage entries
  - Added automatic cleanup of corrupted modelUsage data on initialization
  - Model breakdown now correctly displays model names and usage counts

### Technical
- Added `typeof count === "number"` filter in popup.js analytics display
- Added modelUsage data cleanup in UsageAnalytics.initialize()
- Prevents future data corruption by validating entries before display

## [2.3.0] - 2026-01-21

### Added
- **Auto-Continue Feature**
  - Automatically clicks the "Continue" button when Claude's response is truncated
  - Configurable delay before clicking (default: 1500ms)
  - Maximum auto-continues limit per response chain (default: 10)
  - Visual indicator showing countdown before auto-click
  - Cancel button to stop auto-continue if needed
  - Notification when max continues limit is reached
  - Toggle on/off in settings

### Technical
- New `content/auto-continue.js` module
- DOM MutationObserver for detecting Continue button appearance
- Settings: `enableAutoContinue`, `autoContinueDelay`, `maxAutoContinues`

## [2.2.0] - 2026-01-21

### Added
- **Rate Limit Detection & Warning** (Issue #53)
  - Detects HTTP 429 rate limit responses from Claude API
  - Monitors DOM for rate limit banners/messages from Claude.ai UI
  - Shows rate limit banner in sidebar widget with countdown timer
  - Shows rate limit indicator in stats bar
  - Displays notification when rate limited (if notifications enabled)
  - Badge changes to ⛔ when rate limited
  - Auto-detects rate limit when usage reaches 100%
  - Automatic countdown to reset time
  - Rate limit history tracking for analytics

### Technical
- Added `onRateLimited` callback to APIInterceptor
- Added DOM MutationObserver for rate limit banner detection
- Added rate limit state management in background service worker
- Added `RATE_LIMIT_DETECTED`, `RATE_LIMIT_CLEARED`, `GET_RATE_LIMIT_STATE` message types

## [2.1.58] - 2026-01-21

### Fixed
- Various bug fixes and improvements

## [2.1.0] - 2026-01-20

### Added
- Initial public release
- Real-time usage tracking
- Token counting (estimated and accurate via API)
- Cross-device Firebase sync
- Voice input
- Time tracking
- Analytics and sparklines
