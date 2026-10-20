# Sunny Setup Guide for Caregivers

Sunny is a free, open-source desktop companion for older adults. This guide walks you through installing it on a loved one's computer - no technical skills needed.

---

## Before You Start

- **Supported systems:** Windows 10/11, macOS 12+, Ubuntu 22.04+ / Debian 12+
- **No accounts needed** - Sunny works offline after install
- **No tracking, no ads, no subscriptions** - completely free (MIT license)
- **Internet helps** with recipes, weather, and news, but basic computer help works without it

---

## Windows - Step by Step

1. Click **"Download Sunny-Setup.exe"** on the [Sunny landing page](https://mt25mb.github.io/Sunny/#caregivers)
2. Open the file from your **Downloads** folder
3. If Windows shows **"Windows protected your PC"**:
   - Click **More info**
   - Click **Run anyway**
4. Follow the installer: **Next → Next → Finish** (defaults are fine)
5. Press **Ctrl + Shift + Space** anytime to open Sunny

### Windows Permissions
- No special permissions needed on Windows
- If your antivirus prompts, **allow Sunny** - it needs to see the screen to help

---

## macOS - Step by Step

1. Click **"Download Sunny.dmg"** on the [Sunny landing page](https://mt25mb.github.io/Sunny/#caregivers)
2. Open the downloaded `.dmg` file
3. **Drag the Sunny icon** into the **Applications** folder
3. Press **Cmd + Shift + Space** to open Sunny
4. **First launch - required permissions:**
   - Open **System Settings → Privacy & Security**
   - Scroll to **Screen Recording** → toggle **Sunny ON**
   - Scroll to **Accessibility** → toggle **Sunny ON**
   - macOS will ask to quit and reopen Sunny - **do it**
5. Press **Cmd + Shift + Space** again - Sunny should appear

### macOS Permissions Explained
| Permission | Why Sunny Needs It |
|------------|-------------------|
| Screen Recording | To see what's on screen and understand what you're looking at |
| Accessibility | To click buttons, type, and interact with apps for you |

---

## Linux (Debian / Ubuntu) - Step by Step

1. Click **"Download sunny.deb"** on the [Sunny landing page](https://mt25mb.github.io/Sunny/#caregivers)
2. Open **Terminal** in your Downloads folder:
   - Right-click in the folder → **Open in Terminal**
   - Or press `Ctrl + Alt + T` and type `cd ~/Downloads`
3. Run:
   ```bash
   sudo dpkg -i sunny_*_amd64.deb
   ```
   (Enter your password when prompted - it won't show as you type)
4. Launch **"Sunny"** from your app menu or press **Ctrl + Shift + Space**

### Linux Notes
- No special permissions needed on most distributions
- If `dpkg` complains about dependencies, run: `sudo apt-get install -f`

---

## Keyboard Shortcut

| OS | Shortcut |
|----|----------|
| Windows / Linux | `Ctrl + Shift + Space` |
| macOS | `Cmd + Shift + Space` |

Hold for **1 second** to show/hide Sunny instantly.

---

## First Run - What to Expect

1. **Onboarding screen** appears - it shows which permissions to grant (macOS only)
2. **Model download** - Sunny downloads a ~1.2 GB AI model on first use (one-time, takes 1–3 minutes on broadband)
3. **Welcome message** - Sunny introduces itself and shows computer health

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| **"App is damaged / cannot be opened" (macOS)** | Open Terminal and run: `xattr -d com.apple.quarantine /Applications/Sunny.app` |
| **Nothing happens when I press the shortcut** | Check if Sunny is running (look in system tray / menu bar). Restart Sunny from Applications if needed. |
| **Microphone doesn't work** | System Settings → Privacy → Microphone → allow Sunny |
| **"Model not downloaded" error** | Open Sunny → Settings → click **Initialize Model** → wait for download |
| **Sunny won't start after macOS update** | Re-grant Screen Recording and Accessibility permissions in System Settings |
| **Linux: "command not found" after install** | Log out and back in, or run `source ~/.bashrc` |

---

## Uninstalling

| OS | How to Uninstall |
|----|------------------|
| **Windows** | Settings → Apps → Sunny → **Uninstall** |
| **macOS** | Drag `/Applications/Sunny.app` to **Trash** |
| **Linux** | `sudo apt remove sunny` |

---

## Getting Help

- **GitHub Issues:** [github.com/MT25MB/Sunny/issues](https://github.com/MT25MB/Sunny/issues) - report bugs or request features
- **Documentation:** [github.com/MT25MB/Sunny](https://github.com/MT25MB/Sunny) - full README and docs
- **Privacy:** [Privacy Policy](https://mt25mb.github.io/Sunny/privacy-policy.html) - what data Sunny handles and how

---

## For the Technically Curious

- Sunny runs **100% locally** by default (Ollama + on-device Moondream vision model)
- Optional cloud AI providers (OpenAI, Anthropic, Groq) require explicit opt-in
- All preferences, API keys, and logs stay on the device - nothing syncs to the cloud
- Source code: [github.com/MT25MB/Sunny](https://github.com/MT25MB/Sunny)

---

*Made with care for older adults everywhere. Free and open source (MIT).*