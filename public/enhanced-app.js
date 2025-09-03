class EnhancedUniversalClipboard {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.lastContent = '';
        this.lastContentHash = '';
        this.deviceInfo = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.autoSyncEnabled = true;
        this.backgroundMonitorEnabled = true;
        this.notificationsEnabled = true;
        
        // Clipboard monitoring
        this.clipboardMonitorInterval = null;
        this.monitoringFrequency = 1000; // 1 second for mobile compatibility
        this.lastClipboardCheck = 0;
        
        // Statistics
        this.syncCount = 0;
        this.lastSyncTime = null;
        this.connectionStartTime = Date.now();
        this.pingTimes = [];
        
        // History
        this.clipboardHistory = [];
        this.currentContent = '';
        
        // Clipboard API capabilities
        this.clipboardAPISupported = false;
        this.clipboardPermission = 'prompt';
        
        this.initializeElements();
        this.detectCapabilities();
        this.setupEventListeners();
        this.connect();
        this.startBackgroundMonitoring();
    }

    initializeElements() {
        this.elements = {
            // Status elements
            statusDot: document.getElementById('status-dot'),
            statusText: document.getElementById('status-text'),
            autoSyncToggle: document.getElementById('auto-sync-toggle'),
            
            // Live clipboard elements
            previewText: document.getElementById('preview-text'),
            contentLength: document.getElementById('content-length'),
            contentSource: document.getElementById('content-source'),
            copyToDevice: document.getElementById('copy-to-device'),
            viewFull: document.getElementById('view-full'),
            autoSyncStatus: document.getElementById('auto-sync-status'),
            
            // Statistics
            syncCount: document.getElementById('sync-count'),
            lastSync: document.getElementById('last-sync'),
            pingTime: document.getElementById('ping-time'),
            syncRate: document.getElementById('sync-rate'),
            
            // History
            historyList: document.getElementById('history-list'),
            refreshHistory: document.getElementById('refresh-history'),
            clearHistory: document.getElementById('clear-history'),
            
            // Devices
            devicesGrid: document.getElementById('devices-grid'),
            deviceCount: document.getElementById('device-count'),
            
            // Controls
            forceSync: document.getElementById('force-sync'),
            testClipboard: document.getElementById('test-clipboard'),
            
            // Footer
            deviceId: document.getElementById('device-id'),
            serverInfo: document.getElementById('server-info'),
            
            // Modals and buttons
            fullContentModal: document.getElementById('full-content-modal'),
            fullContentText: document.getElementById('full-content-text'),
            copyFullContent: document.getElementById('copy-full-content'),
            selectAllContent: document.getElementById('select-all-content'),
            settingsBtn: document.getElementById('settings-btn'),
            helpBtn: document.getElementById('help-btn'),
            aboutBtn: document.getElementById('about-btn'),
            
            // Settings modal
            settingsModal: document.getElementById('settings-modal'),
            settingAutoSync: document.getElementById('setting-auto-sync'),
            settingBackgroundMonitor: document.getElementById('setting-background-monitor'),
            settingNotifications: document.getElementById('setting-notifications'),
            testClipboardAccess: document.getElementById('test-clipboard-access'),
            clipboardAccessStatus: document.getElementById('clipboard-access-status'),
            saveSettings: document.getElementById('save-settings'),
            resetSettings: document.getElementById('reset-settings'),
            
            // Notifications container
            notifications: document.getElementById('notifications')
        };
    }

    async detectCapabilities() {
        // Detect clipboard API support
        this.clipboardAPISupported = !!(navigator.clipboard && navigator.clipboard.readText && navigator.clipboard.writeText);
        
        if (this.clipboardAPISupported) {
            try {
                // Test actual clipboard access
                await this.requestClipboardPermissions();
            } catch (error) {
                console.log('📋 Could not get clipboard permissions:', error);
            }
        }
        
        // Detect device info
        this.detectDeviceInfo();
        
        // Update UI based on capabilities
        this.updateCapabilityStatus();
    }
    
    async requestClipboardPermissions() {
        try {
            // Try to test clipboard access by reading
            const testContent = await navigator.clipboard.readText();
            console.log('📋 Clipboard access granted - automatic sync enabled');
            this.clipboardAPISupported = true;
            return true;
        } catch (error) {
            console.log('📋 Clipboard access denied or limited:', error.message);
            
            // Try to get permission by writing first (some browsers require this)
            try {
                await navigator.clipboard.writeText('Universal Clipboard Permission Test');
                const readBack = await navigator.clipboard.readText();
                if (readBack === 'Universal Clipboard Permission Test') {
                    console.log('📋 Clipboard permissions granted after test write');
                    this.clipboardAPISupported = true;
                    return true;
                }
            } catch (writeError) {
                console.log('📋 Could not get clipboard write permission:', writeError.message);
            }
            
            this.clipboardAPISupported = false;
            return false;
        }
    }

    detectDeviceInfo() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isTablet = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        
        this.deviceInfo = {
            name: this.generateDeviceName(),
            type: isTablet ? 'tablet' : (isMobile ? 'mobile' : 'desktop'),
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            autoSync: this.autoSyncEnabled,
            capabilities: {
                clipboardAPI: this.clipboardAPISupported,
                backgroundSync: 'serviceWorker' in navigator,
                notifications: 'Notification' in window,
                wakeLock: 'wakeLock' in navigator,
                isiOS: isiOS,
                isAndroid: isAndroid
            }
        };
    }

    generateDeviceName() {
        const platform = navigator.platform;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (platform.includes('iPhone')) return 'iPhone';
        if (platform.includes('iPad')) return 'iPad';
        if (platform.includes('Android')) return 'Android Device';
        if (platform.includes('Mac')) return 'Mac';
        if (platform.includes('Win')) return 'Windows PC';
        if (platform.includes('Linux')) return 'Linux PC';
        
        return isMobile ? 'Mobile Device' : 'Desktop';
    }

    updateCapabilityStatus() {
        const hasClipboardAPI = this.clipboardAPISupported;
        const statusElement = this.elements.clipboardAccessStatus;
        
        if (hasClipboardAPI) {
            statusElement.textContent = 'Supported';
            statusElement.className = 'access-status success';
        } else {
            statusElement.textContent = 'Limited';
            statusElement.className = 'access-status error';
        }
    }

    setupEventListeners() {
        // Auto sync toggle
        this.elements.autoSyncToggle.addEventListener('change', (e) => {
            this.toggleAutoSync(e.target.checked);
        });

        // Live clipboard actions
        this.elements.copyToDevice.addEventListener('click', () => this.copyToDevice());
        this.elements.viewFull.addEventListener('click', () => this.viewFullContent());

        // History actions
        this.elements.refreshHistory.addEventListener('click', () => this.refreshHistory());
        this.elements.clearHistory.addEventListener('click', () => this.clearHistory());

        // Controls
        this.elements.forceSync.addEventListener('click', () => this.forceSync());
        this.elements.testClipboard.addEventListener('click', () => this.testClipboardAccess());

        // Modal buttons
        this.elements.settingsBtn.addEventListener('click', () => this.openModal('settings-modal'));
        this.elements.helpBtn.addEventListener('click', () => this.openModal('help-modal'));
        this.elements.aboutBtn.addEventListener('click', () => this.openModal('about-modal'));

        // Full content modal
        this.elements.copyFullContent.addEventListener('click', () => this.copyFullContentToDevice());
        this.elements.selectAllContent.addEventListener('click', () => this.selectAllContent());

        // Settings modal
        this.elements.testClipboardAccess.addEventListener('click', () => this.testClipboardAccess());
        this.elements.saveSettings.addEventListener('click', () => this.saveSettings());
        this.elements.resetSettings.addEventListener('click', () => this.resetSettings());

        // Page visibility change
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key.toLowerCase()) {
                    case 's':
                        e.preventDefault();
                        this.forceSync();
                        break;
                    case 'h':
                        e.preventDefault();
                        this.openModal('help-modal');
                        break;
                    case ',':
                        e.preventDefault();
                        this.openModal('settings-modal');
                        break;
                }
            }
        });

        // Window focus events for clipboard monitoring
        window.addEventListener('focus', () => {
            if (this.backgroundMonitorEnabled) {
                this.checkClipboardChange();
            }
        });
    }

    connect() {
        try {
            this.socket = io({
                timeout: 5000,
                forceNew: true
            });

            this.setupSocketHandlers();
        } catch (error) {
            this.showNotification('Failed to initialize connection', 'error');
            console.error('Connection error:', error);
        }
    }

    setupSocketHandlers() {
        this.socket.on('connect', () => {
            this.handleConnect();
        });

        this.socket.on('disconnect', () => {
            this.handleDisconnect();
        });

        this.socket.on('clipboard-update', (data) => {
            this.handleClipboardUpdate(data);
        });

        this.socket.on('clipboard-history', (history) => {
            this.updateClipboardHistory(history);
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

        this.socket.on('pong', (data) => {
            const pingTime = Date.now() - data.timestamp;
            this.updatePingTime(pingTime);
        });
    }

    handleConnect() {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.connectionStartTime = Date.now();
        this.updateStatus('connected', 'Connected & Auto-Syncing');
        
        // Register device with enhanced capabilities
        this.socket.emit('register-device', this.deviceInfo);
        
        this.showNotification('🚀 Connected to Enhanced Universal Clipboard', 'success');
        this.loadDeviceInfo();
        this.startHeartbeat();
        
        // Start automatic clipboard monitoring
        if (this.autoSyncEnabled && this.backgroundMonitorEnabled) {
            this.startClipboardMonitoring();
        }
    }

    handleDisconnect() {
        this.isConnected = false;
        this.updateStatus('disconnected', 'Disconnected');
        this.showNotification('Disconnected from server', 'warning');
        
        this.stopHeartbeat();
        this.stopClipboardMonitoring();
        
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

    async handleClipboardUpdate(data) {
        if (data.from === this.socket?.id) return; // Ignore own updates
        
        const { content, from, timestamp, hash, force } = data;
        
        // Update UI
        this.updateClipboardPreview(content, from);
        this.lastContent = content;
        this.lastContentHash = hash;
        this.syncCount++;
        this.lastSyncTime = Date.now();
        
        this.updateStatistics();
        
        // Auto-write to device clipboard if enabled and supported
        const shouldAutoWrite = this.autoSyncEnabled && (data.autoWrite !== false);
        
        if (shouldAutoWrite || force) {
            await this.tryAutoWriteClipboard(content, from);
        } else {
            this.showNotification('📋 New clipboard content available', 'info');
        }
    }
    
    async tryAutoWriteClipboard(content, from) {
        if (!content || content === this.lastContent) return;
        
        try {
            // Force user interaction if needed (click anywhere on page)
            if (document.visibilityState !== 'visible') {
                console.log('📋 Page not visible, skipping auto-write');
                this.showNotification('📋 New clipboard content available - click page to sync', 'info');
                return;
            }
            
            // Try to write to clipboard immediately
            await navigator.clipboard.writeText(content);
            
            // Success - update tracking and notify
            this.lastContentHash = this.generateHash(content);
            this.showNotification('📋 ✅ AUTO-PASTED from ' + this.getDeviceDisplayName(from), 'success');
            console.log('📋 ✅ AUTO-PASTED successfully:', content.substring(0, 50) + '...');
            
            // Visual feedback
            this.flashScreen();
            
        } catch (error) {
            console.log('📋 Auto-paste failed:', error.message);
            
            // Show click instruction for user interaction
            this.showNotification('📋 CLICK ANYWHERE on this page to enable auto-paste, then try copying again', 'warning');
            
            // Add click listener to enable permissions
            const enableAutoSync = async () => {
                try {
                    await navigator.clipboard.writeText(content);
                    this.showNotification('📋 ✅ Auto-paste enabled! Content pasted.', 'success');
                    this.lastContentHash = this.generateHash(content);
                    this.flashScreen();
                    document.removeEventListener('click', enableAutoSync);
                } catch (e) {
                    this.showNotification('📋 Please allow clipboard permissions in browser', 'error');
                }
            };
            
            document.addEventListener('click', enableAutoSync, { once: true });
        }
    }
    
    flashScreen() {
        // Visual feedback for successful auto-paste
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed; 
            top: 0; left: 0; right: 0; bottom: 0; 
            background: rgba(40, 167, 69, 0.3); 
            z-index: 9999; 
            pointer-events: none;
            animation: flashFade 0.5s ease-out;
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes flashFade {
                0% { opacity: 1; }
                100% { opacity: 0; }
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(flash);
        
        setTimeout(() => {
            flash.remove();
            style.remove();
        }, 500);
    }

    getDeviceDisplayName(deviceId) {
        if (deviceId === 'local' || deviceId === 'server') return 'server';
        // Could be enhanced to show actual device names from device list
        return 'device';
    }

    updateClipboardPreview(content, source) {
        const preview = content.substring(0, 200);
        const isLong = content.length > 200;
        
        this.elements.previewText.textContent = isLong ? preview + '...' : preview;
        this.elements.contentLength.textContent = `${content.length.toLocaleString()} chars`;
        this.elements.contentSource.textContent = `From: ${this.getDeviceDisplayName(source)}`;
        
        this.currentContent = content;
        
        // Enable view full button if content is long
        this.elements.viewFull.disabled = content.length <= 200;
    }

    async startClipboardMonitoring() {
        if (!this.clipboardAPISupported || !this.backgroundMonitorEnabled) {
            console.log('📋 Clipboard monitoring not available or disabled');
            return;
        }
        
        if (this.clipboardMonitorInterval) {
            clearInterval(this.clipboardMonitorInterval);
        }
        
        console.log('📋 Starting automatic clipboard monitoring');
        
        this.clipboardMonitorInterval = setInterval(async () => {
            await this.checkClipboardChange();
        }, this.monitoringFrequency);
    }

    stopClipboardMonitoring() {
        if (this.clipboardMonitorInterval) {
            clearInterval(this.clipboardMonitorInterval);
            this.clipboardMonitorInterval = null;
        }
    }

    async checkClipboardChange() {
        if (!this.clipboardAPISupported || !this.autoSyncEnabled || !this.isConnected) {
            return;
        }
        
        try {
            const content = await navigator.clipboard.readText();
            const contentHash = this.generateHash(content);
            
            if (contentHash !== this.lastContentHash && content && content.length > 0) {
                console.log('📋 Local clipboard change detected:', content.substring(0, 50));
                
                // Send to server
                this.socket.emit('clipboard-update', {
                    content: content,
                    timestamp: Date.now()
                    // Don't set autoWrite to false - let other devices auto-sync
                });
                
                this.lastContent = content;
                this.lastContentHash = contentHash;
                this.updateClipboardPreview(content, 'local');
                
                this.showNotification('📋 Clipboard synced to all devices', 'success');
            }
        } catch (error) {
            // Permission denied or other error - ignore silently for now
        }
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

    async copyToDevice() {
        if (!this.currentContent) {
            this.showNotification('No content to copy', 'warning');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(this.currentContent);
            this.showNotification('📋 Copied to device clipboard!', 'success');
        } catch (error) {
            this.showNotification('Failed to copy to clipboard: ' + error.message, 'error');
            
            // Fallback: select text for manual copy
            this.viewFullContent();
            this.selectAllContent();
        }
    }

    async testClipboardAccess() {
        const statusElement = this.elements.clipboardAccessStatus;
        
        try {
            // Test write
            await navigator.clipboard.writeText('Universal Clipboard Test');
            
            // Test read
            const content = await navigator.clipboard.readText();
            
            if (content === 'Universal Clipboard Test') {
                statusElement.textContent = 'Full Access ✓';
                statusElement.className = 'access-status success';
                this.showNotification('✅ Clipboard access test successful!', 'success');
                
                // Update capabilities
                this.clipboardAPISupported = true;
                
                // Start monitoring if auto-sync is enabled
                if (this.autoSyncEnabled && this.backgroundMonitorEnabled) {
                    this.startClipboardMonitoring();
                }
            } else {
                throw new Error('Read/write mismatch');
            }
        } catch (error) {
            statusElement.textContent = 'Limited Access ⚠️';
            statusElement.className = 'access-status error';
            this.showNotification('⚠️ Clipboard access limited: ' + error.message, 'warning');
            console.log('Clipboard test error:', error);
            
            this.clipboardAPISupported = false;
            this.stopClipboardMonitoring();
        }
    }

    toggleAutoSync(enabled) {
        this.autoSyncEnabled = enabled;
        
        // Update server
        if (this.isConnected) {
            this.socket.emit('toggle-auto-sync', enabled);
        }
        
        // Update monitoring
        if (enabled && this.backgroundMonitorEnabled) {
            this.startClipboardMonitoring();
        } else {
            this.stopClipboardMonitoring();
        }
        
        // Update UI
        this.updateAutoSyncStatus();
        
        this.showNotification(`Auto-sync ${enabled ? 'enabled' : 'disabled'}`, enabled ? 'success' : 'info');
    }

    updateAutoSyncStatus() {
        const statusElement = this.elements.autoSyncStatus;
        const syncText = statusElement.querySelector('.sync-text');
        
        if (this.autoSyncEnabled && this.isConnected) {
            statusElement.style.display = 'flex';
            syncText.textContent = 'Automatic sync active - clipboard changes sync instantly';
            statusElement.style.background = 'var(--gradient-success)';
        } else if (this.isConnected) {
            statusElement.style.display = 'flex';
            syncText.textContent = 'Auto-sync disabled - use manual controls';
            statusElement.style.background = 'var(--gradient-warning)';
        } else {
            statusElement.style.display = 'none';
        }
    }

    forceSync() {
        if (!this.isConnected) {
            this.showNotification('Not connected to server', 'error');
            return;
        }

        this.elements.forceSync.disabled = true;
        this.socket.emit('force-sync');
        
        setTimeout(() => {
            this.elements.forceSync.disabled = false;
        }, 2000);
        
        this.showNotification('🔄 Force sync requested...', 'info');
    }

    async refreshHistory() {
        if (this.isConnected) {
            this.socket.emit('request-history');
            this.showNotification('🔄 Refreshing history...', 'info');
        }
    }

    clearHistory() {
        // This would need server-side implementation
        this.showNotification('⚠️ History clearing not yet implemented', 'warning');
    }

    updateClipboardHistory(history) {
        this.clipboardHistory = history;
        const listElement = this.elements.historyList;
        
        if (history.length === 0) {
            listElement.innerHTML = `
                <div class="no-history">
                    <span class="icon">📚</span>
                    <p>No clipboard history yet</p>
                    <small>Copy some text to start building history</small>
                </div>
            `;
            return;
        }
        
        listElement.innerHTML = history.map((item, index) => `
            <div class="history-item" onclick="universalClipboard.useHistoryItem(${index})">
                <div class="history-preview">${item.preview}</div>
                <div class="history-meta">
                    <span class="history-time">${this.formatTime(item.timestamp)}</span>
                    <span class="history-size">${item.size} chars</span>
                </div>
            </div>
        `).join('');
    }

    useHistoryItem(index) {
        if (index >= 0 && index < this.clipboardHistory.length) {
            const item = this.clipboardHistory[index];
            
            this.socket.emit('use-history-item', { index });
            this.updateClipboardPreview(item.content, 'history');
            this.currentContent = item.content;
            
            this.showNotification('📚 History item loaded', 'info');
        }
    }

    updateDevicesList(devices) {
        const filteredDevices = devices.filter(device => device.id !== this.socket?.id);
        this.elements.deviceCount.textContent = `${filteredDevices.length} device${filteredDevices.length !== 1 ? 's' : ''}`;
        
        if (filteredDevices.length === 0) {
            this.elements.devicesGrid.innerHTML = `
                <div class="no-devices">
                    <span class="icon">📱</span>
                    <p>No other devices connected</p>
                    <small>Share QR code or URL to connect more devices</small>
                </div>
            `;
        } else {
            this.elements.devicesGrid.innerHTML = filteredDevices.map(device => `
                <div class="device-item">
                    <span class="device-icon">${this.getDeviceIcon(device.type)}</span>
                    <div class="device-info">
                        <h4>${device.name}</h4>
                        <p>${device.type} • ${this.getRelativeTime(device.connectedAt)}</p>
                    </div>
                    <div class="device-status ${device.autoSync ? 'auto-sync' : 'online'}">
                        ${device.autoSync ? 'Auto-Sync' : 'Manual'}
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

    updateStatistics() {
        this.elements.syncCount.textContent = `${this.syncCount} sync${this.syncCount !== 1 ? 's' : ''}`;
        
        if (this.lastSyncTime) {
            this.elements.lastSync.textContent = this.formatTime(this.lastSyncTime);
        }
        
        // Calculate sync rate (syncs per minute)
        const uptime = (Date.now() - this.connectionStartTime) / 1000 / 60; // minutes
        const syncRate = uptime > 0 ? Math.round(this.syncCount / uptime) : 0;
        this.elements.syncRate.textContent = `${syncRate}/min`;
    }

    updatePingTime(pingTime) {
        this.pingTimes.push(pingTime);
        if (this.pingTimes.length > 10) {
            this.pingTimes.shift();
        }
        
        const avgPing = Math.round(this.pingTimes.reduce((a, b) => a + b, 0) / this.pingTimes.length);
        this.elements.pingTime.textContent = `${avgPing}ms`;
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this.socket.emit('ping');
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    startBackgroundMonitoring() {
        // Start monitoring when page loads
        if (this.autoSyncEnabled && this.backgroundMonitorEnabled) {
            this.startClipboardMonitoring();
        }
    }

    handleVisibilityChange() {
        if (document.hidden) {
            console.log('📄 Page hidden - reducing monitoring frequency');
            // Optionally reduce monitoring frequency when hidden
        } else {
            console.log('📄 Page visible - normal monitoring frequency');
            // Check clipboard immediately when page becomes visible
            if (this.backgroundMonitorEnabled && this.isConnected) {
                this.checkClipboardChange();
            }
        }
    }

    async loadDeviceInfo() {
        try {
            const response = await fetch('/api/device-info');
            const data = await response.json();
            
            this.elements.deviceId.textContent = data.deviceId;
            this.elements.serverInfo.textContent = data.hostname;
        } catch (error) {
            console.error('Failed to load device info:', error);
        }
    }

    updateStatus(status, text) {
        this.elements.statusDot.className = `status-dot ${status}`;
        this.elements.statusText.textContent = text;
        this.updateAutoSyncStatus();
    }

    // Modal methods
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    }

    viewFullContent() {
        if (!this.currentContent) return;
        
        this.elements.fullContentText.value = this.currentContent;
        this.openModal('full-content-modal');
    }

    async copyFullContentToDevice() {
        const content = this.elements.fullContentText.value;
        if (!content) return;
        
        try {
            await navigator.clipboard.writeText(content);
            this.showNotification('📋 Full content copied to device!', 'success');
        } catch (error) {
            this.showNotification('Failed to copy: ' + error.message, 'error');
        }
    }

    selectAllContent() {
        this.elements.fullContentText.select();
        this.elements.fullContentText.setSelectionRange(0, 99999);
    }

    saveSettings() {
        this.autoSyncEnabled = this.elements.settingAutoSync.checked;
        this.backgroundMonitorEnabled = this.elements.settingBackgroundMonitor.checked;
        this.notificationsEnabled = this.elements.settingNotifications.checked;
        
        // Update auto sync toggle in header
        this.elements.autoSyncToggle.checked = this.autoSyncEnabled;
        
        // Apply settings
        if (this.autoSyncEnabled && this.backgroundMonitorEnabled) {
            this.startClipboardMonitoring();
        } else {
            this.stopClipboardMonitoring();
        }
        
        this.updateAutoSyncStatus();
        
        this.showNotification('⚙️ Settings saved!', 'success');
        this.closeModal('settings-modal');
    }

    resetSettings() {
        this.elements.settingAutoSync.checked = true;
        this.elements.settingBackgroundMonitor.checked = true;
        this.elements.settingNotifications.checked = true;
        
        this.showNotification('⚙️ Settings reset to defaults', 'info');
    }

    showNotification(message, type = 'info') {
        if (!this.notificationsEnabled && type !== 'error') return;
        
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
        }, 5000);
    }

    // Utility methods
    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString();
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
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

// Global click handler for modals
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// Initialize the enhanced clipboard system
let universalClipboard;

document.addEventListener('DOMContentLoaded', () => {
    universalClipboard = new EnhancedUniversalClipboard();
    console.log('🚀 Enhanced Universal Clipboard initialized');
});

// Add slideOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        from {
            transform: translateX(0) scale(1);
            opacity: 1;
        }
        to {
            transform: translateX(100%) scale(0.9);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);