# Claude Usage Pro

A Chrome extension that tracks your Claude.ai token usage with embedded UI and detailed analytics.

## Features

### Embedded UI
- **Sidebar Progress Bar**: See your overall usage right in Claude's sidebar
- **Chat Stats**: View conversation length, cost, and caching status near the chat title
- **Input Area Stats**: See quota percentage, messages remaining, and reset time below the model selector

### Popup Dashboard
- Overall usage with progress bar
- Per-model breakdown (Sonnet, Opus, Haiku)
- Weighted token calculations (Opus costs 5x, Haiku costs 0.2x)
- Messages count and average tokens per message
- Reset timer countdown
- Configurable quota settings

### Token Tracking
- Estimates tokens using character-based analysis
- Adjusts for code blocks and special characters
- Tracks input and output tokens separately
- Accounts for thinking/reasoning tokens

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `claude-usage-pro` folder

### Usage

1. Navigate to [claude.ai](https://claude.ai)
2. The extension will automatically inject the usage UI into the sidebar
3. Click the extension icon in the toolbar to see detailed stats
4. Use the settings gear to configure your quota

## Configuration

### Quota Settings
- **Pro users**: 45M tokens (default)
- **Max users**: Varies by plan
- **Free users**: Limited quota

Adjust the quota in the popup settings to match your plan.

## How It Works

1. **API Interception**: The extension monitors requests to Claude's API to detect messages
2. **Token Estimation**: Uses character-based estimation (~4 chars/token for English)
3. **Storage**: Usage data is stored locally in Chrome storage
4. **Reset Timer**: Tracks when your quota resets (typically daily at midnight UTC)

## Limitations

- Token counts are **estimates** - Claude's actual tokenizer may differ
- Cannot track usage from other devices/browsers
- Web search results and some MCP integrations can't be fully tracked
- Caching detection is approximate

## Privacy

- All data is stored locally in your browser
- No data is sent to external servers
- No analytics or tracking

## Development

```
claude-usage-pro/
├── manifest.json           # Extension manifest
├── background/
│   └── service-worker.js   # Background script
├── content/
│   ├── utils.js            # Shared utilities
│   ├── data-classes.js     # UsageData, ConversationData
│   ├── api-interceptor.js  # API monitoring
│   ├── sidebar-ui.js       # Sidebar integration
│   ├── chat-ui.js          # Chat area integration
│   └── main.js             # Main orchestrator
├── lib/
│   └── tokenizer.js        # Token estimation
├── popup/
│   ├── popup.html          # Popup UI
│   ├── popup.css           # Popup styles
│   └── popup.js            # Popup logic
└── styles/
    └── content.css         # Injected styles
```

## License

MIT License - feel free to modify and distribute.

## Credits

Inspired by [lugia19's Claude-Usage-Extension](https://github.com/lugia19/Claude-Usage-Extension).

Built by Nash Keller Media.
