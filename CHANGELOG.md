# Changelog

All notable changes to Claude Usage Pro.

## [2.1.23] - 2025-01-20

### Fixed
- Sidebar/overlay now populate with data immediately when enabled via settings (no refresh needed)

## [2.1.22] - 2025-01-20

### Changed
- All usage metrics now use consistent semantic colors (green/orange/red based on %)
- Removed purple color for Sonnet - now uses same health-based coloring

## [2.1.21] - 2025-01-20

### Improved
- Better file attachment detection for .md, .doc, .pdf and other file types
- Detection now finds file chips by looking for remove buttons + filename patterns

## [2.1.20] - 2025-01-20

### Fixed
- Ultra-conservative attachment detection to eliminate false positives
- Added clear button (✕) next to file count for manual reset

## [2.1.19] - 2025-01-20

### Fixed
- Data structure mismatch in Firebase sync causing popup to show 0% while sidebar showed correct data
- Settings changes now create UI elements immediately if they were missing

## [2.1.18] - 2025-01-20

### Added
- Auto-pull from Firebase every 60 seconds for cross-device sync

## [2.1.17] - 2025-01-20

### Added
- Push button to manually upload data to Firebase
- Better logic for Sync ID changes (push if has data, pull if empty)

## [2.1.16] - 2025-01-20

### Fixed
- Simplified voice button injection for more reliable persistence

## [2.1.15] - 2025-01-20

### Added
- **Sync ID** for cross-device/cross-profile sync via Firebase
- Same Sync ID on multiple devices = shared data

## [2.1.0] - 2025-01-20

### Added
- Firebase sync for cross-device usage tracking
- Anthropic API integration for accurate token counting
- Voice input with speech-to-text (Ctrl+Shift+V)
- Usage analytics with daily snapshots
- Sidebar widget and chat overlay

## [1.0.0] - 2025-01-13

### Initial Release
- Basic usage tracking via page scraping
- Popup dashboard with usage stats
- Local storage for data persistence
