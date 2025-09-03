const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const clipboardy = require('clipboardy').default;
const os = require('os');
const chalk = require('chalk');

let mdns;
try {
  mdns = require('mdns');
} catch (error) {
  console.log(chalk.yellow('Warning: mDNS not available. Device discovery will be limited.'));
}

class ClipboardServer {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.host = options.host || '0.0.0.0';
    this.enableMdns = options.enableMdns !== false && mdns;
    this.deviceId = options.deviceId || Math.random().toString(36).substring(7);
    
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.connectedDevices = new Map();
    this.lastClipboard = '';
    this.clipboardMonitor = null;
    this.mdnsAd = null;
    
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  setupRoutes() {
    this.app.use(express.static(path.join(__dirname, '../public')));
    this.app.use(express.json());

    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    this.app.get('/api/device-info', (req, res) => {
      res.json({
        deviceId: this.deviceId,
        hostname: os.hostname(),
        platform: os.platform(),
        connectedDevices: Array.from(this.connectedDevices.values())
      });
    });

    this.app.post('/api/clipboard', (req, res) => {
      const { content } = req.body;
      if (content !== undefined) {
        this.updateClipboard(content, 'api');
        res.json({ success: true });
      } else {
        res.status(400).json({ error: 'Content required' });
      }
    });

    this.app.get('/api/clipboard', (req, res) => {
      try {
        const content = clipboardy.readSync();
        res.json({ content });
      } catch (error) {
        res.status(500).json({ error: 'Failed to read clipboard' });
      }
    });
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
          connectedAt: new Date()
        };
        
        this.connectedDevices.set(socket.id, device);
        console.log(chalk.blue(`📋 Device registered: ${device.name} (${device.type})`));
        
        this.io.emit('device-list', Array.from(this.connectedDevices.values()));
        
        try {
          const currentClipboard = clipboardy.readSync();
          if (currentClipboard) {
            socket.emit('clipboard-update', { content: currentClipboard, from: 'server' });
          }
        } catch (error) {
          console.log(chalk.yellow('Warning: Could not read initial clipboard'));
        }
      });

      socket.on('clipboard-update', (data) => {
        console.log(chalk.cyan(`📋 Clipboard update from ${socket.id}: ${data.content.substring(0, 50)}...`));
        this.updateClipboard(data.content, socket.id);
      });

      socket.on('get-clipboard', () => {
        try {
          const content = clipboardy.readSync();
          socket.emit('clipboard-update', { content, from: 'server' });
        } catch (error) {
          socket.emit('error', { message: 'Failed to read clipboard' });
        }
      });

      socket.on('disconnect', () => {
        console.log(chalk.red(`📱 Device disconnected: ${socket.id}`));
        this.connectedDevices.delete(socket.id);
        this.io.emit('device-list', Array.from(this.connectedDevices.values()));
      });

      socket.on('ping', () => {
        socket.emit('pong');
      });
    });
  }

  async updateClipboard(content, sourceId) {
    if (content === this.lastClipboard) {
      return;
    }
    
    this.lastClipboard = content;
    
    try {
      clipboardy.writeSync(content);
    } catch (error) {
      console.log(chalk.red('Failed to write to clipboard:', error.message));
    }
    
    this.io.emit('clipboard-update', { 
      content, 
      from: sourceId,
      timestamp: Date.now()
    });
    
    console.log(chalk.green(`📋 Clipboard synced to ${this.connectedDevices.size} devices`));
  }

  startClipboardMonitoring() {
    if (this.clipboardMonitor) {
      clearInterval(this.clipboardMonitor);
    }
    
    this.clipboardMonitor = setInterval(() => {
      try {
        const currentClipboard = clipboardy.readSync();
        if (currentClipboard !== this.lastClipboard && currentClipboard.length > 0) {
          this.updateClipboard(currentClipboard, 'local');
        }
      } catch (error) {
        // Clipboard read failed, ignore
      }
    }, 500);
    
    console.log(chalk.green('📋 Clipboard monitoring started'));
  }

  startMdnsAdvertising() {
    if (!this.enableMdns || !mdns) {
      return;
    }

    try {
      this.mdnsAd = mdns.createAdvertisement(mdns.tcp('universal-clipboard'), this.port, {
        name: `Universal Clipboard - ${os.hostname()}`,
        txtRecord: {
          deviceId: this.deviceId,
          hostname: os.hostname(),
          platform: os.platform()
        }
      });
      
      this.mdnsAd.start();
      console.log(chalk.green('🌐 mDNS advertising started'));
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
        
        resolve();
      });
    });
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
    
    console.log(chalk.green('✅ Universal Clipboard stopped'));
  }
}

module.exports = ClipboardServer;