# Claude Usage Pro

A Chrome extension that tracks your Claude.ai usage in real-time with visual overlays, accurate token counting, voice input, auto-continue, rate limit warnings, and optional cross-device sync.

![Version](https://img.shields.io/badge/version-2.3.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 📥 Installation

### Option A: Chrome Web Store (Recommended)
*Coming soon!*

### Option B: Manual Install (Developer Mode)

1. **Download the extension:**
   - Go to [Releases](https://github.com/NashKellerMedia/claude-usage-pro/releases)
   - Download the latest `claude-usage-pro-vX.X.X.zip`
   - Unzip the file to a folder on your computer

2. **Install in Chrome:**
   - Open Chrome and go to `chrome://extensions`
   - Enable **"Developer mode"** (toggle in top right corner)
   - Click **"Load unpacked"**
   - Select the unzipped folder

3. **You're done!** The extension icon will appear in your toolbar.

> **Note:** With manual install, you'll need to manually update when new versions are released.

---

## 🚀 Quick Start

1. Go to [claude.ai](https://claude.ai)
2. **That's it!** You'll immediately see:
   - 📊 **Sidebar widget** (left side) - Usage percentages, rate limits, time tracking
   - 📝 **Stats bar** (below chat input) - Draft tokens, file count, usage, reset timer
   - 🔢 **Badge icon** - Quick usage percentage or rate limit indicator

3. Click the extension icon in your toolbar for detailed stats and settings.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📊 **Real-time Usage** | See session, weekly, and Sonnet usage percentages |
| ✏️ **Token Counter** | Count tokens as you type (estimated or accurate) |
| 📎 **File Detection** | Estimates tokens for attached files |
| 🎤 **Voice Input** | Dictate messages (Ctrl+Shift+V or hold V) |
| 🤖 **Auto-Continue** | Automatically clicks Continue button when responses are truncated |
| ⚠️ **Rate Limit Warnings** | Visual warnings and countdown when rate limited |
| ⏱️ **Time Tracking** | Shows time until usage resets |
| 📈 **Analytics** | Track usage patterns over time with sparklines |
| ☁️ **Cross-device Sync** | Optional Firebase sync across devices |
| 🎨 **Visual Indicators** | Color-coded health (green/orange/red) |
| 🔔 **Notifications** | Get notified when usage resets |
| 🎛️ **Customizable Stats Bar** | Choose which stats appear in the input area |

---

## ⚙️ Optional Setup

The extension works great out of the box! These features are optional:

### 🔢 Accurate Token Counting (Free)

Get exact token counts instead of estimates using Anthropic's free API.

1. Go to [Anthropic Console](https://console.anthropic.com/settings/keys)
2. Create an API key (token counting is completely free)
3. Click the extension icon → **Settings** (gear icon)
4. Paste your API key in **"Anthropic API Key"**
5. Click **Save Settings**

---

### ☁️ Cross-Device Sync (Firebase)

Sync your usage data across multiple devices or Chrome profiles.

> **Note:** You provide your own Firebase project - your data stays in YOUR account.

<details>
<summary><strong>Click to expand Firebase setup instructions</strong></summary>

#### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Create a project"** (or use existing)
3. Name it anything (e.g., "claude-usage-sync")
4. Disable Google Analytics (not needed)
5. Click **Create**

#### Step 2: Create Realtime Database

1. In your project, go to **Build → Realtime Database**
2. Click **"Create Database"**
3. Choose any location
4. Start in **"locked mode"** (we'll set rules next)
5. Copy your **Database URL** (looks like `https://your-project-default-rtdb.firebaseio.com`)

#### Step 3: Enable Anonymous Auth

1. Go to **Build → Authentication**
2. Click **"Get started"**
3. Go to **"Sign-in method"** tab
4. Click **"Anonymous"**
5. Enable it and click **Save**

#### Step 4: Get Your API Key

1. Click the **gear icon** → **Project settings**
2. Scroll to **"Your apps"** section
3. If no app exists, click the **web icon (</>)** to create one
4. Copy the **"apiKey"** value (starts with `AIzaSy...`)

#### Step 5: Set Database Rules

1. Go to **Realtime Database → Rules**
2. Replace the rules with:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    },
    "sync": {
      "$syncId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

3. Click **Publish**

#### Step 6: Configure the Extension

1. Click the extension icon → **Settings**
2. Enter your **Database URL**
3. Enter your **API Key**
4. Enter a **Sync ID** (e.g., "my-sync-2024")
5. Click **Save Settings**

#### Step 7: Sync Other Devices

On each additional device/profile:
1. Install the extension
2. Enter the **same** Database URL, API Key, and **Sync ID**
3. Click **Save Settings** → data will sync automatically

</details>

---

## 🎨 Display Options

Toggle these in Settings → Display:

| Option | Description |
|--------|-------------|
| **Show Sidebar** | Floating widget on left side of Claude |
| **Start Minimized** | Sidebar starts collapsed (saves screen space) |
| **Show Chat Overlay** | Stats bar below chat input |
| **Customizable Stats** | Choose which stats appear (draft tokens, files, session/weekly/sonnet %, timer) |

---

## 🤖 Auto-Continue Feature

Settings → Auto-Continue:

| Setting | Default | Description |
|---------|---------|-------------|
| **Enable Auto-Continue** | On | Automatically clicks Continue when Claude's response is truncated |
| **Delay** | 1500ms | How long to wait before auto-clicking (500-10000ms) |
| **Max Continues** | 10 | Maximum times to auto-continue per response chain |

When active, you'll see:
- Visual countdown before each auto-click
- Cancel button to stop the chain
- Notification when max limit is reached

---

## ⚠️ Rate Limit Warnings

When you hit Claude's rate limits, you'll see:

- **Sidebar widget**: Red banner with countdown to reset
- **Stats bar**: Rate limit indicator
- **Badge icon**: Changes to ⛔
- **Notification**: Alert when first rate limited (if notifications enabled)

The extension automatically detects rate limits from:
- HTTP 429 responses from Claude API
- Rate limit banners/messages in Claude.ai UI
- Usage reaching 100%

---

## 🔔 Notifications

Settings → Notifications:

| Option | Description |
|--------|-------------|
| **Reset Notifications** | Get notified when usage resets (5 hour window or new week) |
| **Auto-refresh** | Automatically refresh usage data when stale |
| **Refresh Interval** | How often to auto-refresh (5-120 minutes, default: 30) |

---

## 📊 Understanding the Colors

All usage meters use semantic colors:

| Color | Usage | Meaning |
|-------|-------|---------|
| 🟢 Green | 0-69% | Healthy - plenty left |
| 🟠 Orange | 70-89% | Caution - getting there |
| 🔴 Red | 90-100% | Critical - near limit |

You can customize the warning (70%) and danger (90%) thresholds in Settings → Advanced.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+V` | Toggle voice input (Mac: `Cmd+Shift+V`) |
| Hold `V` | Push-to-talk (while composing message) |

---

## 🔒 Privacy

- **Local by default** - All data stored in your browser
- **No tracking** - Zero analytics or telemetry
- **Your Firebase** - Optional sync uses YOUR account
- **Direct API calls** - Anthropic calls go direct, not through us

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for full details.

---

## 🐛 Troubleshooting

**Usage shows 0% or --**
- Click the refresh button (🔄) in the popup
- Make sure you're on claude.ai

**Token count shows ~**
- This means estimated. Add Anthropic API key for accurate counts.

**Firebase not syncing**
- Check that Anonymous auth is enabled
- Verify database rules are set correctly
- Ensure Sync ID matches on all devices

**Sidebar/overlay not showing**
- Check Settings → Display options are enabled
- Try refreshing the Claude page

**Auto-Continue not working**
- Make sure it's enabled in Settings → Auto-Continue
- Check that you haven't reached the max continues limit (default: 10)
- Try increasing the delay if it's clicking too quickly

**Rate limit warnings not appearing**
- Extension automatically detects rate limits
- Make sure you haven't disabled notifications in Settings

---

## 📁 Project Structure

```
claude-usage-pro/
├── manifest.json           # Extension manifest
├── background/
│   └── service-worker.js   # Background service
├── content/
│   ├── main.js             # Main orchestrator
│   ├── sidebar-ui.js       # Sidebar widget
│   ├── chat-ui.js          # Chat overlay & stats bar
│   ├── voice-input.js      # Voice dictation
│   ├── auto-continue.js    # Auto-continue functionality
│   ├── api-interceptor.js  # Rate limit detection
│   ├── usage-scraper.js    # Scrapes usage data
│   ├── time-tracker.js     # Reset countdown timer
│   ├── utils.js            # Shared utilities
│   └── styles.css          # Injected styles
├── popup/
│   ├── popup.html          # Popup UI
│   ├── popup.css           # Popup styles
│   └── popup.js            # Popup logic
├── lib/
│   └── tokenizer.js        # Token estimation
└── icons/                  # Extension icons
```

---

## 🤝 Contributing

Issues and pull requests welcome!

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Credits

Built by [Nash Keller Media](https://nashkellermedia.com).
