const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const clipboardy = require('clipboardy').default;
const os = require('os');
const chalk = require('chalk');
const crypto = require('crypto');
const TerminalClipboard = require('./terminal-clipboard.js');

let mdns;
try {
  mdns = require('mdns');
} catch (error) {
  console.log(chalk.yellow('Warning: mDNS not available. Device discovery will be limited.'));
}

class EnhancedClipboardServer {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.host = options.host || '0.0.0.0';
    this.enableMdns = options.enableMdns !== false && mdns;
    this.deviceId = options.deviceId || Math.random().toString(36).substring(7);
    this.headless = options.headless || false;
    this.terminalOnly = options.terminalOnly || false;
    this.startTime = Date.now();
    
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.connectedDevices = new Map();
    this.clipboardHistory = [];
    this.maxHistorySize = 10;
    this.lastClipboard = '';
    this.lastClipboardHash = '';
    this.clipboardMonitor = null;
    this.mdnsAd = null;
    this.syncQueue = [];
    this.processing = false;
    this.conflictResolver = new Map();
    this.lastSyncTime = 0;
    this.minSyncInterval = 50; // 50ms minimum between syncs
    this.pollingInterval = options.pollingInterval || 100; // 100ms polling for ultra-fast detection
    this.autoSyncEnabled = true;
    this.totalSyncs = 0;
    
    // Initialize terminal clipboard if in terminal mode
    this.terminalClipboard = null;
    if (this.terminalOnly) {
      this.terminalClipboard = new TerminalClipboard();
    }
    
