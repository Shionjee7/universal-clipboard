const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, exec, execSync } = require('child_process');

class DaemonManager {
    static pidFile = path.join(os.tmpdir(), 'universal-clipboard.pid');
    static logFile = '/var/log/universal-clipboard.log';
    static configFile = path.join(os.homedir(), '.config', 'universal-clipboard', 'daemon.json');

    static async start(options = {}) {
        // Check if already running
        if (await this.isRunning()) {
            throw new Error('Universal Clipboard daemon is already running');
        }

        const logFile = options.logFile || this.logFile;
        const configPath = options.config || this.configFile;

        // Ensure log directory exists
        const logDir = path.dirname(logFile);
        if (!fs.existsSync(logDir)) {
            try {
                fs.mkdirSync(logDir, { recursive: true });
            } catch (error) {
                // Fallback to user's home directory if system log dir is not writable
                const userLogFile = path.join(os.homedir(), '.local', 'log', 'universal-clipboard.log');
                const userLogDir = path.dirname(userLogFile);
                if (!fs.existsSync(userLogDir)) {
                    fs.mkdirSync(userLogDir, { recursive: true });
                }
                options.logFile = userLogFile;
            }
        }

        // Save daemon configuration
        await this.saveDaemonConfig(options);

        // Prepare daemon process arguments
        const args = [
            path.resolve(__dirname, '../enhanced-index.js'),
            'start',
            '--headless',
            '--port', options.port || '3000',
            '--host', options.host || '0.0.0.0',
            '--polling', options.polling || '100'
        ];

        if (options.config) {
            args.push('--config', options.config);
        }

        // Spawn daemon process
        const daemon = spawn(process.execPath, args, {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                NODE_ENV: 'production',
                DAEMON_MODE: 'true'
            }
        });

        // Setup logging
        const logStream = fs.createWriteStream(logFile, { flags: 'a' });
        
        daemon.stdout.on('data', (data) => {
            logStream.write(`[${new Date().toISOString()}] [INFO] ${data}`);
        });
        
        daemon.stderr.on('data', (data) => {
            logStream.write(`[${new Date().toISOString()}] [ERROR] ${data}`);
        });

        daemon.on('error', (error) => {
            logStream.write(`[${new Date().toISOString()}] [FATAL] Daemon error: ${error.message}\n`);
            this.cleanup();
        });

        daemon.on('exit', (code, signal) => {
            logStream.write(`[${new Date().toISOString()}] [INFO] Daemon exited with code ${code}, signal ${signal}\n`);
            logStream.end();
            this.cleanup();
        });

        // Detach from parent process
        daemon.unref();

        // Save PID
        fs.writeFileSync(this.pidFile, daemon.pid.toString());

        // Wait a moment to ensure daemon starts successfully
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (!await this.isRunning()) {
            throw new Error('Daemon failed to start');
        }

