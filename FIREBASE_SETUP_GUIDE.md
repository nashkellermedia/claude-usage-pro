# Firebase Setup Guide for Claude Usage Pro v2.1.0

This guide walks you through setting up Firebase for secure cross-device sync.

## What You Need

1. **Firebase Database URL** - e.g., `https://your-project.firebaseio.com`
2. **Firebase Web API Key** - e.g., `AIzaSyA...` (from Project Settings)

## Step-by-Step Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add Project**
3. Enter a project name (e.g., "claude-usage-pro")
4. Disable Google Analytics (not needed)
5. Click **Create Project**

### 2. Create Realtime Database

1. In your project, click **Build** → **Realtime Database**
2. Click **Create Database**
3. Choose a location (any is fine)
4. Start in **locked mode** (we'll set rules next)
5. Click **Enable**

### 3. Copy Your Database URL

After creation, you'll see your database URL at the top:
```
https://your-project-default-rtdb.firebaseio.com
```
Copy this - you'll need it for the extension.

### 4. Set Security Rules

Click the **Rules** tab and replace with:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

Click **Publish**.

**What this does:** Each user can only read/write their own data. No one else can see your usage data.

### 5. Enable Anonymous Authentication

1. Go to **Build** → **Authentication**
2. Click **Get Started**
3. Click **Sign-in method** tab
4. Click **Anonymous**
5. Toggle **Enable** and click **Save**

### 6. Get Your Web API Key

1. Click the **gear icon** ⚙️ → **Project settings**
2. Under **General** tab, find **Web API Key**
3. Copy this key (starts with `AIzaSy...`)

### 7. Configure the Extension

1. Open Claude Usage Pro popup
2. Click ⚙️ Settings
3. Enter:
   - **Firebase Database URL**: `https://your-project.firebaseio.com`
   - **Firebase Web API Key**: `AIzaSy...`
4. Click **Save Settings**

You should see "Connected (UID: abc123...)" confirming authentication.

## How It Works

1. **Anonymous Auth**: The extension creates a unique anonymous user for you
2. **UID**: Your user ID (UID) is randomly generated and persists across sessions
3. **Data Storage**: Your data is stored at `/users/{your-uid}/...`
4. **Security**: Firebase rules ensure only you can access your data
5. **Multi-device**: Use the same Firebase project on all devices to sync

## Troubleshooting

### "Not authenticated" error
- Make sure Anonymous Auth is enabled in Firebase
- Check your Web API Key is correct (from Project Settings, not Database)
- Try clearing extension storage and re-entering credentials

### "Permission denied" error
- Check your security rules match exactly as shown above
- Make sure you clicked "Publish" after editing rules

### Data not syncing
- Check both Database URL and API Key are entered
- Verify Anonymous Auth is enabled
- Check browser console for errors

## Security Notes

- Your UID is random and anonymous - it's not linked to your identity
- Only your devices with the same credentials can access your data
- API keys are stored locally, never synced to Firebase
- Firebase rules prevent any unauthorized access

## Optional: Anthropic API Key (FREE Token Counting)

For 100% accurate token counting (instead of estimates):

1. Go to [Anthropic Console](https://console.anthropic.com/settings/keys)
2. Create an API key
3. Enter it in the extension settings

**Note**: The token counting API is completely FREE - it doesn't consume any tokens or cost anything.
