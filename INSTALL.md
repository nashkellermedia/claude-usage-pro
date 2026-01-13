# 🚀 Installation Guide

## Quick Install (5 minutes)

### 1. Download the Extension

**Option A: Clone with Git**
```bash
git clone https://github.com/nashkellermedia/claude-usage-pro.git
cd claude-usage-pro
```

**Option B: Download ZIP**
1. Go to https://github.com/nashkellermedia/claude-usage-pro
2. Click green "Code" button
3. Click "Download ZIP"
4. Extract the ZIP file somewhere safe

### 2. Install in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `claude-usage-pro` folder
5. Done! 🎉

You should now see the extension icon in your toolbar (may need to click the puzzle icon to pin it).

### 3. Test It Out

1. Go to https://claude.ai
2. Click the extension icon - you should see the dashboard popup
3. Badge should show "0%" (you haven't used anything yet)
4. Send a message to Claude
5. Badge and stats will update!

### 4. Configure Badge (Optional)

Click the extension icon and scroll to "Badge Display" section:
- **Percentage** (default) - Shows 0-100% usage
- **Tokens Remaining** - Shows "42K" tokens left
- **Cost Remaining** - Shows "$0.50" remaining
- **Message Count** - Shows number of messages today
- **Custom** - Type your own 1-4 character text

---

## 🔧 Current Status

**✅ Working Now:**
- Extension installs and runs
- Beautiful popup dashboard
- Badge modes work (try switching them!)
- Settings infrastructure
- Stats tracking framework

**🚧 Coming Very Soon (within days):**
- Actual token tracking from Claude messages
- Live overlay on Claude.ai
- Accurate cost calculations
- Firebase multi-device sync
- Analytics dashboard

**📝 This is v0.1.0** - The foundation is solid, now adding the tracking features!

---

## 🆘 Troubleshooting

**"Extension error" when loading:**
- Make sure you selected the folder containing `manifest.json`
- Try clicking the extension's "Errors" button to see details

**Badge doesn't show:**
- This is normal for now - badge will activate once tracking is added
- You can still test badge mode switching in the popup

**Popup shows "Loading...":**
- Refresh the extension (click refresh button on chrome://extensions)
- Check browser console for errors

---

## 📬 Questions?

Open an issue on GitHub: https://github.com/nashkellermedia/claude-usage-pro/issues

---

**Next Steps:**
- Try switching badge modes in the popup
- Explore the clean dashboard UI
- Stay tuned for tracking features coming this week!