        return daemon.pid;
    }

    static async stop() {
        const pid = await this.getPid();
        if (!pid) {
            throw new Error('No daemon running');
        }

        try {
            // Try graceful shutdown first
            process.kill(pid, 'SIGTERM');
            
            // Wait for graceful shutdown
            await this.waitForExit(pid, 5000);
        } catch (error) {
            // If graceful shutdown fails, force kill
            try {
                process.kill(pid, 'SIGKILL');
                await this.waitForExit(pid, 2000);
            } catch (killError) {
                throw new Error('Failed to stop daemon');
            }
        }

        this.cleanup();
    }

    static async restart() {
        if (await this.isRunning()) {
            await this.stop();
        }
        
        // Load previous configuration
        const config = await this.loadDaemonConfig();
        await this.start(config);
    }

    static async status() {
        const pid = await this.getPid();
        const running = await this.isRunning();
        const config = await this.loadDaemonConfig();

        const status = {
            running,
            pid: running ? pid : null,
            uptime: 0,
            port: config.port || 3000,
            logFile: config.logFile || this.logFile,
            configFile: this.configFile
        };

        if (running && pid) {
            // Get process start time for uptime calculation
            try {
                const stat = fs.statSync(`/proc/${pid}`);
                status.uptime = Date.now() - stat.mtime.getTime();
            } catch (error) {
                // Fallback method using ps
                try {
                    const output = execSync(`ps -o lstart= -p ${pid}`, { encoding: 'utf8' });
                    const startTime = new Date(output.trim()).getTime();
                    status.uptime = Date.now() - startTime;
                } catch (psError) {
                    status.uptime = 0;
                }
            }

            // Try to get additional stats from the service
            try {
                const response = await this.fetchWithTimeout(`http://localhost:${status.port}/api/device-info`, 2000);
                if (response.ok) {
                    const data = await response.json();
                    status.connectedDevices = data.connectedDevices?.length || 0;
                    status.totalSyncs = data.stats?.totalSyncs || 0;
                }
            } catch (error) {
                // Service stats not available
            }
        }

        return status;
    }

    static async getPid() {
        try {
            const pidStr = fs.readFileSync(this.pidFile, 'utf8').trim();
            return parseInt(pidStr);
        } catch (error) {
            return null;
        }
    }

    static async isRunning() {
        const pid = await this.getPid();
        if (!pid) return false;

        try {
            // Check if process is still running
            process.kill(pid, 0);
            return true;
        } catch (error) {
            // Process doesn't exist
            this.cleanup();
            return false;
        }
    }

    static cleanup() {
        try {
            if (fs.existsSync(this.pidFile)) {
                fs.unlinkSync(this.pidFile);
            }
        } catch (error) {
            console.warn('Failed to cleanup PID file:', error.message);
        }
    }

    static async waitForExit(pid, timeout = 5000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            try {
                process.kill(pid, 0);
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                return; // Process has exited
            }
        }
        
        throw new Error('Process did not exit within timeout');
    }

    static async saveDaemonConfig(config) {
        const configDir = path.dirname(this.configFile);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        const daemonConfig = {
            port: config.port,
            host: config.host,
            polling: config.polling,
            logFile: config.logFile,
            startTime: Date.now(),
            ...config
        };

        fs.writeFileSync(this.configFile, JSON.stringify(daemonConfig, null, 2));
    }

    static async loadDaemonConfig() {
        try {
            const configData = fs.readFileSync(this.configFile, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            return {};
        }
    }

    static async fetchWithTimeout(url, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    static async installSystemdService() {
        const serviceName = 'universal-clipboard';
        const serviceContent = this.generateSystemdService();
        
        // User service directory
        const userServiceDir = path.join(os.homedir(), '.config', 'systemd', 'user');
        const servicePath = path.join(userServiceDir, `${serviceName}.service`);

        // Create directory if it doesn't exist
        if (!fs.existsSync(userServiceDir)) {
            fs.mkdirSync(userServiceDir, { recursive: true });
        }

        // Write service file
        fs.writeFileSync(servicePath, serviceContent);

        try {
            // Reload systemd user daemon
            execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
            console.log('Systemd user daemon reloaded');
        } catch (error) {
            console.warn('Could not reload systemd daemon:', error.message);
        }

        return servicePath;
    }

    static generateSystemdService() {
        const execPath = process.execPath;
        const scriptPath = path.resolve(__dirname, '../enhanced-index.js');
        const logFile = path.join(os.homedir(), '.local', 'log', 'universal-clipboard.log');
        const configFile = this.configFile;

        return `[Unit]
Description=Universal Clipboard Enhanced - Cross-platform clipboard sync
After=network.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${execPath} ${scriptPath} start --daemon --log-file ${logFile} --config ${configFile}
ExecStop=/bin/kill -TERM $MAINPID
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=5
User=${os.userInfo().username}
Group=${os.userInfo().gid}
Environment=NODE_ENV=production
Environment=DAEMON_MODE=true
StandardOutput=append:${logFile}
StandardError=append:${logFile}
SyslogIdentifier=universal-clipboard

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${path.dirname(logFile)} ${path.dirname(configFile)} /tmp

# Resource limits
LimitNOFILE=65536
MemoryMax=256M
CPUQuota=50%

[Install]
WantedBy=default.target`;
    }

    static async enableAutostart() {
        try {
            await this.installSystemdService();
            execSync('systemctl --user enable universal-clipboard', { stdio: 'ignore' });
            console.log('Auto-start enabled successfully');
        } catch (error) {
            throw new Error(`Failed to enable auto-start: ${error.message}`);
        }
    }

    static async disableAutostart() {
        try {
            execSync('systemctl --user disable universal-clipboard', { stdio: 'ignore' });
            console.log('Auto-start disabled successfully');
        } catch (error) {
            throw new Error(`Failed to disable auto-start: ${error.message}`);
        }
    }

    static async getLogs(lines = 50) {
        const config = await this.loadDaemonConfig();
        const logFile = config.logFile || this.logFile;

        try {
            const output = execSync(`tail -n ${lines} "${logFile}"`, { encoding: 'utf8' });
            return output;
        } catch (error) {
            throw new Error(`Failed to read logs: ${error.message}`);
        }
    }

    static async rotateLogs() {
        const config = await this.loadDaemonConfig();
        const logFile = config.logFile || this.logFile;
        const rotatedLogFile = `${logFile}.old`;

        try {
            if (fs.existsSync(logFile)) {
                // Move current log to .old
                if (fs.existsSync(rotatedLogFile)) {
                    fs.unlinkSync(rotatedLogFile);
                }
                fs.renameSync(logFile, rotatedLogFile);
                
                // Send HUP signal to daemon to reopen log file
                const pid = await this.getPid();
                if (pid) {
                    process.kill(pid, 'SIGHUP');
                }
            }
        } catch (error) {
            throw new Error(`Failed to rotate logs: ${error.message}`);
        }
    }

    static async getSystemInfo() {
        const status = await this.status();
        
        return {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            uptime: os.uptime(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            loadAverage: os.loadavg(),
            hostname: os.hostname(),
            daemonStatus: status,
            systemdAvailable: this.isSystemdAvailable()
        };
    }

    static isSystemdAvailable() {
        try {
            execSync('systemctl --version', { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = DaemonManager;