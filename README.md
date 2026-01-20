# Claude Usage Pro

A Chrome extension that tracks your Claude.ai usage in real-time with visual overlays, accurate token counting, voice input, and optional cross-device sync.

![Version](https://img.shields.io/badge/version-2.1.26-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 🚀 Quick Start (2 Minutes)

### Step 1: Install the Extension

**Option A: Chrome Web Store** (Recommended)
- Coming soon!

**Option B: Manual Install** (Developer Mode)
1. Download or clone this repository
2. Open Chrome → `chrome://extensions`
3. Enable **"Developer mode"** (toggle in top right)
4. Click **"Load unpacked"**
5. Select the `claude-usage-pro` folder

### Step 2: Start Using It

1. Go to [claude.ai](https://claude.ai)
2. **That's it!** You'll see:
   - 📊 **Sidebar widget** (left side) - Usage percentages
   - 📝 **Stats bar** (below chat input) - Draft tokens, file count, usage
   - 🔢 **Badge icon** - Quick usage percentage

### Step 3: Click the Extension Icon

Click the Claude Usage Pro icon in your toolbar to see:
- Detailed usage breakdown
- Session & weekly limits
- Reset timers
- Settings

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📊 **Real-time Usage** | See session, weekly, and Sonnet usage percentages |
| ✏️ **Token Counter** | Count tokens as you type (estimated or accurate) |
| 📎 **File Detection** | Estimates tokens for attached files |
| 🎤 **Voice Input** | Dictate messages (Ctrl+Shift+V) |
| 📈 **Analytics** | Track usage patterns over time |
| ☁️ **Cross-device Sync** | Optional Firebase sync across devices |
| 🎨 **Visual Indicators** | Color-coded health (green/orange/red) |

---

## ⚙️ Optional Setup

The extension works great out of the box, but you can enable these optional features:

### 🔢 Accurate Token Counting (Free)

Get exact token counts instead of estimates using Anthropic's API.

1. Go to [Anthropic Console](https://console.anthropic.com/settings/keys)
2. Create an API key (free tier is fine - token counting doesn't cost anything)
3. Click the extension icon → **Settings** (gear icon)
4. Paste your API key in **"Anthropic API Key"**
5. Click **Save Settings**

You'll see a ✓ next to token counts when accurate counting is active.

---

### ☁️ Cross-Device Sync (Firebase)

Sync your usage data across multiple devices or Chrome profiles.

> **Note:** You provide your own Firebase project. Your data stays in YOUR account - we never see it.

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

**Tip:** Use the ⬆️ Push and ⬇️ Pull buttons to manually sync if needed.

</details>

---

## 🎨 Display Options

Toggle these in Settings:

| Option | Description |
|--------|-------------|
| **Show Sidebar** | Floating widget on left side of Claude |
| **Show Chat Overlay** | Stats bar below chat input |
| **Show Badge** | Usage % on extension icon |
| **Voice Input** | Enable/disable microphone button |

---

## 📊 Understanding the Colors

All usage meters use semantic colors:

| Color | Usage | Meaning |
|-------|-------|---------|
| 🟢 Green | 0-69% | Healthy - plenty left |
| 🟠 Orange | 70-89% | Caution - getting there |
| 🔴 Red | 90-100% | Critical - near limit |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+V` | Toggle voice input (Mac: `Cmd+Shift+V`) |

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

---

## 📁 Project Structure

```
claude-usage-pro/
├── manifest.json        # Extension manifest
├── background/
│   └── service-worker.js    # Background service
├── content/
│   ├── main.js              # Main orchestrator
│   ├── sidebar-ui.js        # Sidebar widget
│   ├── chat-ui.js           # Chat overlay + attachments
│   ├── voice-input.js       # Voice dictation
│   ├── usage-scraper.js     # Scrapes usage from Claude
│   ├── api-interceptor.js   # Monitors API calls
│   └── styles.css           # Injected styles
├── popup/
│   ├── popup.html           # Popup UI
│   ├── popup.css            # Popup styles
│   └── popup.js             # Popup logic
├── lib/
│   └── tokenizer.js         # Token estimation
└── icons/                   # Extension icons
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

Inspired by [lugia19's Claude-Usage-Extension](https://github.com/lugia19/Claude-Usage-Extension).
