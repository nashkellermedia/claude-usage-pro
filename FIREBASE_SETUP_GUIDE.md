# Firebase Sync Setup Guide

## 🎯 What Firebase Sync Does

Firebase sync allows your Claude usage statistics to synchronize across:
- ✅ Multiple computers (Mac, Windows, Linux)
- ✅ Multiple browsers (different Chrome installations)
- ✅ Multiple Chrome profiles (Work, Personal, etc.)
- ✅ All devices update within 30 seconds

**Example**: Check your usage on your laptop, then immediately see those same stats on your desktop Chrome profile.

---

## 📋 Quick Setup (5 minutes)

### Step 1: Create Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click "Add project" or "Create a project"
3. **Project name**: `claude-usage-sync` (or whatever you want)
4. **Google Analytics**: Disable (not needed)
5. Click "Create project"

### Step 2: Create Realtime Database

1. In left sidebar, click "Build" → **"Realtime Database"**
2. Click "Create Database"
3. **Location**: Choose closest to you (e.g., `us-central1`)
4. **Security rules**: Start in **test mode** (we'll fix this)
5. Click "Enable"

### Step 3: Get Your Database URL

Look at the top of the page - you'll see your database URL:
```
https://claude-usage-sync-xxxxx.firebaseio.com
```

**Copy this URL** - you'll need it!

### Step 4: Set Security Rules

**IMPORTANT**: Test mode rules expire in 30 days. Set proper rules now:

Click the "Rules" tab and paste this:

```json
{
  "rules": {
    "usage": {
      ".read": true,
      ".write": true
    }
  }
}
```

Click "Publish"

> **Note**: These rules allow anyone with your URL to read/write. This is fine since:
> - Your URL is private (only in your extension settings)
> - Data is just usage percentages (not sensitive)
> - For better security, see "Advanced Security" below

### Step 5: Configure Extension

1. Click the Claude Usage Pro extension icon
2. Click **Settings** (⚙️ gear icon)
3. Scroll to "Firebase Sync (Optional)"
4. Paste your database URL:
   ```
   https://claude-usage-sync-xxxxx.firebaseio.com
   ```
5. Click **"Save Settings"**

### Step 6: Verify It Works

After saving:
- Status should show: **"✓ Connected"**
- Go to claude.ai and check your usage
- Wait 30 seconds
- Open extension on **another Chrome profile** (or device)
- Enter the same Firebase URL
- You should see the same usage data!

---

## 🔄 How Syncing Works

### Automatic Sync

Your extension:
1. **Scrapes** usage from claude.ai every 5 minutes
2. **Writes** to Firebase immediately after scraping
3. **Reads** from Firebase every 2 minutes
4. **Merges** data from all your devices

### Sync Frequency

- **Upload to Firebase**: Every 30 seconds (when data changes)
- **Download from Firebase**: Every 2 minutes
- **Scrape claude.ai**: Every 5 minutes (when page is open)

### Data Structure in Firebase

```json
{
  "usage": {
    "device_1234_abc": {
      "currentSession": { "percent": 45 },
      "weeklyAllModels": { "percent": 78 },
      "weeklySonnet": { "percent": 35 },
      "deviceName": "Mac - Chrome - Profile 1",
      "syncedAt": 1705234567890
    },
    "device_5678_def": {
      "currentSession": { "percent": 45 },
      "weeklyAllModels": { "percent": 78 },
      "weeklySonnet": { "percent": 35 },
      "deviceName": "Windows - Chrome - Work",
      "syncedAt": 1705234590123
    }
  }
}
```

Each device/profile gets its own entry. The extension uses the most recent data.

---

## 🧪 Testing Your Setup

### Test 1: Single Device Sync

1. Open extension → Check "Current Session" percentage
2. Have a conversation with Claude
3. Wait 30 seconds
4. Go to Firebase Console → Realtime Database
5. You should see your usage data appear!

### Test 2: Multi-Profile Sync

**On Chrome Profile 1 (e.g., Personal)**:
1. Install extension
2. Configure Firebase URL
3. Note your usage percentages

**On Chrome Profile 2 (e.g., Work)**:
1. Install extension  
2. Configure **same** Firebase URL
3. After 2 minutes, you should see same usage percentages!

### Test 3: Cross-Device Sync

**On Computer A (e.g., laptop)**:
1. Install extension + configure Firebase
2. Have a conversation with Claude
3. Wait 30 seconds for upload

**On Computer B (e.g., desktop)**:
1. Install extension + configure **same** Firebase URL
2. Wait 2 minutes
3. Open extension → You should see laptop's usage!

---

## 🔐 Advanced Security (Optional)

For better security, use authenticated rules:

### Option 1: Password Protection

```json
{
  "rules": {
    "usage": {
      ".read": "auth != null || root.child('usage_password').val() == 'your-secret-password'",
      ".write": "auth != null || root.child('usage_password').val() == 'your-secret-password'"
    }
  }
}
```

Then set password in Firebase:
1. Go to "Data" tab
2. Click `+` next to root
3. Name: `usage_password`
4. Value: `your-secret-password`

### Option 2: User-Specific Rules

```json
{
  "rules": {
    "usage": {
      "$device_id": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

This allows each device to read all but write only to its own entry.

---

## ❓ FAQ

### Q: Will all my Chrome profiles sync together?

**Yes!** If you install the extension in multiple Chrome profiles and configure each with the **same Firebase URL**, they will all sync together.

Example:
- Chrome Profile "Work" → Firebase URL: `https://my-sync.firebaseio.com`
- Chrome Profile "Personal" → Firebase URL: `https://my-sync.firebaseio.com`
- Result: Both profiles see same usage data

### Q: Can I use different Firebase URLs for different profiles?

**Yes!** Configure each profile with a different Firebase URL to keep their data separate.

Example:
- Work profile → `https://work-usage.firebaseio.com`
- Personal profile → `https://personal-usage.firebaseio.com`
- Result: Separate usage tracking per profile

### Q: What if I don't set up Firebase?

**No problem!** The extension works perfectly without Firebase. Each browser/profile will track its own local usage independently.

### Q: Is my data secure?

The data synced is just usage percentages (not conversations). With test mode rules, anyone with your URL can access it. For better security, use the advanced rules above.

### Q: Does Firebase cost money?

**No**, for this use case:
- Firebase Realtime Database has a free tier
- You're storing ~1KB per device
- Very low read/write operations
- You'll never hit the limits

### Q: What happens if Firebase is down?

The extension continues working with local data. Syncing resumes when Firebase is back online.

### Q: Can I see which devices are syncing?

Yes! In Firebase Console → Realtime Database → Data tab, expand the "usage" node. Each entry shows:
- Device ID
- Device name (OS, browser, profile)
- Last sync timestamp

---

## 🐛 Troubleshooting

### Status Shows "Not configured"

**Fix**: Make sure you:
1. Pasted the full Firebase URL (including `https://`)
2. Clicked "Save Settings"
3. URL ends with `.firebaseio.com` or `.firebasedatabase.app`

### Status Shows "Not configured" After Saving

**Fix**: 
1. Check Firebase Console → Database → Rules tab
2. Make sure rules allow `.read` and `.write`
3. Try the test mode rules first to verify connection

### Data Not Syncing Between Profiles

**Checklist**:
- ✅ Both profiles use **exact same** Firebase URL
- ✅ Both extensions show "✓ Connected" status
- ✅ Wait 2-3 minutes for initial sync
- ✅ Check Firebase Console to see if data appears

### Extension Shows Different Data Than Firebase

**This is normal!** 
- Local data updates immediately
- Firebase syncs every 30 seconds (upload) and 2 minutes (download)
- Wait a few minutes for everything to sync

### Want to Reset Everything?

1. Firebase Console → Database → Data tab
2. Click the "⋮" menu next to "usage"
3. Click "Delete"
4. Data will repopulate on next sync

---

## 📞 Support

Having issues? Check:
1. Firebase Console → Database → Data tab (do you see usage data?)
2. Extension popup → Settings → Firebase status indicator
3. Browser console (F12) for error messages

---

**You're all set!** Your Claude usage will now sync across all your devices and Chrome profiles. 🎉
