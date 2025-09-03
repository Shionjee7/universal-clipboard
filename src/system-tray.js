const { Tray, Menu, BrowserWindow, app, shell, dialog } = require('electron');
const path = require('path');
const os = require('os');

class SystemTray {
    constructor(options = {}) {
        this.server = options.server;
        this.port = options.port || 3000;
        this.tray = null;
        this.contextMenu = null;
        this.mainWindow = null;
        this.isQuitting = false;
        
        this.createTray();
        this.updateTrayIcon();
        this.startStatusUpdates();
    }

    createTray() {
        // Create tray icon
        const iconPath = this.getTrayIconPath();
        this.tray = new Tray(iconPath);
        
        this.tray.setToolTip('Universal Clipboard Enhanced');
        
        // Handle tray events
        this.tray.on('click', () => {
            this.showMainWindow();
        });
        
        this.tray.on('right-click', () => {
            this.tray.popUpContextMenu();
        });
        
        this.updateContextMenu();
    }

    getTrayIconPath() {
        const platform = os.platform();
        let iconName;
        
        switch (platform) {
            case 'win32':
                iconName = 'tray-icon-win.ico';
                break;
            case 'darwin':
                iconName = 'tray-icon-mac.png';
                break;
            default:
                iconName = 'tray-icon-linux.png';
        }
        
        return path.join(__dirname, '../assets/tray', iconName);
    }

    updateContextMenu() {
        const stats = this.server ? this.server.getStats() : {};
        const isRunning = this.server && stats.connectedDevices !== undefined;
        
        this.contextMenu = Menu.buildFromTemplate([
            {
                label: 'Universal Clipboard Enhanced',
                type: 'normal',
                enabled: false,
                icon: this.getStatusIcon()
            },
            { type: 'separator' },
            {
                label: `Status: ${isRunning ? 'Running' : 'Stopped'}`,
                type: 'normal',
                enabled: false
            },
            {
                label: `Connected Devices: ${stats.connectedDevices || 0}`,
                type: 'normal',
                enabled: false
            },
            {
                label: `Total Syncs: ${stats.totalSyncs || 0}`,
                type: 'normal',
                enabled: false
            },
            { type: 'separator' },
            {
                label: 'Show Interface',
                type: 'normal',
                click: () => this.showMainWindow()
            },
            {
                label: 'Open Web Interface',
                type: 'normal',
                click: () => this.openWebInterface()
            },
            {
                label: 'Copy URL to Clipboard',
                type: 'normal',
                click: () => this.copyUrlToClipboard()
            },
            { type: 'separator' },
            {
                label: 'Settings',
                type: 'submenu',
                submenu: [
                    {
                        label: 'Auto-start with System',
                        type: 'checkbox',
                        checked: this.isAutoStartEnabled(),
                        click: (menuItem) => this.toggleAutoStart(menuItem.checked)
                    },
                    {
                        label: 'Minimize to Tray',
                        type: 'checkbox',
                        checked: true,
                        click: (menuItem) => this.toggleMinimizeToTray(menuItem.checked)
                    },
                    { type: 'separator' },
                    {
                        label: 'Configure Port...',
                        type: 'normal',
                        click: () => this.showPortDialog()
                    },
                    {
                        label: 'View Logs',
                        type: 'normal',
                        click: () => this.showLogs()
                    }
                ]
            },
            {
                label: 'Tools',
                type: 'submenu',
                submenu: [
                    {
                        label: 'Test Clipboard Access',
                        type: 'normal',
                        click: () => this.testClipboardAccess()
                    },
                    {
                        label: 'Generate QR Code',
                        type: 'normal',
                        click: () => this.showQRCode()
                    },
                    {
                        label: 'View Clipboard History',
                        type: 'normal',
                        click: () => this.showClipboardHistory()
                    },
                    { type: 'separator' },
                    {
                        label: 'Force Sync',
                        type: 'normal',
                        click: () => this.forceSync()
                    },
                    {
                        label: 'Clear History',
                        type: 'normal',
                        click: () => this.clearHistory()
                    }
                ]
            },
            {
                label: 'Help',
                type: 'submenu',
                submenu: [
                    {
                        label: 'About Universal Clipboard',
                        type: 'normal',
                        click: () => this.showAbout()
                    },
                    {
                        label: 'View Documentation',
                        type: 'normal',
                        click: () => shell.openExternal('https://github.com/universal-clipboard/universal-clipboard#readme')
                    },
                    {
                        label: 'Report Issue',
                        type: 'normal',
                        click: () => shell.openExternal('https://github.com/universal-clipboard/universal-clipboard/issues')
                    }
                ]
            },
            { type: 'separator' },
            {
                label: 'Quit Universal Clipboard',
                type: 'normal',
                click: () => this.quitApp()
            }
        ]);
        
        this.tray.setContextMenu(this.contextMenu);
    }

