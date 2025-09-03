const { exec, execSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

class TerminalClipboard {
    constructor(options = {}) {
        this.options = {
            preferredMethod: options.preferredMethod || 'auto',
            tmuxSession: options.tmuxSession,
            screenSession: options.screenSession,
            fallbackToFile: options.fallbackToFile !== false,
            osc52Support: options.osc52Support !== false,
            ...options
        };
        
        this.platform = os.platform();
        this.availableMethods = [];
        this.preferredMethod = null;
        this.fallbackFile = path.join(os.tmpdir(), '.universal-clipboard-fallback');
        
        this.detectAvailableMethods();
    }

    async detectAvailableMethods() {
        this.availableMethods = [];
        
        // Test various clipboard methods
        const methods = [
            'tmux',
            'screen', 
            'xclip',
            'xsel',
            'wl-clipboard',
            'pbcopy', // macOS
            'clip.exe', // Windows via WSL
            'osc52',
            'file'
        ];
        
        for (const method of methods) {
            const supported = await this.testMethod(method);
            if (supported) {
                this.availableMethods.push(method);
            }
        }
        
        this.preferredMethod = this.selectPreferredMethod();
        console.log(`📋 Terminal clipboard using: ${this.preferredMethod}`);
    }

    async testMethod(method) {
        try {
            switch (method) {
                case 'tmux':
                    return this.testTmux();
                case 'screen':
                    return this.testScreen();
                case 'xclip':
                    return this.testCommand('xclip -version');
                case 'xsel':
                    return this.testCommand('xsel --version');
                case 'wl-clipboard':
                    return this.testCommand('wl-copy --version');
                case 'pbcopy':
                    return this.testCommand('pbcopy -help');
                case 'clip.exe':
                    return this.testCommand('clip.exe /?');
                case 'osc52':
                    return this.testOSC52Support();
                case 'file':
                    return true; // File fallback always available
                default:
                    return false;
            }
        } catch (error) {
            return false;
        }
    }

    async testTmux() {
        try {
            // Check if tmux is available
            await this.testCommand('tmux -V');
            
            // Check if we're in a tmux session or can connect to one
            const tmuxSession = this.options.tmuxSession || process.env.TMUX_PANE;
            if (tmuxSession) {
                return true;
            }
            
            // Try to find any tmux sessions
            const sessions = execSync('tmux list-sessions 2>/dev/null', { encoding: 'utf8' });
            return sessions.trim().length > 0;
        } catch {
            return false;
        }
    }

    async testScreen() {
        try {
            await this.testCommand('screen -version');
            
            const screenSession = this.options.screenSession || process.env.STY;
            if (screenSession) {
                return true;
            }
            
            // Try to find screen sessions
            const sessions = execSync('screen -ls 2>/dev/null', { encoding: 'utf8' });
            return sessions.includes('Socket');
        } catch {
            return false;
        }
    }

    async testOSC52Support() {
        // OSC 52 support depends on terminal emulator
        const term = process.env.TERM;
        const termProgram = process.env.TERM_PROGRAM;
        const sshClient = process.env.SSH_CLIENT || process.env.SSH_TTY;
        
        // Known supporting terminals
        const supportedTerms = [
            'xterm-256color',
            'screen-256color',
            'tmux-256color'
        ];
        
        const supportedPrograms = [
            'iTerm.app',
            'Terminal.app',
            'Hyper',
            'kitty',
            'alacritty'
        ];
        
        return (
            supportedTerms.includes(term) ||
            supportedPrograms.includes(termProgram) ||
            sshClient !== undefined
        );
    }

    async testCommand(command) {
        return new Promise((resolve) => {
            exec(command, (error) => {
                resolve(!error || error.code !== 127); // Command not found
            });
        });
    }

    selectPreferredMethod() {
        if (this.options.preferredMethod !== 'auto') {
            const method = this.options.preferredMethod;
            if (this.availableMethods.includes(method)) {
                return method;
            }
        }
        
        // Priority order for method selection
        const priority = [
            'tmux',
            'screen',
            'xclip',
            'xsel',
            'wl-clipboard',
            'pbcopy',
            'clip.exe',
            'osc52',
            'file'
        ];
        
        for (const method of priority) {
            if (this.availableMethods.includes(method)) {
                return method;
            }
        }
        
        return 'file'; // Fallback
    }

    async read() {
        if (!this.preferredMethod) {
            await this.detectAvailableMethods();
        }
        
        try {
            switch (this.preferredMethod) {
                case 'tmux':
                    return await this.readFromTmux();
                case 'screen':
                    return await this.readFromScreen();
                case 'xclip':
                    return await this.readFromCommand('xclip -selection clipboard -out');
                case 'xsel':
                    return await this.readFromCommand('xsel --clipboard --output');
                case 'wl-clipboard':
                    return await this.readFromCommand('wl-paste');
                case 'pbcopy':
                    return await this.readFromCommand('pbpaste');
                case 'clip.exe':
                    return await this.readFromCommand('powershell.exe -command "Get-Clipboard"');
                case 'osc52':
                    return await this.readViaOSC52();
                case 'file':
                    return await this.readFromFile();
                default:
                    throw new Error('No supported clipboard method available');
            }
        } catch (error) {
            console.warn(`Failed to read clipboard via ${this.preferredMethod}:`, error.message);
            
            // Try fallback methods
            if (this.preferredMethod !== 'file') {
                return await this.readFromFile();
            }
            
            throw error;
        }
    }

    async write(content) {
        if (!this.preferredMethod) {
            await this.detectAvailableMethods();
        }
        
        try {
            switch (this.preferredMethod) {
                case 'tmux':
                    return await this.writeToTmux(content);
                case 'screen':
                    return await this.writeToScreen(content);
                case 'xclip':
                    return await this.writeViaCommand('xclip -selection clipboard', content);
                case 'xsel':
                    return await this.writeViaCommand('xsel --clipboard --input', content);
                case 'wl-clipboard':
                    return await this.writeViaCommand('wl-copy', content);
                case 'pbcopy':
                    return await this.writeViaCommand('pbcopy', content);
                case 'clip.exe':
                    return await this.writeViaCommand('clip.exe', content);
                case 'osc52':
                    return await this.writeViaOSC52(content);
                case 'file':
                    return await this.writeToFile(content);
                default:
                    throw new Error('No supported clipboard method available');
            }
        } catch (error) {
            console.warn(`Failed to write clipboard via ${this.preferredMethod}:`, error.message);
            
            // Try fallback methods
            if (this.preferredMethod !== 'file') {
                await this.writeToFile(content);
            }
            
            throw error;
        }
    }

    async readFromTmux() {
        const session = this.options.tmuxSession || '';
        const command = session ? 
            `tmux show-buffer -t ${session}` : 
            'tmux show-buffer';
            
        return await this.readFromCommand(command);
    }

    async writeToTmux(content) {
        const session = this.options.tmuxSession || '';
        
        // Escape content for shell
        const escapedContent = content.replace(/'/g, "'\"'\"'");
        
        const command = session ? 
            `tmux set-buffer -t ${session} '${escapedContent}'` :
            `tmux set-buffer '${escapedContent}'`;
            
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`tmux set-buffer failed: ${stderr}`));
                } else {
                    resolve();
                }
            });
        });
    }

    async readFromScreen() {
        // Screen doesn't have a direct paste buffer access
        // We'll use the exchange file method
        const session = this.options.screenSession || process.env.STY;
        if (!session) {
            throw new Error('No screen session found');
        }
        
        const exchangeFile = `/tmp/screen-exchange.${session}`;
        
        try {
            return fs.readFileSync(exchangeFile, 'utf8');
        } catch (error) {
            throw new Error('No screen exchange file found');
        }
    }

    async writeToScreen(content) {
        const session = this.options.screenSession || process.env.STY;
        if (!session) {
            throw new Error('No screen session found');
        }
        
        const exchangeFile = `/tmp/screen-exchange.${session}`;
        fs.writeFileSync(exchangeFile, content);
        
        // Notify screen about the exchange file
        const command = `screen -S ${session} -X readbuf ${exchangeFile}`;
        
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`screen readbuf failed: ${stderr}`));
                } else {
                    resolve();
                }
            });
        });
    }

    async readFromCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`${command} failed: ${stderr}`));
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    async writeViaCommand(command, content) {
        return new Promise((resolve, reject) => {
            const child = spawn('sh', ['-c', command], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            child.stdin.write(content);
            child.stdin.end();
            
            let stderr = '';
            
            child.stderr.on('data', (data) => {
                stderr += data;
            });
            
            child.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`${command} failed with code ${code}: ${stderr}`));
                } else {
                    resolve();
                }
            });
            
            child.on('error', (error) => {
                reject(new Error(`${command} failed: ${error.message}`));
            });
        });
    }

    async readViaOSC52() {
        // OSC 52 read is complex and not widely supported
        // Most terminals don't respond to OSC 52 queries
        throw new Error('OSC 52 clipboard reading not supported');
    }

    async writeViaOSC52(content) {
        if (!process.stdout.isTTY) {
            throw new Error('OSC 52 requires TTY');
        }
        
        // Encode content as base64
        const encoded = Buffer.from(content, 'utf8').toString('base64');
        
        // Send OSC 52 escape sequence
        const osc52 = `\x1b]52;c;${encoded}\x07`;
        
        process.stdout.write(osc52);
        
        // Small delay to ensure sequence is processed
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    async readFromFile() {
        try {
            return fs.readFileSync(this.fallbackFile, 'utf8');
        } catch (error) {
            return ''; // Empty if file doesn't exist
        }
    }

    async writeToFile(content) {
        fs.writeFileSync(this.fallbackFile, content, 'utf8');
    }

    async testCapabilities() {
        const results = {};
        
        const methods = [
            { name: 'Tmux Integration', key: 'tmux' },
            { name: 'GNU Screen Integration', key: 'screen' },
            { name: 'X11 Clipboard (xclip)', key: 'xclip' },
            { name: 'X11 Clipboard (xsel)', key: 'xsel' },
            { name: 'Wayland Clipboard', key: 'wl-clipboard' },
            { name: 'macOS Clipboard', key: 'pbcopy' },
            { name: 'Windows Clipboard (WSL)', key: 'clip.exe' },
            { name: 'OSC 52 Terminal Sequences', key: 'osc52' },
            { name: 'File-based Fallback', key: 'file' }
        ];
        
        for (const method of methods) {
            try {
                const supported = await this.testMethod(method.key);
                
                results[method.name] = {
                    supported,
                    recommended: method.key === this.preferredMethod,
                    details: this.getMethodDetails(method.key)
                };
            } catch (error) {
                results[method.name] = {
                    supported: false,
                    error: error.message
                };
            }
        }
        
        return results;
    }

    getMethodDetails(method) {
        switch (method) {
            case 'tmux':
                return 'Integrates with tmux paste buffer for seamless terminal multiplexing';
            case 'screen':
                return 'Uses GNU Screen exchange files for clipboard sharing';
            case 'xclip':
                return 'X11 clipboard tool - works with most Linux desktop environments';
            case 'xsel':
                return 'Alternative X11 clipboard tool with different options';
            case 'wl-clipboard':
                return 'Modern Wayland clipboard support for newer Linux systems';
            case 'pbcopy':
                return 'Native macOS clipboard integration';
            case 'clip.exe':
                return 'Windows clipboard via WSL or terminal';
            case 'osc52':
                return 'Terminal escape sequences - works over SSH with compatible terminals';
            case 'file':
                return 'File-based fallback for environments without clipboard access';
            default:
                return 'Unknown method';
        }
    }

    getCapabilities() {
        return {
            availableMethods: this.availableMethods,
            preferredMethod: this.preferredMethod,
            supportsOSC52: this.availableMethods.includes('osc52'),
            supportsTmux: this.availableMethods.includes('tmux'),
            supportsScreen: this.availableMethods.includes('screen'),
            supportsX11: this.availableMethods.includes('xclip') || this.availableMethods.includes('xsel'),
            supportsWayland: this.availableMethods.includes('wl-clipboard'),
            supportsMacOS: this.availableMethods.includes('pbcopy'),
            supportsWindows: this.availableMethods.includes('clip.exe'),
            hasFallback: this.availableMethods.includes('file')
        };
    }

    async monitor(callback, interval = 1000) {
        let lastContent = '';
        
        const checkClipboard = async () => {
            try {
                const content = await this.read();
                if (content !== lastContent) {
                    lastContent = content;
                    callback(content);
                }
            } catch (error) {
                console.warn('Clipboard monitoring error:', error.message);
            }
        };
        
        // Initial check
        await checkClipboard();
        
        // Set up interval
        const intervalId = setInterval(checkClipboard, interval);
        
        // Return cleanup function
        return () => clearInterval(intervalId);
    }
}

module.exports = TerminalClipboard;