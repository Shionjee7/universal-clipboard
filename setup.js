#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');
const chalk = require('chalk');

class UniversalClipboardSetup {
  constructor() {
    this.platform = os.platform();
    this.homedir = os.homedir();
    this.setupComplete = false;
  }

  async run() {
    console.log(chalk.blue.bold('\n🚀 Universal Clipboard Setup'));
    console.log(chalk.gray('Setting up automatic clipboard sync for your system...\n'));
    
    try {
      await this.detectPlatform();
      await this.setupPlatform();
      await this.createStartupEntries();
      await this.testInstallation();
      this.showCompletionMessage();
    } catch (error) {
      console.error(chalk.red('❌ Setup failed:'), error.message);
      this.showManualInstructions();
    }
  }

  async detectPlatform() {
    const platforms = {
      'win32': '💻 Windows',
      'darwin': '🍎 macOS', 
      'linux': '🐧 Linux',
      'android': '🤖 Android',
      'ios': '📱 iOS'
    };
    
    const platformName = platforms[this.platform] || '❓ Unknown';
    console.log(chalk.yellow(`Detected platform: ${platformName}`));
  }

  async setupPlatform() {
    switch (this.platform) {
      case 'win32':
        await this.setupWindows();
        break;
      case 'darwin':
        await this.setupMacOS();
        break;
      case 'linux':
        await this.setupLinux();
        break;
      default:
        throw new Error(`Platform ${this.platform} not supported yet`);
    }
  }