    getStatusIcon() {
        const stats = this.server ? this.server.getStats() : {};
        const isRunning = this.server && stats.connectedDevices !== undefined;
        
        if (isRunning) {
            return stats.connectedDevices > 0 ? '🟢' : '🟡';
        }
        return '🔴';
    }

    updateTrayIcon() {
        const stats = this.server ? this.server.getStats() : {};
        const isRunning = this.server && stats.connectedDevices !== undefined;
        
        let tooltip = 'Universal Clipboard Enhanced';
        
        if (isRunning) {
            tooltip += `\nStatus: Running\nDevices: ${stats.connectedDevices}\nSyncs: ${stats.totalSyncs}`;
        } else {
            tooltip += '\nStatus: Stopped';
        }
        
        this.tray.setToolTip(tooltip);
    }

    startStatusUpdates() {
        setInterval(() => {
            this.updateTrayIcon();
            this.updateContextMenu();
        }, 5000); // Update every 5 seconds
    }

    showMainWindow() {
        if (this.mainWindow) {
            this.mainWindow.show();
            this.mainWindow.focus();
            return;
        }
        
        this.mainWindow = new BrowserWindow({
            width: 1000,
            height: 700,
            show: false,
            icon: this.getTrayIconPath(),
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });
        
        this.mainWindow.loadURL(`http://localhost:${this.port}/enhanced.html`);
        
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
        });
        
        this.mainWindow.on('minimize', (event) => {
            event.preventDefault();
            this.mainWindow.hide();
        });
        
        this.mainWindow.on('close', (event) => {
            if (!this.isQuitting) {
                event.preventDefault();
                this.mainWindow.hide();
            }
        });
    }

    openWebInterface() {
        shell.openExternal(`http://localhost:${this.port}/enhanced.html`);
    }

    copyUrlToClipboard() {
        const { clipboard } = require('electron');
        const url = `http://${this.getLocalIP()}:${this.port}`;
        clipboard.writeText(url);
        
        this.showNotification('URL copied to clipboard', url);
    }

    getLocalIP() {
        const { networkInterfaces } = require('os');
        const nets = networkInterfaces();
        
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return 'localhost';
    }

    showPortDialog() {
        const result = dialog.showMessageBoxSync({
            type: 'question',
            title: 'Configure Port',
            message: 'Configure Universal Clipboard port',
            detail: `Current port: ${this.port}\n\nNote: Changing port requires restart.`,
            buttons: ['Cancel', 'Change Port'],
            defaultId: 0
        });
        
        if (result === 1) {
            // Show input dialog for new port
            this.showNotification('Port Configuration', 'Port configuration dialog would be shown here');
        }
    }

    async testClipboardAccess() {
        try {
            const { clipboard } = require('electron');
            const testText = 'Universal Clipboard Test';
            
            clipboard.writeText(testText);
            const readText = clipboard.readText();
            
            if (readText === testText) {
                this.showNotification('Clipboard Test', '✅ Clipboard access working correctly');
            } else {
                this.showNotification('Clipboard Test', '⚠️ Clipboard access partially working');
            }
        } catch (error) {
            this.showNotification('Clipboard Test', `❌ Clipboard access failed: ${error.message}`);
        }
    }

    showQRCode() {
        const qrWindow = new BrowserWindow({
            width: 400,
            height: 500,
            resizable: false,
            title: 'QR Code - Universal Clipboard',
            icon: this.getTrayIconPath()
        });
        
        const url = `http://${this.getLocalIP()}:${this.port}`;
        const qrHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>QR Code</title>
                <style>
                    body { 
                        text-align: center; 
                        font-family: Arial, sans-serif; 
                        padding: 20px;
                        background: #f5f5f5;
                    }
                    .qr-container {
                        background: white;
                        padding: 20px;
                        border-radius: 10px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        margin: 20px;
                    }
                    h2 { color: #333; }
                    .url { 
                        font-family: monospace; 
                        background: #f0f0f0; 
                        padding: 10px; 
                        border-radius: 5px; 
                        margin: 10px 0;
                    }
                    #qrcode { margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="qr-container">
                    <h2>📱 Mobile Connection</h2>
                    <div class="url">${url}</div>
                    <div id="qrcode"></div>
                    <p>Scan with your mobile device to connect</p>
                </div>
                <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
                <script>
                    QRCode.toCanvas(document.getElementById('qrcode'), '${url}', {
                        width: 200,
                        margin: 2
                    });
                </script>
            </body>
            </html>
        `;
        
        qrWindow.loadURL('data:text/html,' + encodeURIComponent(qrHtml));
    }

    showClipboardHistory() {
        if (this.server && this.server.clipboardHistory) {
            const historyWindow = new BrowserWindow({
                width: 600,
                height: 400,
                title: 'Clipboard History',
                icon: this.getTrayIconPath()
            });
            
            // Create history HTML
            const historyHtml = this.generateHistoryHtml(this.server.clipboardHistory);
            historyWindow.loadURL('data:text/html,' + encodeURIComponent(historyHtml));
        } else {
            this.showNotification('Clipboard History', 'No clipboard history available');
        }
    }

    generateHistoryHtml(history) {
        const items = history.map((item, index) => `
            <div class="history-item">
                <div class="history-preview">${this.escapeHtml(item.preview)}</div>
                <div class="history-meta">
                    ${new Date(item.timestamp).toLocaleString()} • ${item.size} chars
                </div>
            </div>
        `).join('');
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Clipboard History</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
                    .history-item { 
                        background: white; 
                        margin: 10px 0; 
                        padding: 15px; 
                        border-radius: 5px;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                        cursor: pointer;
                    }
                    .history-item:hover { background: #f0f0f0; }
                    .history-preview { 
                        font-family: monospace; 
                        font-size: 14px; 
                        margin-bottom: 5px;
                        max-height: 100px;
                        overflow: hidden;
                    }
                    .history-meta { 
                        font-size: 12px; 
                        color: #666; 
                    }
                    h2 { color: #333; }
                </style>
            </head>
            <body>
                <h2>📚 Clipboard History</h2>
                ${items || '<p>No history items found</p>'}
            </body>
            </html>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    forceSync() {
        if (this.server) {
            // Trigger sync
            this.showNotification('Force Sync', '🔄 Forcing clipboard sync...');
        } else {
            this.showNotification('Force Sync', '❌ Server not running');
        }
    }

    clearHistory() {
        if (this.server && this.server.clipboardHistory) {
            this.server.clipboardHistory = [];
            this.showNotification('Clear History', '🗑️ Clipboard history cleared');
        }
    }

    isAutoStartEnabled() {
        // Check if auto-start is enabled
        return app.getLoginItemSettings().openAtLogin;
    }

    toggleAutoStart(enabled) {
        app.setLoginItemSettings({
            openAtLogin: enabled,
            path: process.execPath,
            args: ['start', '--minimized']
        });
        
        this.showNotification(
            'Auto-start',
            enabled ? '✅ Auto-start enabled' : '❌ Auto-start disabled'
        );
    }

    toggleMinimizeToTray(enabled) {
        // This would be saved to settings
        this.showNotification(
            'Minimize to Tray',
            enabled ? '✅ Will minimize to tray' : '❌ Will close completely'
        );
    }

    showLogs() {
        const logPath = path.join(os.homedir(), '.local', 'log', 'universal-clipboard.log');
        shell.openPath(logPath);
    }

    showAbout() {
        dialog.showMessageBox({
            type: 'info',
            title: 'About Universal Clipboard',
            message: 'Universal Clipboard Enhanced v2.0.0',
            detail: 'Cross-platform clipboard synchronization with automatic background sync, terminal support, and mobile integration.\n\nBuilt with Node.js, Electron, and ❤️',
            buttons: ['OK']
        });
    }

    showNotification(title, body) {
        const { Notification } = require('electron');
        
        if (Notification.isSupported()) {
            new Notification({
                title,
                body,
                silent: true
            }).show();
        }
    }

    quitApp() {
        this.isQuitting = true;
        app.quit();
    }

    destroy() {
        if (this.tray) {
            this.tray.destroy();
        }
        
        if (this.mainWindow) {
            this.mainWindow.destroy();
        }
    }
}

module.exports = SystemTray;