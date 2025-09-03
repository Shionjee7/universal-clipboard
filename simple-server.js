const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const os = require('os');

// Try to import clipboardy for Windows clipboard monitoring
let clipboardy;
try {
  clipboardy = require('clipboardy');
  console.log('📋 Windows clipboard monitoring available');
} catch (error) {
  console.log('📋 Windows clipboard monitoring not available');
}

class SimpleUniversalClipboard {
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server);
    
    this.connectedDevices = new Map();
    this.clipboardHistory = [];
    this.lastClipboard = '';
    this.lastClipboardHash = '';
    this.totalSyncs = 0;
    this.clipboardMonitor = null;
    
    this.setupRoutes();
    this.setupSocket();
    this.startClipboardMonitoring();
  }

  setupRoutes() {
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use(express.json());

    // Main page
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public/enhanced.html'));
    });

    // Download page  
    this.app.get('/download', (req, res) => {
      res.sendFile(path.join(__dirname, 'public/download.html'));
    });

    // Platform downloads
    this.app.get('/downloads/:platform', (req, res) => {
      const platform = req.params.platform;
      const serverUrl = `http://${this.getLocalIP()}:${this.port}`;
      
      const downloads = {
        windows: this.generateWindowsScript(serverUrl),
        mac: this.generateMacScript(serverUrl),
        linux: this.generateLinuxScript(serverUrl),
        android: this.generateMobileHTML(serverUrl),
        ios: this.generateMobileHTML(serverUrl)
      };

      const script = downloads[platform] || 'Platform not supported';
      const filename = `UniversalClipboard-${platform}.${platform === 'windows' ? 'bat' : platform === 'android' || platform === 'ios' ? 'html' : 'sh'}`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', platform.includes('html') ? 'text/html' : 'text/plain');
      res.send(script);
    });

    // API endpoints
    this.app.get('/api/status', (req, res) => {
      res.json({
        connected: this.connectedDevices.size,
        syncs: this.totalSyncs,
        history: this.clipboardHistory.length
      });
    });
  }

  setupSocket() {
    this.io.on('connection', (socket) => {
      console.log(`📱 Device connected: ${socket.id}`);

      socket.on('register-device', (deviceInfo) => {
        this.connectedDevices.set(socket.id, {
          ...deviceInfo,
          id: socket.id,
          connectedAt: Date.now()
        });
        
        console.log(`📋 Device registered: ${deviceInfo.name} (${deviceInfo.type})`);
        
        // Send current clipboard if available
        if (this.lastClipboard) {
          socket.emit('clipboard-update', {
            content: this.lastClipboard,
            from: 'server',
            timestamp: Date.now(),
            autoWrite: true
          });
        }

        // Send device list to all
        this.broadcastDeviceList();
      });

      socket.on('clipboard-update', (data) => {
        console.log(`📋 Clipboard from ${socket.id}: ${data.content.substring(0, 50)}...`);
        
        this.lastClipboard = data.content;
        this.totalSyncs++;
        
        // Add to history
        this.addToHistory(data.content);
        
        // Broadcast to all other devices
        socket.broadcast.emit('clipboard-update', {
          content: data.content,
          from: socket.id,
          timestamp: Date.now(),
          autoWrite: true
        });

        console.log(`📋 Synced to ${this.connectedDevices.size - 1} devices`);
      });

      socket.on('disconnect', () => {
        console.log(`📱 Device disconnected: ${socket.id}`);
        this.connectedDevices.delete(socket.id);
        this.broadcastDeviceList();
      });
    });
  }

  addToHistory(content) {
    if (content && content.trim() && content !== this.clipboardHistory[0]?.content) {
      this.clipboardHistory.unshift({
        content: content,
        timestamp: Date.now(),
        preview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
        size: content.length
      });
      
      // Keep only last 50 items
      if (this.clipboardHistory.length > 50) {
        this.clipboardHistory = this.clipboardHistory.slice(0, 50);
      }
    }
  }

  broadcastDeviceList() {
    const devices = Array.from(this.connectedDevices.values());
    this.io.emit('device-list', devices);
  }

  getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }

  generateWindowsScript(serverUrl) {
    return `@echo off
echo Installing Universal Clipboard for Windows...
echo.
echo This will create a desktop shortcut to access Universal Clipboard.
echo No software is installed - it just opens your web browser.
echo.

REM Create desktop shortcut
echo Creating desktop shortcut...
echo [InternetShortcut] > "%USERPROFILE%\\Desktop\\Universal Clipboard.url"
echo URL=${serverUrl} >> "%USERPROFILE%\\Desktop\\Universal Clipboard.url"
echo IconFile=%SystemRoot%\\system32\\SHELL32.dll >> "%USERPROFILE%\\Desktop\\Universal Clipboard.url"
echo IconIndex=13 >> "%USERPROFILE%\\Desktop\\Universal Clipboard.url"

echo.
echo ✅ Installation complete!
echo 📋 Use the "Universal Clipboard" shortcut on your desktop
echo 🌐 Or visit: ${serverUrl}
echo.
echo Opening Universal Clipboard now...
start "" "${serverUrl}"
pause`;
  }

  generateMacScript(serverUrl) {
    return `#!/bin/bash
echo "Installing Universal Clipboard for macOS..."
echo
echo "This creates a bookmark and dock shortcut to access Universal Clipboard."
echo "No software is installed - it just opens your web browser."
echo

# Create desktop bookmark
cat > "$HOME/Desktop/Universal Clipboard.webloc" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>URL</key>
    <string>${serverUrl}</string>
</dict>
</plist>
EOF

echo "✅ Installation complete!"
echo "📋 Use the 'Universal Clipboard' bookmark on your desktop"  
echo "🌐 Or visit: ${serverUrl}"
echo
echo "Opening Universal Clipboard now..."
open "${serverUrl}"`;
  }

  generateLinuxScript(serverUrl) {
    return `#!/bin/bash
echo "Installing Universal Clipboard for Linux..."
echo
echo "This creates a desktop shortcut to access Universal Clipboard."
echo "No software is installed - it just opens your web browser."
echo

# Create desktop shortcut
cat > "$HOME/Desktop/Universal Clipboard.desktop" << EOF
[Desktop Entry]
Name=Universal Clipboard
Comment=Sync clipboard across devices
Exec=xdg-open ${serverUrl}
Icon=edit-copy
Terminal=false
Type=Application
EOF

chmod +x "$HOME/Desktop/Universal Clipboard.desktop"

echo "✅ Installation complete!"
echo "📋 Use the 'Universal Clipboard' shortcut on your desktop"
echo "🌐 Or visit: ${serverUrl}"
echo
echo "Opening Universal Clipboard now..."
xdg-open "${serverUrl}" || firefox "${serverUrl}" || google-chrome "${serverUrl}"`;
  }

  generateMobileHTML(serverUrl) {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Universal Clipboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 2rem; }
        .url { background: #f0f0f0; padding: 1rem; border-radius: 10px; margin: 1rem 0; }
        .btn { background: #007AFF; color: white; padding: 15px 30px; border: none; border-radius: 25px; font-size: 16px; margin: 10px; }
    </style>
</head>
<body>
    <h1>📋 Universal Clipboard</h1>
    <p>Add this to your home screen for easy access:</p>
    <div class="url">${serverUrl}</div>
    <button class="btn" onclick="window.location='${serverUrl}'">Open Universal Clipboard</button>
    <p><small>Bookmark this page or add to home screen for quick access!</small></p>
</body>
</html>`;
  }

  startClipboardMonitoring() {
    if (!clipboardy) {
      console.log('📋 Windows clipboard monitoring disabled - using browser-only mode');
      return;
    }

    console.log('📋 Starting Windows clipboard monitoring...');
    
    this.clipboardMonitor = setInterval(async () => {
      try {
        // Use correct clipboardy API
        const content = await clipboardy.default.read();
        const contentHash = this.generateHash(content);
        
        if (content && contentHash !== this.lastClipboardHash && content.length > 0) {
          console.log(`🔥 WINDOWS CLIPBOARD DETECTED: ${content.substring(0, 50)}...`);
          
          this.lastClipboard = content;
          this.lastClipboardHash = contentHash;
          this.totalSyncs++;
          
          // Add to history
          this.addToHistory(content);
          
          // Broadcast to all connected browser devices
          this.io.emit('clipboard-update', {
            content: content,
            from: 'windows',
            timestamp: Date.now(),
            autoWrite: true
          });
          
          console.log(`🚀 SYNCED TO ${this.connectedDevices.size} DEVICES - AUTO-PASTE ENABLED!`);
        }
      } catch (error) {
        // Ignore clipboard read errors (they happen frequently on Windows)
        if (error.message && !error.message.includes('Access is denied')) {
          console.log('📋 Clipboard read error:', error.message);
        }
      }
    }, 300); // Check every 300ms for faster detection
  }

  generateHash(content) {
    // Simple hash function for content comparison
    let hash = 0;
    if (!content || content.length === 0) return hash;
    
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  start() {
    this.server.listen(this.port, () => {
      const ip = this.getLocalIP();
      console.log('');
      console.log('📋 Universal Clipboard Server Started!');
      console.log('');
      console.log(`🌐 Local:    http://localhost:${this.port}`);
      console.log(`📱 Network:  http://${ip}:${this.port}`);
      console.log(`📥 Downloads: http://${ip}:${this.port}/download`);
      console.log('');
      console.log('✅ Ready for cross-device clipboard sync!');
      if (clipboardy) {
        console.log('📋 Windows clipboard monitoring: ACTIVE');
      } else {
        console.log('📋 Windows clipboard monitoring: BROWSER-ONLY');
      }
    });
  }
}

// Start server
const server = new SimpleUniversalClipboard(3000);
server.start();