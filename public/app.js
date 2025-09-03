class UniversalClipboard {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.lastContent = '';
        this.deviceInfo = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        this.initializeElements();
        this.setupEventListeners();
        this.connect();
        
        this.detectDeviceInfo();
        this.setupClipboardMonitoring();
    }

    initializeElements() {
        this.elements = {
            statusDot: document.getElementById('status-dot'),
            statusText: document.getElementById('status-text'),
            clipboardContent: document.getElementById('clipboard-content'),
            lastUpdated: document.getElementById('last-updated'),
            contentLength: document.getElementById('content-length'),
            deviceCount: document.getElementById('device-count'),
            devicesList: document.getElementById('devices-list'),
            deviceId: document.getElementById('device-id'),
            serverInfo: document.getElementById('server-info'),
            platformInfo: document.getElementById('platform-info'),
            copyBtn: document.getElementById('copy-btn'),
            pasteBtn: document.getElementById('paste-btn'),
            syncBtn: document.getElementById('sync-btn'),
            refreshBtn: document.getElementById('refresh-btn'),
            clearBtn: document.getElementById('clear-btn'),
            helpBtn: document.getElementById('help-btn'),
            aboutBtn: document.getElementById('about-btn'),
            notifications: document.getElementById('notifications')
        };
    }

    setupEventListeners() {
        this.elements.clipboardContent.addEventListener('input', () => {
            this.updateContentLength();
            this.debounce(this.handleContentChange.bind(this), 300)();
        });

        this.elements.copyBtn.addEventListener('click', () => this.copyToClipboard());
        this.elements.pasteBtn.addEventListener('click', () => this.pasteFromClipboard());
        this.elements.syncBtn.addEventListener('click', () => this.syncNow());
        this.elements.refreshBtn.addEventListener('click', () => this.refreshContent());
        this.elements.clearBtn.addEventListener('click', () => this.clearContent());
        this.elements.helpBtn.addEventListener('click', () => this.openModal('help-modal'));
        this.elements.aboutBtn.addEventListener('click', () => this.openModal('about-modal'));

        window.addEventListener('online', () => this.handleConnectionChange(true));
        window.addEventListener('offline', () => this.handleConnectionChange(false));
        
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'r':
                    case 'R':
                        e.preventDefault();
                        this.refreshContent();
                        break;
                    case 'k':
                    case 'K':
                        e.preventDefault();
                        this.clearContent();
                        break;
                }
            }
        });
    }

    connect() {
        try {
            this.socket = io({
                timeout: 5000,
                forceNew: true
            });

            this.socket.on('connect', () => {
                this.handleConnect();
            });

            this.socket.on('disconnect', () => {
                this.handleDisconnect();
            });

            this.socket.on('clipboard-update', (data) => {
                this.handleClipboardUpdate(data);
            });

            this.socket.on('device-list', (devices) => {
                this.updateDevicesList(devices);
            });

            this.socket.on('error', (error) => {
                this.showNotification('Connection error: ' + error.message, 'error');
            });

            this.socket.on('connect_error', (error) => {
                this.handleConnectionError(error);
            });

            this.socket.on('pong', () => {
                this.lastPingTime = Date.now();
            });

        } catch (error) {
            this.showNotification('Failed to initialize connection', 'error');
            console.error('Connection error:', error);
        }
    }

    handleConnect() {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.updateStatus('connected', 'Connected');
        
        this.socket.emit('register-device', {
            name: this.deviceInfo.name,
            type: this.deviceInfo.type,
            userAgent: navigator.userAgent
        });

        this.socket.emit('get-clipboard');
        this.loadDeviceInfo();
        
        this.showNotification('Connected to Universal Clipboard', 'success');
        
        this.startHeartbeat();
    }

    handleDisconnect() {
        this.isConnected = false;
        this.updateStatus('disconnected', 'Disconnected');
        this.showNotification('Disconnected from server', 'warning');
        
        this.stopHeartbeat();
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
        }
    }

    handleConnectionError(error) {
        this.updateStatus('disconnected', 'Connection failed');
        console.error('Connection error:', error);
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
        } else {
            this.showNotification('Failed to connect. Please refresh the page.', 'error');
        }
    }

    attemptReconnect() {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
        
        this.updateStatus('connecting', `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            if (!this.isConnected) {
                this.connect();
            }
        }, delay);
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this.socket.emit('ping');
                
                setTimeout(() => {
                    if (!this.lastPingTime || (Date.now() - this.lastPingTime) > 5000) {
                        this.handleDisconnect();
                    }
                }, 3000);
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    handleClipboardUpdate(data) {
        if (data.from !== this.socket?.id) {
            this.elements.clipboardContent.value = data.content || '';
            this.lastContent = data.content || '';
            this.updateContentLength();
            this.updateLastUpdated();
            
            const deviceName = data.from === 'local' ? 'local device' : 'remote device';
            this.showNotification(`Clipboard updated from ${deviceName}`, 'success');
        }
    }

    handleContentChange() {
        const content = this.elements.clipboardContent.value;
        if (content !== this.lastContent && this.isConnected) {
            this.socket.emit('clipboard-update', { content });
            this.lastContent = content;
            this.updateLastUpdated();
        }
    }

    async copyToClipboard() {
        try {
            const content = this.elements.clipboardContent.value;
            await navigator.clipboard.writeText(content);
            this.showNotification('Copied to clipboard!', 'success');
        } catch (error) {
            this.showNotification('Failed to copy to clipboard', 'error');
        }
    }

    async pasteFromClipboard() {
        try {
            const content = await navigator.clipboard.readText();
            this.elements.clipboardContent.value = content;
            this.updateContentLength();
            this.handleContentChange();
            this.showNotification('Pasted from clipboard!', 'success');
        } catch (error) {
            this.showNotification('Failed to paste from clipboard', 'error');
        }
    }

    syncNow() {
        if (!this.isConnected) {
            this.showNotification('Not connected to server', 'error');
            return;
        }

        this.elements.syncBtn.disabled = true;
        this.socket.emit('get-clipboard');
        
        setTimeout(() => {
            this.elements.syncBtn.disabled = false;
        }, 1000);
        
        this.showNotification('Syncing clipboard...', 'success');
    }

    refreshContent() {
        if (this.isConnected) {
            this.socket.emit('get-clipboard');
            this.showNotification('Refreshing content...', 'success');
        } else {
            this.showNotification('Not connected to server', 'error');
        }
    }

    clearContent() {
        this.elements.clipboardContent.value = '';
        this.updateContentLength();
        this.handleContentChange();
        this.showNotification('Clipboard cleared', 'success');
    }

    updateStatus(status, text) {
        this.elements.statusDot.className = `status-dot ${status}`;
        this.elements.statusText.textContent = text;
    }

    updateContentLength() {
        const length = this.elements.clipboardContent.value.length;
        this.elements.contentLength.textContent = `${length.toLocaleString()} characters`;
    }

    updateLastUpdated() {
        const now = new Date();
        this.elements.lastUpdated.textContent = `Updated at ${now.toLocaleTimeString()}`;
    }

    updateDevicesList(devices) {
        const filteredDevices = devices.filter(device => device.id !== this.socket?.id);
        this.elements.deviceCount.textContent = `${filteredDevices.length} device${filteredDevices.length !== 1 ? 's' : ''}`;
        
        if (filteredDevices.length === 0) {
            this.elements.devicesList.innerHTML = `
                <div class="no-devices">
                    <span class="icon">📱</span>
                    <p>No other devices connected</p>
                    <small>Share the QR code or URL to connect more devices</small>
                </div>
            `;
        } else {
            this.elements.devicesList.innerHTML = filteredDevices.map(device => `
                <div class="device-item">
                    <span class="device-icon">${this.getDeviceIcon(device.type)}</span>
                    <div class="device-info">
                        <h4>${device.name}</h4>
                        <p>${device.type} • Connected ${this.getRelativeTime(device.connectedAt)}</p>
                    </div>
                </div>
            `).join('');
        }
    }

    getDeviceIcon(type) {
        const icons = {
            mobile: '📱',
            tablet: '📱',
            desktop: '💻',
            laptop: '💻',
            unknown: '📱'
        };
        return icons[type] || icons.unknown;
    }

    getRelativeTime(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diff = Math.floor((now - time) / 1000);
        
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    async loadDeviceInfo() {
        try {
            const response = await fetch('/api/device-info');
            const data = await response.json();
            
            this.elements.deviceId.textContent = data.deviceId;
            this.elements.serverInfo.textContent = data.hostname;
            this.elements.platformInfo.textContent = data.platform;
        } catch (error) {
            console.error('Failed to load device info:', error);
        }
    }

    detectDeviceInfo() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isTablet = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        
        this.deviceInfo = {
            name: `${navigator.platform} Device`,
            type: isTablet ? 'tablet' : (isMobile ? 'mobile' : 'desktop')
        };
    }

    setupClipboardMonitoring() {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
            return;
        }

        setInterval(async () => {
            if (!this.isConnected || document.hidden) {
                return;
            }

            try {
                const clipboardContent = await navigator.clipboard.readText();
                if (clipboardContent !== this.elements.clipboardContent.value && 
                    clipboardContent !== this.lastContent) {
                    
                    this.elements.clipboardContent.value = clipboardContent;
                    this.updateContentLength();
                    this.handleContentChange();
                }
            } catch (error) {
                // Clipboard access failed, ignore
            }
        }, 1000);
    }

    handleConnectionChange(isOnline) {
        if (isOnline && !this.isConnected) {
            this.showNotification('Network connection restored', 'success');
            this.connect();
        } else if (!isOnline) {
            this.showNotification('Network connection lost', 'warning');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icon = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        }[type] || 'ℹ️';
        
        notification.innerHTML = `
            <span class="icon">${icon}</span>
            <span class="message">${message}</span>
        `;
        
        this.elements.notifications.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    new UniversalClipboard();
});

const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);