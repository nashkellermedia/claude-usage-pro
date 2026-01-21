# Changelog

## [2.3.4] - 2026-01-21

### Fixed
- **Model Tracking Not Updating** (Issue reported)
  - Fixed model usage count not incrementing after first message
  - Added proper error handling for message sends (was silently failing)
  - Model names now normalized to friendly display names (e.g., "Claude Sonnet 4.5" instead of "claude-sonnet-4-5-20250929")
  - Added `normalizeModelName()` method to map API model IDs to human-readable names
  - Fixed `recordModelUsage()` to properly await save operation

### Changed
- **Debug Mode Enabled** - Temporarily enabled to help diagnose tracking issues
- **Improved Model Detection** - Updated `getCurrentModelFromUI()` with better DOM selectors and debug logging

### Technical
- Added normalizeModelName() for consistent model tracking across different API responses
- Fixed `.catch(() => {})` silent error swallowing - now logs errors properly
- Model tracking now works for Claude 3, 3.5, 4, and 4.5 variants

## [2.3.3] - 2026-01-21

### Fixed
- **Correct Model Detection** (Issue #XX)
  - Fixed model tracking showing old version `claude-sonnet-4-20250514` instead of current `claude-sonnet-4-5-20250929`
  - Added `getCurrentModelFromUI()` method to detect model from UI when API doesn't provide it
  - Now correctly tracks Claude Sonnet 4.5, Opus 4.5, and Haiku 4.5
  - Model names now match actual Claude 4.5 model versions

### Technical
- Added getCurrentModelFromUI() to scrape model selector from DOM
- Maps UI text ("Sonnet", "Opus", "Haiku") to correct model IDs
- Fallback chain: data.model → UI detection → default (Sonnet 4.5)
- Updated model references throughout api-interceptor.js

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

## [2.4.0] - 2026-01-21

### Added
- DOM-based message send detection for model tracking (since fetch intercept doesn't work with Claude.ai's architecture)
- Firebase-safe model keys with display name conversion
- Comprehensive data merge strategy for Firebase sync (takes higher values instead of overwriting)
- Global handler to suppress common connection errors after extension reload
- CLEAN_MODEL_USAGE message handler for clearing bad data

### Fixed
- Model tracking now correctly detects Opus 4.5, Sonnet 4.5, etc. from UI selector
- Firebase sync no longer overwrites local data with older remote data
- Model usage, peak usage, daily snapshots, and threshold events all merge properly
- Invalid Firebase keys (spaces, dots, colons) are now sanitized
- Fixed usage data extraction from Firebase merged response

### Changed
- Disabled debug logging for production
- Removed development console.log statements