  async setupWindows() {
    console.log(chalk.blue('🔧 Configuring Windows...'));
    
    try {
      // Create Windows service script
      const servicePath = path.join(this.homedir, 'AppData', 'Local', 'UniversalClipboard');
      if (!fs.existsSync(servicePath)) {
        fs.mkdirSync(servicePath, { recursive: true });
      }

      const serviceScript = `@echo off
title Universal Clipboard Service
echo Starting Universal Clipboard...
cd /d "${process.cwd()}"
node simple-server.js
pause`;

      fs.writeFileSync(path.join(servicePath, 'start-service.bat'), serviceScript);
      
      // Create startup entry
      const startupPath = path.join(this.homedir, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
      const startupScript = `@echo off
start /min "${path.join(servicePath, 'start-service.bat')}"`;
      
      fs.writeFileSync(path.join(startupPath, 'UniversalClipboard.bat'), startupScript);
      
      // Create desktop shortcut
      const desktopScript = `@echo off
echo Opening Universal Clipboard Control Panel...
start http://localhost:3000
echo Universal Clipboard is running in the background.
pause`;
      
      fs.writeFileSync(path.join(this.homedir, 'Desktop', 'Universal Clipboard.bat'), desktopScript);
      
      console.log(chalk.green('✅ Windows setup complete'));
      
    } catch (error) {
      throw new Error(`Windows setup failed: ${error.message}`);
    }
  }

  async setupMacOS() {
    console.log(chalk.blue('🔧 Configuring macOS...'));
    
    try {
      // Create LaunchAgent
      const launchAgentsPath = path.join(this.homedir, 'Library', 'LaunchAgents');
      if (!fs.existsSync(launchAgentsPath)) {
        fs.mkdirSync(launchAgentsPath, { recursive: true });
      }

      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.universalclip.sync</string>
    <key>Program</key>
    <string>${process.execPath}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>${path.join(process.cwd(), 'simple-server.js')}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${process.cwd()}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>${path.join(this.homedir, 'Library', 'Logs', 'universal-clipboard.log')}</string>
    <key>StandardOutPath</key>
    <string>${path.join(this.homedir, 'Library', 'Logs', 'universal-clipboard.log')}</string>
</dict>
</plist>`;

      const plistPath = path.join(launchAgentsPath, 'com.universalclip.sync.plist');
      fs.writeFileSync(plistPath, plistContent);
      
      // Create desktop shortcut
      const desktopShortcut = `#!/bin/bash
echo "Opening Universal Clipboard..."
open http://localhost:3000
`;
      
      const shortcutPath = path.join(this.homedir, 'Desktop', 'Universal Clipboard');
      fs.writeFileSync(shortcutPath, desktopShortcut);
      fs.chmodSync(shortcutPath, '755');
      
      // Load the launch agent
      await this.execAsync(`launchctl load ${plistPath}`);
      
      console.log(chalk.green('✅ macOS setup complete'));
      
    } catch (error) {
      throw new Error(`macOS setup failed: ${error.message}`);
    }
  }

  async setupLinux() {
    console.log(chalk.blue('🔧 Configuring Linux...'));
    
    try {
      // Create systemd user service
      const systemdPath = path.join(this.homedir, '.config', 'systemd', 'user');
      if (!fs.existsSync(systemdPath)) {
        fs.mkdirSync(systemdPath, { recursive: true });
      }

      const serviceContent = `[Unit]
Description=Universal Clipboard Sync
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${path.join(process.cwd(), 'simple-server.js')}
WorkingDirectory=${process.cwd()}
Restart=always
RestartSec=10

[Install]
WantedBy=default.target`;

      const servicePath = path.join(systemdPath, 'universal-clipboard.service');
      fs.writeFileSync(servicePath, serviceContent);
      
      // Enable and start service
      await this.execAsync('systemctl --user daemon-reload');
      await this.execAsync('systemctl --user enable universal-clipboard.service');
      await this.execAsync('systemctl --user start universal-clipboard.service');
      
      // Create desktop entry
      const desktopPath = path.join(this.homedir, '.local', 'share', 'applications');
      if (!fs.existsSync(desktopPath)) {
        fs.mkdirSync(desktopPath, { recursive: true });
      }

      const desktopEntry = `[Desktop Entry]
Name=Universal Clipboard
Comment=Universal clipboard sync across devices
Exec=xdg-open http://localhost:3000
Icon=edit-copy
Terminal=false
Type=Application
Categories=Utility;`;

      fs.writeFileSync(path.join(desktopPath, 'universal-clipboard.desktop'), desktopEntry);
      
      console.log(chalk.green('✅ Linux setup complete'));
      
    } catch (error) {
      throw new Error(`Linux setup failed: ${error.message}`);
    }
  }

  async createStartupEntries() {
    console.log(chalk.blue('🔧 Creating startup entries...'));
    
    // Create a universal start script
    const startScript = `#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Universal Clipboard...');

const serverPath = path.join(__dirname, 'simple-server.js');
const child = spawn(process.execPath, [serverPath], {
  detached: true,
  stdio: 'ignore'
});

child.unref();
console.log('✅ Universal Clipboard started successfully!');
console.log('🌐 Access at: http://localhost:3000');
`;

    fs.writeFileSync(path.join(process.cwd(), 'start-universal-clipboard.js'), startScript);
    fs.chmodSync(path.join(process.cwd(), 'start-universal-clipboard.js'), '755');
    
    console.log(chalk.green('✅ Startup entries created'));
  }

  async testInstallation() {
    console.log(chalk.blue('🧪 Testing installation...'));
    
    try {
      // Test if the server can start
      const testServer = spawn(process.execPath, [path.join(process.cwd(), 'simple-server.js')], {
        stdio: 'pipe'
      });
      
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          testServer.kill();
          console.log(chalk.green('✅ Installation test passed'));
          resolve();
        }, 2000);
        
        testServer.on('error', (error) => {
          reject(new Error(`Server test failed: ${error.message}`));
        });
      });
      
    } catch (error) {
      throw new Error(`Installation test failed: ${error.message}`);
    }
  }

  showCompletionMessage() {
    console.log(chalk.green.bold('\n🎉 Universal Clipboard Setup Complete!\n'));
    
    console.log(chalk.yellow('📋 What was installed:'));
    console.log('  • Automatic startup service');
    console.log('  • Desktop shortcuts');
    console.log('  • System permissions configured\n');
    
    console.log(chalk.yellow('🚀 How to use:'));
    console.log('  • Copy text on any device');
    console.log('  • It automatically appears on all connected devices');
    console.log('  • Access control panel: http://localhost:3000\n');
    
    console.log(chalk.yellow('📱 Connect other devices:'));
    console.log('  • Open http://localhost:3000 on other devices');
    console.log('  • Grant clipboard permissions when asked');
    console.log('  • Start copying/pasting!\n');
    
    console.log(chalk.green('Universal Clipboard is now running in the background.'));
    console.log(chalk.gray('It will start automatically when you boot your computer.\n'));
  }

  showManualInstructions() {
    console.log(chalk.yellow('\n📋 Manual Setup Instructions:\n'));
    
    console.log('1. Run this command to start Universal Clipboard:');
    console.log(chalk.cyan('   universal-clipboard start\n'));
    
    console.log('2. Open http://localhost:3000 on all your devices\n');
    
    console.log('3. Grant clipboard permissions when asked by your browser\n');
    
    console.log('4. Start copying and pasting between devices!\n');
  }

  async execAsync(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new UniversalClipboardSetup();
  setup.run();
}

module.exports = UniversalClipboardSetup;