    // Content filtering settings
    this.maxContentLength = 50000; // 50KB max
    this.sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key\s*[:=]/i,
      /api[_-]?key/i,
      /[0-9]{16}/, // Credit card patterns
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/ // Email patterns in some contexts
    ];
    
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  setupRoutes() {
    this.app.use(express.static(path.join(__dirname, '../public')));
    this.app.use(express.json({ limit: '100kb' }));

    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/enhanced.html'));
    });

    // Auto-detecting download page
    this.app.get('/download', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/download.html'));
    });

    // Platform-specific download routes
    this.app.get('/downloads/:platform', (req, res) => {
      const platform = req.params.platform;
      this.handlePlatformDownload(req, res, platform);
    });

    this.app.get('/api/device-info', (req, res) => {
      res.json({
        deviceId: this.deviceId,
        hostname: os.hostname(),
        platform: os.platform(),
        connectedDevices: Array.from(this.connectedDevices.values()),
        clipboardHistory: this.clipboardHistory,
        autoSyncEnabled: this.autoSyncEnabled,
        pollingInterval: this.pollingInterval,
        stats: {
          totalSyncs: this.syncQueue.length,
          lastSyncTime: this.lastSyncTime
        }
      });
    });

    this.app.post('/api/clipboard', (req, res) => {
      const { content } = req.body;
      if (content !== undefined) {
        this.updateClipboard(content, 'api', true);
        res.json({ success: true });
      } else {
        res.status(400).json({ error: 'Content required' });
      }
    });

    this.app.get('/api/clipboard', (req, res) => {
      try {
        const content = clipboardy.readSync();
        res.json({ content, history: this.clipboardHistory });
      } catch (error) {
        res.status(500).json({ error: 'Failed to read clipboard' });
      }
    });

    this.app.get('/api/history', (req, res) => {
      res.json({ history: this.clipboardHistory });
    });

    this.app.post('/api/history/:index', (req, res) => {
      const index = parseInt(req.params.index);
      if (index >= 0 && index < this.clipboardHistory.length) {
        const item = this.clipboardHistory[index];
        this.updateClipboard(item.content, 'history', true);
        res.json({ success: true, content: item.content });
      } else {
        res.status(404).json({ error: 'History item not found' });
      }
    });

    this.app.post('/api/settings', (req, res) => {
      const { autoSync, pollingInterval } = req.body;
      
      if (autoSync !== undefined) {
        this.autoSyncEnabled = autoSync;
      }
      
      if (pollingInterval !== undefined && pollingInterval >= 50) {
        this.pollingInterval = pollingInterval;
        this.restartClipboardMonitoring();
      }
      
      res.json({ success: true, autoSync: this.autoSyncEnabled, pollingInterval: this.pollingInterval });
    });
  }

  handlePlatformDownload(req, res, platform) {
    const downloads = {
      windows: {
        filename: 'UniversalClipboard-Windows.exe',
        contentType: 'application/octet-stream',
        script: this.generateWindowsInstaller()
      },
      mac: {
        filename: 'UniversalClipboard-Mac.app.zip',
        contentType: 'application/zip',
        script: this.generateMacInstaller()
      },
      linux: {
        filename: 'UniversalClipboard-Linux.sh',
        contentType: 'application/x-sh',
        script: this.generateLinuxInstaller()
      },
      android: {
        filename: 'UniversalClipboard.apk',
        contentType: 'application/vnd.android.package-archive',
        script: this.generateAndroidAPK()
      },
      ios: {
        filename: 'redirect-to-appstore.html',
        contentType: 'text/html',
        script: this.generateIOSRedirect()
      }
    };

    const download = downloads[platform];
    if (!download) {
      return res.status(404).json({ error: 'Platform not supported' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);
    res.setHeader('Content-Type', download.contentType);
    res.send(download.script);
  }

  generateWindowsInstaller() {
    const serverUrl = `http://${this.getLocalIP()}:${this.port}`;
    return `@echo off
REM Universal Clipboard Windows Installer
echo Installing Universal Clipboard for Windows...
echo.

REM Create program directory
mkdir "%APPDATA%\\UniversalClipboard" 2>nul

REM Create the clipboard sync script
echo @echo off > "%APPDATA%\\UniversalClipboard\\sync.bat"
echo echo Starting Universal Clipboard Sync... >> "%APPDATA%\\UniversalClipboard\\sync.bat"
echo start "" "${serverUrl}" >> "%APPDATA%\\UniversalClipboard\\sync.bat"

REM Create shortcut on desktop
echo Creating desktop shortcut...
powershell -command "& { \\$ws = New-Object -ComObject WScript.Shell; \\$s = \\$ws.CreateShortcut('%USERPROFILE%\\Desktop\\Universal Clipboard.lnk'); \\$s.TargetPath = '%APPDATA%\\UniversalClipboard\\sync.bat'; \\$s.Save() }"

REM Add to startup (optional)
echo @echo off > "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\UniversalClipboard.bat"
echo start "" "${serverUrl}" >> "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\UniversalClipboard.bat"

echo.
echo ✅ Installation complete!
echo 📋 Universal Clipboard will start automatically with Windows
echo 🌐 You can also access it at: ${serverUrl}
echo.
echo Starting Universal Clipboard now...
start "" "${serverUrl}"
pause`;
  }

  generateMacInstaller() {
    const serverUrl = `http://${this.getLocalIP()}:${this.port}`;
    return `#!/bin/bash
# Universal Clipboard macOS Installer
echo "Installing Universal Clipboard for macOS..."

# Create application directory
mkdir -p "$HOME/Applications/UniversalClipboard"

# Create the app script
cat > "$HOME/Applications/UniversalClipboard/start.sh" << 'EOF'
#!/bin/bash
echo "Starting Universal Clipboard..."
open "${serverUrl}"
EOF

chmod +x "$HOME/Applications/UniversalClipboard/start.sh"

# Create LaunchAgent for auto-start
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$HOME/Library/LaunchAgents/com.universalclipboard.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.universalclipboard</string>
    <key>Program</key>
    <string>/usr/bin/open</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/open</string>
        <string>${serverUrl}</string>
    </array>
    <key>StartInterval</key>
    <integer>86400</integer>
</dict>
</plist>
EOF

# Load the launch agent
launchctl load "$HOME/Library/LaunchAgents/com.universalclipboard.plist"

echo "✅ Installation complete!"
echo "📋 Universal Clipboard will start with macOS"
echo "🌐 Access it at: ${serverUrl}"
echo "Starting now..."
open "${serverUrl}"`;
  }

  generateLinuxInstaller() {
    const serverUrl = `http://${this.getLocalIP()}:${this.port}`;
    return `#!/bin/bash
# Universal Clipboard Linux Installer
echo "Installing Universal Clipboard for Linux..."

# Create application directory
mkdir -p "$HOME/.local/share/UniversalClipboard"

# Create desktop entry
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/universal-clipboard.desktop" << EOF
[Desktop Entry]
Name=Universal Clipboard
Comment=Sync clipboard across all devices
Exec=xdg-open ${serverUrl}
Icon=edit-copy
Terminal=false
Type=Application
Categories=Utility;
EOF

# Make it executable
chmod +x "$HOME/.local/share/applications/universal-clipboard.desktop"

# Add to autostart
mkdir -p "$HOME/.config/autostart"
cp "$HOME/.local/share/applications/universal-clipboard.desktop" "$HOME/.config/autostart/"

echo "✅ Installation complete!"
echo "📋 Universal Clipboard will start automatically"
echo "🌐 Access it at: ${serverUrl}"
echo "Starting now..."
xdg-open "${serverUrl}" || firefox "${serverUrl}" || google-chrome "${serverUrl}"`;
  }

  generateAndroidAPK() {
    // For now, return a simple HTML redirect since creating APKs requires complex build process
    const serverUrl = `http://${this.getLocalIP()}:${this.port}`;
    return `<!DOCTYPE html>
<html>
<head>
    <title>Universal Clipboard - Android</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
    <h1>📋 Universal Clipboard</h1>
    <p>For Android, please bookmark this URL:</p>
    <p><a href="${serverUrl}">${serverUrl}</a></p>
    <p>Add it to your home screen for easy access!</p>
    <script>
        setTimeout(() => {
            window.location = "${serverUrl}";
        }, 3000);
    </script>
</body>
</html>`;
  }

  generateIOSRedirect() {
    const serverUrl = `http://${this.getLocalIP()}:${this.port}`;
    return `<!DOCTYPE html>
<html>
<head>
    <title>Universal Clipboard - iOS</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
    <h1>📋 Universal Clipboard</h1>
    <p>For iOS, please bookmark this URL:</p>
    <p><a href="${serverUrl}">${serverUrl}</a></p>
    <p>Add it to your home screen using Safari's "Add to Home Screen" option!</p>
    <script>
        setTimeout(() => {
            window.location = "${serverUrl}";
        }, 3000);
    </script>
</body>
</html>`;
  }

  getLocalIP() {
    const interfaces = require('os').networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(chalk.green(`📱 Device connected: ${socket.id}`));
      
      socket.on('register-device', (deviceInfo) => {
        const device = {
          id: socket.id,
          name: deviceInfo.name || `Device ${socket.id.substring(0, 6)}`,
          type: deviceInfo.type || 'unknown',
          userAgent: deviceInfo.userAgent || 'unknown',
          connectedAt: new Date(),
          autoSync: deviceInfo.autoSync !== false,
          capabilities: deviceInfo.capabilities || {}
        };
        
        this.connectedDevices.set(socket.id, device);
        console.log(chalk.blue(`📋 Device registered: ${device.name} (${device.type}) - AutoSync: ${device.autoSync}`));
        
        this.io.emit('device-list', Array.from(this.connectedDevices.values()));
        this.io.emit('clipboard-history', this.clipboardHistory);
        
        // Send current clipboard content immediately
        if (this.lastClipboard) {
          socket.emit('clipboard-update', { 
            content: this.lastClipboard, 
            from: 'server',
            timestamp: Date.now(),
            hash: this.lastClipboardHash,
            autoWrite: true
          });
        }
      });

      socket.on('clipboard-update', (data) => {
        console.log(chalk.cyan(`📋 Clipboard update from ${socket.id}: ${data.content.substring(0, 50)}...`));
        this.updateClipboard(data.content, socket.id, data.autoWrite !== false);
      });

      socket.on('request-clipboard', () => {
        try {
          const content = clipboardy.readSync();
          socket.emit('clipboard-update', { 
            content, 
            from: 'server',
            timestamp: Date.now(),
            hash: this.generateHash(content),
            autoWrite: true
          });
        } catch (error) {
          socket.emit('error', { message: 'Failed to read clipboard' });
        }
      });

      socket.on('toggle-auto-sync', (enabled) => {
        const device = this.connectedDevices.get(socket.id);
        if (device) {
          device.autoSync = enabled;
          this.connectedDevices.set(socket.id, device);
          console.log(chalk.yellow(`🔄 Device ${device.name} auto-sync: ${enabled}`));
        }
      });

      socket.on('request-history', () => {
        socket.emit('clipboard-history', this.clipboardHistory);
      });

      socket.on('use-history-item', (data) => {
        const { index } = data;
        if (index >= 0 && index < this.clipboardHistory.length) {
          const item = this.clipboardHistory[index];
          this.updateClipboard(item.content, socket.id, true);
        }
      });

      socket.on('disconnect', () => {
        console.log(chalk.red(`📱 Device disconnected: ${socket.id}`));
        this.connectedDevices.delete(socket.id);
        this.io.emit('device-list', Array.from(this.connectedDevices.values()));
      });

      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      socket.on('force-sync', () => {
        this.forceSyncToDevice(socket.id);
      });
    });
  }

  generateHash(content) {
    return crypto.createHash('md5').update(content || '').digest('hex');
  }

  isContentFiltered(content) {
    if (!content || typeof content !== 'string') return true;
    if (content.length > this.maxContentLength) return true;
    
    // Check for sensitive patterns
    for (const pattern of this.sensitivePatterns) {
      if (pattern.test(content)) {
        console.log(chalk.yellow('🔒 Content filtered: contains sensitive data'));
        return true;
      }
    }
    
    return false;
  }

  addToHistory(content) {
    if (!content || content.length === 0) return;
    
    const hash = this.generateHash(content);
    
    // Don't add duplicates or if already at the top
    const existingIndex = this.clipboardHistory.findIndex(item => item.hash === hash);
    if (existingIndex === 0) return; // Already at top
    
    if (existingIndex > 0) {
      // Move existing item to top
      const item = this.clipboardHistory.splice(existingIndex, 1)[0];
      this.clipboardHistory.unshift(item);
    } else {
      // Add new item
      const historyItem = {
        content: content.substring(0, 1000), // Limit history item size
        timestamp: Date.now(),
        hash,
        preview: content.substring(0, 100).replace(/\n/g, ' '),
        size: content.length
      };
      
      this.clipboardHistory.unshift(historyItem);
    }
    
    // Maintain max history size
    if (this.clipboardHistory.length > this.maxHistorySize) {
      this.clipboardHistory = this.clipboardHistory.slice(0, this.maxHistorySize);
    }
    
    // Broadcast updated history
    this.io.emit('clipboard-history', this.clipboardHistory);
  }

  async updateClipboard(content, sourceId, autoWrite = true) {
    if (!this.autoSyncEnabled && sourceId !== 'local') {
      console.log(chalk.gray('📋 Auto-sync disabled, skipping update'));
      return;
    }

    const contentHash = this.generateHash(content);
    
    // Prevent loops and rapid updates
    if (contentHash === this.lastClipboardHash) {
      return;
    }
    
    const now = Date.now();
    if (now - this.lastSyncTime < this.minSyncInterval) {
      // Queue the update for later processing
      this.syncQueue.push({ content, sourceId, autoWrite, timestamp: now, hash: contentHash });
      this.processSyncQueue();
      return;
    }
    
    // Check for conflicts
    if (this.conflictResolver.has(contentHash)) {
      const existingTime = this.conflictResolver.get(contentHash);
      if (now - existingTime < 1000) { // 1 second conflict window
        console.log(chalk.yellow('⚠️ Resolving clipboard conflict'));
        return;
      }
    }
    
    this.conflictResolver.set(contentHash, now);
    this.lastSyncTime = now;
    this.lastClipboard = content;
    this.lastClipboardHash = contentHash;
    
    // Filter sensitive content
    if (this.isContentFiltered(content)) {
      console.log(chalk.red('🚫 Content blocked by filter'));
      return;
    }
    
    // Write to system clipboard if needed
    if (autoWrite && sourceId !== 'local') {
      try {
        if (this.terminalOnly && this.terminalClipboard) {
          await this.terminalClipboard.write(content);
          if (!this.headless) {
            console.log(chalk.green('📋 Terminal clipboard updated locally'));
          }
        } else {
          clipboardy.writeSync(content);
          if (!this.headless) {
            console.log(chalk.green('📋 Clipboard updated locally'));
          }
        }
      } catch (error) {
        if (!this.headless) {
          console.log(chalk.red('Failed to write to clipboard:', error.message));
        }
      }
    }
    
    // Add to history
    this.addToHistory(content);
    
    // Broadcast to all connected devices except the sender
    this.connectedDevices.forEach((device, deviceId) => {
      if (deviceId !== sourceId && device.autoSync) {
        const updateData = { 
          content, 
          from: sourceId,
          timestamp: now,
          hash: contentHash,
          autoWrite: true // Always allow auto-write for receiving devices
        };
        this.io.to(deviceId).emit('clipboard-update', updateData);
      }
    });
    
    this.totalSyncs++;
    
    if (!this.headless) {
      console.log(chalk.green(`📋 Clipboard synced to ${this.getAutoSyncDeviceCount()} devices (${content.length} chars)`));
    }
  }

  processSyncQueue() {
    if (this.processing || this.syncQueue.length === 0) return;
    
    this.processing = true;
    
    setTimeout(() => {
      if (this.syncQueue.length > 0) {
        const latest = this.syncQueue.pop(); // Get latest update
        this.syncQueue = []; // Clear queue
        this.updateClipboard(latest.content, latest.sourceId, latest.autoWrite);
      }
      this.processing = false;
    }, this.minSyncInterval);
  }

  getAutoSyncDeviceCount() {
    return Array.from(this.connectedDevices.values()).filter(d => d.autoSync).length;
  }

  forceSyncToDevice(deviceId) {
    if (this.lastClipboard) {
      this.io.to(deviceId).emit('clipboard-update', {
        content: this.lastClipboard,
        from: 'server',
        timestamp: Date.now(),
        hash: this.lastClipboardHash,
        autoWrite: true,
        force: true
      });
    }
  }

  startClipboardMonitoring() {
    if (this.clipboardMonitor) {
      clearInterval(this.clipboardMonitor);
    }
    
    this.clipboardMonitor = setInterval(async () => {
      try {
        let currentClipboard;
        
        if (this.terminalOnly && this.terminalClipboard) {
          // Use terminal clipboard in terminal-only mode
          currentClipboard = await this.terminalClipboard.read();
        } else {
          // Use regular clipboard
          currentClipboard = clipboardy.readSync();
        }
        
        const currentHash = this.generateHash(currentClipboard);
        
        if (currentHash !== this.lastClipboardHash && currentClipboard && currentClipboard.length > 0) {
          if (!this.headless) {
            console.log(chalk.blue(`🔍 Local clipboard change detected: ${currentClipboard.substring(0, 30)}...`));
          }
          this.updateClipboard(currentClipboard, 'local', false);
        }
      } catch (error) {
        // Clipboard read failed, ignore silently
        if (!this.headless && error.message !== 'No clipboard content') {
          console.log(chalk.gray(`📋 Clipboard read warning: ${error.message}`));
        }
      }
    }, this.pollingInterval);
    
    if (!this.headless) {
      const mode = this.terminalOnly ? 'terminal' : 'system';
      console.log(chalk.green(`📋 Enhanced clipboard monitoring started (${this.pollingInterval}ms polling, ${mode} mode)`));
    }
  }

  restartClipboardMonitoring() {
    this.startClipboardMonitoring();
    console.log(chalk.yellow(`🔄 Clipboard monitoring restarted with ${this.pollingInterval}ms interval`));
  }

  startMdnsAdvertising() {
    if (!this.enableMdns || !mdns) {
      return;
    }

    try {
      this.mdnsAd = mdns.createAdvertisement(mdns.tcp('universal-clipboard'), this.port, {
        name: `Universal Clipboard Enhanced - ${os.hostname()}`,
        txtRecord: {
          deviceId: this.deviceId,
          hostname: os.hostname(),
          platform: os.platform(),
          version: '2.0.0',
          features: 'auto-sync,history,filtering'
        }
      });
      
      this.mdnsAd.start();
      console.log(chalk.green('🌐 Enhanced mDNS advertising started'));
    } catch (error) {
      console.log(chalk.yellow('Warning: mDNS advertising failed:', error.message));
    }
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, this.host, (error) => {
        if (error) {
          reject(error);
          return;
        }
        
        this.startClipboardMonitoring();
        this.startMdnsAdvertising();
        
        // Clean up old conflict resolutions periodically
        setInterval(() => {
          const now = Date.now();
          for (const [hash, timestamp] of this.conflictResolver.entries()) {
            if (now - timestamp > 5000) { // 5 seconds
              this.conflictResolver.delete(hash);
            }
          }
        }, 10000);
        
        resolve();
      });
    });
  }

  getStats() {
    return {
      connectedDevices: this.connectedDevices.size,
      totalSyncs: this.totalSyncs,
      uptime: Date.now() - this.startTime,
      lastSyncTime: this.lastSyncTime,
      historyItems: this.clipboardHistory.length,
      autoSyncEnabled: this.autoSyncEnabled,
      pollingInterval: this.pollingInterval,
      contentLength: this.lastClipboard.length,
      headless: this.headless,
      terminalOnly: this.terminalOnly,
      capabilities: this.terminalClipboard ? this.terminalClipboard.getCapabilities() : null
    };
  }

  stop() {
    if (this.clipboardMonitor) {
      clearInterval(this.clipboardMonitor);
      this.clipboardMonitor = null;
    }
    
    if (this.mdnsAd) {
      this.mdnsAd.stop();
      this.mdnsAd = null;
    }
    
    if (this.server) {
      this.server.close();
    }
    
    if (!this.headless) {
      console.log(chalk.green('✅ Enhanced Universal Clipboard stopped'));
    }
  }
}

module.exports = EnhancedClipboardServer;