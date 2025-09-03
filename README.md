# 🚀 Universal Clipboard

**One clipboard, all devices.** Copy on Windows, paste on Mac, sync with phone – instantly.

[![npm version](https://badge.fury.io/js/%40universalclip%2Fsync.svg)](https://www.npmjs.com/package/@universalclip/sync)
[![Platform Support](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20iOS%20%7C%20Android-blue)](https://github.com/Shionjee7/universal-clipboard)

## ⚡ Quick Start

```bash
npm install -g @universalclip/sync
```

That's it! Universal Clipboard is now running and will auto-start with your computer.

## 🎯 What It Does

- **Copy anywhere, paste everywhere**: Text copied on Windows appears instantly on Mac, phone, anywhere
- **Zero configuration**: Installs once, works everywhere, no manual setup
- **Auto-sync**: Background monitoring, no manual buttons or actions needed  
- **Cross-platform**: Windows, Mac, Linux desktop + iPhone, Android mobile web
- **No apps required**: Mobile devices use web interface, no app store downloads
- **Local network**: Your data stays on your network, no cloud involved

## 🌟 Features

### 🖥️ Desktop Features
- **Real-time monitoring**: 300ms clipboard detection on all platforms
- **Auto-start**: Launches with your computer using system services
- **System tray**: Minimal resource usage, runs in background
- **Desktop shortcuts**: Quick access to control panel
- **Cross-platform CLI**: Works identically on Windows/Mac/Linux

### 📱 Mobile Features  
- **Web-based**: No app installation, works in Safari/Chrome
- **Auto-paste**: Automatic clipboard writing with permission handling
- **QR code pairing**: Scan to connect instantly
- **PWA support**: Add to home screen for app-like experience
- **Real-time sync**: WebSocket connection for instant updates

### 🔧 Advanced Features
- **Terminal integration**: SSH sessions, tmux/screen support with OSC 52
- **Headless servers**: Linux daemon mode for servers
- **Content filtering**: Automatically ignores sensitive data (passwords, keys)
- **Conflict resolution**: Smart handling of simultaneous clipboard changes
- **Network discovery**: mDNS/Bonjour auto-discovery when available

## 💻 Installation Methods

### NPM (Recommended)
```bash
npm install -g @universalclip/sync
```
Automatically sets up system services, permissions, and startup entries.

### Windows CMD/PowerShell
```cmd
curl -O https://raw.githubusercontent.com/Shionjee7/universal-clipboard/main/install-windows.cmd
install-windows.cmd
```

### macOS/Linux Terminal
```bash
curl -fsSL https://raw.githubusercontent.com/Shionjee7/universal-clipboard/main/install-mac.sh | bash
```

## 🚀 Usage

### Command Line
```bash
# Start the service
universal-clipboard start

# Check if running  
universal-clipboard status

# Stop the service
universal-clipboard stop

# Quick alias
uclip start
```

### Desktop Usage
1. **Copy text anywhere** on any connected device
2. **Paste automatically** appears on all other devices  
3. **Access control panel** at http://localhost:3000

### Mobile Usage
1. **Open http://localhost:3000** on your phone
2. **Grant clipboard permissions** when prompted
3. **Copy/paste instantly** between phone and computers

## 📱 Connect New Devices

### iPhone/iPad
1. Open **Safari**
2. Go to **http://localhost:3000** (or scan QR code)
3. Tap **Share → Add to Home Screen**
4. Allow clipboard permissions

### Android
1. Open **Chrome** 
2. Go to **http://localhost:3000** (or scan QR code)
3. Tap **Menu → Add to Home screen**
4. Allow clipboard permissions

### Other Computers
Install Universal Clipboard using any method above, or simply visit http://YOUR-COMPUTER-IP:3000

## 🔧 Configuration

### Default Settings
- **Port**: 3000
- **Polling**: 300ms clipboard check
- **Auto-start**: Enabled
- **Content filtering**: Enabled (passwords, keys, etc.)

### Advanced Configuration
```bash
# Custom port
universal-clipboard start --port 3001

# Debug mode
universal-clipboard start --debug

# Daemon mode (Linux/Mac)
universal-clipboard start --daemon
```

## 🛠️ Platform-Specific Features

### Windows
- **Startup folder integration**: Auto-starts with Windows
- **Desktop shortcut**: Double-click to open control panel  
- **System tray**: Minimize to tray functionality
- **CMD/PowerShell**: Native command support

### macOS
- **LaunchAgent integration**: Native macOS auto-start
- **Applications folder**: Proper macOS app integration
- **Desktop shortcut**: Native .app bundle
- **Menu bar**: Optional menu bar integration

### Linux  
- **systemd integration**: Proper service management
- **Desktop entries**: Native .desktop file integration
- **Terminal clipboard**: xclip/xsel/wl-clipboard support
- **SSH sessions**: OSC 52 escape sequence support
- **Headless mode**: Perfect for servers and VPS

## 📊 Technical Details

### Architecture
- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: Vanilla JavaScript + Service Worker PWA
- **Clipboard**: clipboardy (cross-platform clipboard access)
- **Communication**: WebSockets for real-time sync
- **Discovery**: mDNS/Bonjour for automatic device detection

### Security
- **Local network only**: No internet/cloud connectivity
- **Content filtering**: Automatic detection of sensitive data
- **Permissions**: Proper browser clipboard API integration
- **Encryption**: WebSocket connection security

### Performance
- **Low latency**: 300ms clipboard polling
- **Minimal resources**: <50MB RAM usage
- **Battery efficient**: Smart polling and connection management
- **Network efficient**: Only sends changes, not periodic syncs

## 🔍 Troubleshooting

### Service Not Starting
```bash
# Check if port is available
netstat -an | grep 3000

# Check Node.js installation
node --version

# Manual start for debugging
universal-clipboard start --debug
```

### Mobile Permissions
- **iPhone**: Settings → Safari → Advanced → Experimental Features → Enable Clipboard API
- **Android**: Chrome automatically requests permissions
- **Manual permission**: Click anywhere on the webpage to enable auto-paste

### Network Issues
- **Same network**: Ensure all devices are on the same WiFi/network
- **Firewall**: Allow port 3000 through firewall
- **IP address**: Use computer's IP if localhost doesn't work

### Windows Installation
- **Admin rights**: Run installer as administrator if global install fails
- **Node.js**: Install from https://nodejs.org if not found
- **PowerShell**: Use PowerShell if CMD has issues

## 🤝 Contributing

Universal Clipboard is open source! Contributions welcome.

```bash
git clone https://github.com/Shionjee7/universal-clipboard.git
cd universal-clipboard
npm install
npm run dev
```

## 📄 License

MIT License - feel free to use in personal and commercial projects.

## 🆘 Support

- **GitHub Issues**: [Report bugs](https://github.com/Shionjee7/universal-clipboard/issues)
- **Documentation**: [Full docs](https://github.com/Shionjee7/universal-clipboard/wiki)
- **Discord**: Community support coming soon

---

**Made with ❤️ for seamless cross-platform productivity**