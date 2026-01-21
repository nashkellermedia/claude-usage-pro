# Changelog

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
