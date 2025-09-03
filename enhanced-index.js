#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const boxen = require('boxen');
const ora = require('ora');
const qrcodeTerminal = require('qrcode-terminal');
const { machineId } = require('node-machine-id');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, exec, execSync } = require('child_process');

const EnhancedClipboardServer = require('./src/enhanced-server.js');
const TerminalClipboard = require('./src/terminal-clipboard.js');
const DaemonManager = require('./src/daemon-manager.js');
const pkg = require('./package.json');

const program = new Command();
const isLinux = os.platform() === 'linux';
const isHeadless = process.env.DISPLAY === undefined && process.env.SSH_CLIENT !== undefined;
const isTerminalOnly = process.stdout.isTTY && !process.env.DISPLAY;

program
  .name('universal-clipboard')
  .description('Enhanced cross-platform clipboard sync with terminal and headless server support')
  .version(pkg.version);

program
  .command('start')
  .description('Start the Universal Clipboard sync service')
  .option('-p, --port <number>', 'Port to run the server on', '3000')
  .option('-h, --host <address>', 'Host address to bind to', '0.0.0.0')
  .option('--no-mdns', 'Disable mDNS device discovery')
  .option('--no-qr', 'Disable QR code display')
  .option('-d, --daemon', 'Run as background daemon (Linux only)')
  .option('--headless', 'Run in headless mode without UI output')
  .option('--terminal-only', 'Enable terminal-only clipboard mode')
  .option('--config <file>', 'Load configuration from file')
  .option('--polling <ms>', 'Clipboard polling interval in milliseconds', '100')
  .option('--log-file <file>', 'Log file path (daemon mode)')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const mergedOptions = { ...config, ...options };
      
      if (options.daemon && isLinux) {
        await startDaemon(mergedOptions);
      } else {
        await startNormalMode(mergedOptions);
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to start Universal Clipboard:', error.message));
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop the Universal Clipboard daemon')
  .action(async () => {
    if (!isLinux) {
      console.log(chalk.yellow('⚠️ Daemon mode only available on Linux'));
      return;
    }
    
    try {
      await DaemonManager.stop();
      console.log(chalk.green('✅ Universal Clipboard daemon stopped'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to stop daemon:', error.message));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check the status of Universal Clipboard service')
  .action(async () => {
    try {
      if (isLinux) {
        const status = await DaemonManager.status();
        displayStatus(status);
      } else {
        console.log(chalk.blue('📊 Checking Universal Clipboard status...'));
        // Check for running processes
        try {
          execSync('pgrep -f "universal-clipboard"', { stdio: 'ignore' });
          console.log(chalk.green('✅ Universal Clipboard is running'));
        } catch {
          console.log(chalk.yellow('⚠️ Universal Clipboard is not running'));
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to check status:', error.message));
    }
  });

program
  .command('restart')
  .description('Restart the Universal Clipboard daemon (Linux only)')
  .action(async () => {
    if (!isLinux) {
      console.log(chalk.yellow('⚠️ Daemon mode only available on Linux'));
      return;
    }
    
    try {
      await DaemonManager.restart();
      console.log(chalk.green('✅ Universal Clipboard daemon restarted'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to restart daemon:', error.message));
      process.exit(1);
    }
  });

program
  .command('connect <address>')
  .description('Manually connect to another Universal Clipboard instance')
  .option('-p, --port <number>', 'Port number', '3000')
  .action(async (address, options) => {
    console.log(chalk.blue(`🔗 Attempting to connect to ${address}:${options.port}...`));
    // Connection logic would be implemented here
    console.log(chalk.yellow('⚠️ Manual connection feature not yet implemented'));
  });

program
  .command('get')
  .description('Get current clipboard content and output to stdout')
  .option('--format <type>', 'Output format: text, json, raw', 'text')
  .action(async (options) => {
    try {
      const clipboard = new TerminalClipboard();
      const content = await clipboard.read();
      
      switch (options.format) {
        case 'json':
          console.log(JSON.stringify({ content, timestamp: Date.now() }));
          break;
        case 'raw':
          process.stdout.write(content);
          break;
        default:
          console.log(content);
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to read clipboard:', error.message));
      process.exit(1);
    }
  });

program
  .command('set <content>')
  .description('Set clipboard content from command line')
  .option('--from-stdin', 'Read content from stdin instead')
  .option('--sync', 'Sync to other connected devices')
  .action(async (content, options) => {
    try {
      let textToSet = content;
      
      if (options.fromStdin) {
        textToSet = await readStdin();
      }
      
      const clipboard = new TerminalClipboard();
      await clipboard.write(textToSet);
      
      console.log(chalk.green(`✅ Clipboard set (${textToSet.length} characters)`));
      
      if (options.sync) {
        // Logic to sync with running service
        console.log(chalk.blue('🔄 Syncing to connected devices...'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to set clipboard:', error.message));
      process.exit(1);
    }
  });

program
  .command('history')
  .description('Show recent clipboard items')
  .option('-n, --count <number>', 'Number of items to show', '10')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    try {
      // Connect to running service to get history
      console.log(chalk.blue('📚 Fetching clipboard history...'));
      
      const response = await fetch(`http://localhost:3000/api/history`).catch(() => null);
      
      if (response && response.ok) {
        const data = await response.json();
        displayHistory(data.history, options);
      } else {
        console.log(chalk.yellow('⚠️ No running Universal Clipboard service found'));
        console.log(chalk.gray('Start the service with: universal-clipboard start'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to fetch history:', error.message));
    }
  });

program
  .command('config')
  .description('Configure Universal Clipboard settings')
  .option('--port <number>', 'Set default port')
  .option('--polling <ms>', 'Set clipboard polling interval')
  .option('--auto-start', 'Enable auto-start on boot')
  .option('--show', 'Show current configuration')
  .option('--reset', 'Reset to default configuration')
  .action(async (options) => {
    const configPath = getConfigPath();
    
    try {
      if (options.show) {
        const config = await loadConfig();
        console.log(chalk.blue('📋 Current Configuration:'));
        console.log(JSON.stringify(config, null, 2));
        return;
      }
      
      if (options.reset) {
        await resetConfig();
        console.log(chalk.green('✅ Configuration reset to defaults'));
        return;
      }
      
      const config = await loadConfig();
      let updated = false;
      
      if (options.port) {
        config.port = parseInt(options.port);
        updated = true;
      }
      
      if (options.polling) {
        config.pollingInterval = parseInt(options.polling);
        updated = true;
      }
      
      if (options.autoStart !== undefined) {
        config.autoStart = options.autoStart;
        updated = true;
        
        if (isLinux && options.autoStart) {
          await installSystemdService();
          console.log(chalk.green('✅ Systemd service installed for auto-start'));
        }
      }
      
      if (updated) {
        await saveConfig(config);
        console.log(chalk.green('✅ Configuration updated'));
      } else {
        program.commands.find(cmd => cmd.name() === 'config').help();
      }
    } catch (error) {
      console.error(chalk.red('❌ Configuration error:', error.message));
    }
  });

program
  .command('install-service')
  .description('Install systemd service for auto-start (Linux only)')
  .action(async () => {
    if (!isLinux) {
      console.log(chalk.yellow('⚠️ Systemd service installation only available on Linux'));
      return;
    }
    
    try {
      await installSystemdService();
      console.log(chalk.green('✅ Systemd service installed successfully'));
      console.log(chalk.gray('Use: systemctl --user enable universal-clipboard'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to install service:', error.message));
    }
  });

program
  .command('test-terminal')
  .description('Test terminal clipboard capabilities')
  .action(async () => {
    console.log(chalk.blue('🧪 Testing terminal clipboard capabilities...\n'));
    
    const clipboard = new TerminalClipboard();
    const capabilities = await clipboard.testCapabilities();
    
    displayTerminalCapabilities(capabilities);
  });

async function startNormalMode(options) {
  const isHeadlessMode = options.headless || isHeadless;
  const isTerminalMode = options.terminalOnly || isTerminalOnly;
  
  let spinner;
  if (!isHeadlessMode) {
    spinner = ora('Starting Enhanced Universal Clipboard...').start();
  }
  
  try {
    const deviceId = await machineId();
    const server = new EnhancedClipboardServer({
      port: parseInt(options.port),
      host: options.host,
      enableMdns: options.mdns,
      deviceId: deviceId.substring(0, 8),
      pollingInterval: parseInt(options.polling),
      headless: isHeadlessMode,
      terminalOnly: isTerminalMode
    });

    await server.start();
    
    if (spinner) {
      spinner.succeed('Enhanced Universal Clipboard started successfully!');
    }

    const serverUrl = `http://${getLocalIP()}:${options.port}`;
    
    if (!isHeadlessMode) {
      if (isTerminalMode) {
        displayTerminalInterface(server, serverUrl, options);
      } else {
        displayGUIInterface(server, serverUrl, options);
      }
    } else {
      console.log(`Universal Clipboard running on ${serverUrl}`);
    }

    setupSignalHandlers(server);

  } catch (error) {
    if (spinner) {
      spinner.fail('Failed to start Enhanced Universal Clipboard');
    }
    throw error;
  }
}

async function startDaemon(options) {
  console.log(chalk.blue('🚀 Starting Universal Clipboard daemon...'));
  
  try {
    await DaemonManager.start(options);
    console.log(chalk.green('✅ Daemon started successfully'));
    console.log(chalk.gray(`PID: ${await DaemonManager.getPid()}`));
    console.log(chalk.gray(`Logs: ${options.logFile || '/var/log/universal-clipboard.log'}`));
  } catch (error) {
    throw new Error(`Failed to start daemon: ${error.message}`);
  }
}

function displayTerminalInterface(server, serverUrl, options) {
  const width = process.stdout.columns || 80;
  const narrow = width < 100;
  
  console.clear();
  console.log(chalk.bold.cyan('╔' + '═'.repeat(width - 2) + '╗'));
  console.log(chalk.bold.cyan('║') + ' '.repeat(Math.floor((width - 30) / 2)) + 
              chalk.bold.white('🚀 UNIVERSAL CLIPBOARD ENHANCED') + 
              ' '.repeat(Math.ceil((width - 30) / 2) - 1) + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('╚' + '═'.repeat(width - 2) + '╝'));
  
  console.log();
  console.log(chalk.green('✅ Status:'), chalk.bold('Running'));
  console.log(chalk.blue('🌐 URL:'), chalk.cyan(serverUrl));
  console.log(chalk.yellow('🆔 Device ID:'), chalk.bold(server.deviceId));
  console.log(chalk.magenta('📋 Mode:'), chalk.bold('Terminal + Auto-Sync'));
  console.log();
  
  if (!options.qr && !narrow) {
    console.log(chalk.bold('📱 QR Code for Mobile Devices:'));
    console.log();
    qrcodeTerminal.generate(serverUrl, { small: true });
    console.log();
  }
  
  console.log(chalk.bold('📋 Terminal Clipboard Commands:'));
  console.log(chalk.gray('  • Get clipboard: ') + chalk.cyan('universal-clipboard get'));
  console.log(chalk.gray('  • Set clipboard: ') + chalk.cyan('universal-clipboard set "text"'));
  console.log(chalk.gray('  • View history:  ') + chalk.cyan('universal-clipboard history'));
  console.log();
  
  console.log(chalk.bold('⌨️  Keyboard Shortcuts:'));
  console.log(chalk.gray('  • Ctrl+C: Stop service'));
  console.log(chalk.gray('  • Ctrl+Z: Send to background'));
  console.log();
  
  // Display live stats (updates in place)
  displayLiveStats(server);
}

function displayGUIInterface(server, serverUrl, options) {
  console.log(boxen(
    chalk.green.bold('🚀 Universal Clipboard Enhanced') + '\n\n' +
    chalk.white(`📱 Mobile/Web: ${chalk.cyan(serverUrl)}\n`) +
    chalk.white(`🆔 Device ID: ${chalk.yellow(server.deviceId)}\n`) +
    chalk.white(`🌐 Port: ${chalk.yellow(options.port)}\n`) +
    chalk.white(`📋 Auto-Sync: ${chalk.green('Active')}\n`) +
    chalk.white(`⚡ Polling: ${chalk.yellow(options.polling + 'ms')}\n\n`) +
    chalk.gray('Press Ctrl+C to stop'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'green',
      backgroundColor: 'black'
    }
  ));

  if (!options.qr) {
    console.log(chalk.bold('\n📱 Scan QR Code to connect mobile devices:\n'));
    qrcodeTerminal.generate(serverUrl, { small: true });
  }
}

function displayLiveStats(server) {
  let statsLine = 0;
  
  const updateStats = () => {
    const stats = server.getStats ? server.getStats() : {
      connectedDevices: 0,
      totalSyncs: 0,
      uptime: Date.now() - server.startTime
    };
    
    const uptimeStr = formatUptime(stats.uptime);
    const line = `📊 ${chalk.cyan(stats.connectedDevices)} devices | ` +
                 `${chalk.green(stats.totalSyncs)} syncs | ` +
                 `${chalk.yellow('↑ ' + uptimeStr)}`;
    
    if (statsLine > 0) {
      process.stdout.moveCursor(0, -1);
      process.stdout.clearLine();
    }
    
    console.log(line);
    statsLine = 1;
  };
  
  updateStats();
  setInterval(updateStats, 5000); // Update every 5 seconds
}

function displayStatus(status) {
  console.log(chalk.blue('📊 Universal Clipboard Status:\n'));
  
  if (status.running) {
    console.log(chalk.green('✅ Status: Running'));
    console.log(chalk.cyan(`🆔 PID: ${status.pid}`));
    console.log(chalk.yellow(`⏱️  Uptime: ${formatUptime(status.uptime)}`));
    console.log(chalk.blue(`🌐 Port: ${status.port}`));
    console.log(chalk.magenta(`📋 Syncs: ${status.totalSyncs || 0}`));
  } else {
    console.log(chalk.red('❌ Status: Not running'));
  }
}

function displayHistory(history, options) {
  if (options.json) {
    console.log(JSON.stringify(history, null, 2));
    return;
  }
  
  if (history.length === 0) {
    console.log(chalk.yellow('📚 No clipboard history found'));
    return;
  }
  
  console.log(chalk.bold('📚 Clipboard History:\n'));
  
  const count = Math.min(parseInt(options.count), history.length);
  
  for (let i = 0; i < count; i++) {
    const item = history[i];
    const time = new Date(item.timestamp).toLocaleTimeString();
    const preview = item.preview.substring(0, 60);
    
    console.log(chalk.cyan(`${i + 1}.`) + ` ${preview}`);
    console.log(chalk.gray(`   ${time} • ${item.size} chars\n`));
  }
}

function displayTerminalCapabilities(capabilities) {
  console.log(chalk.bold('🧪 Terminal Clipboard Test Results:\n'));
  
  Object.entries(capabilities).forEach(([name, result]) => {
    const icon = result.supported ? '✅' : '❌';
    const status = result.supported ? chalk.green('Supported') : chalk.red('Not supported');
    
    console.log(`${icon} ${chalk.bold(name)}: ${status}`);
    
    if (result.details) {
      console.log(chalk.gray(`   ${result.details}`));
    }
    
    if (result.error) {
      console.log(chalk.red(`   Error: ${result.error}`));
    }
    
    console.log();
  });
  
  console.log(chalk.bold('📋 Recommended clipboard method:'));
  const recommended = Object.entries(capabilities)
    .find(([, result]) => result.supported && result.recommended);
  
  if (recommended) {
    console.log(chalk.green(`   ${recommended[0]}`));
  } else {
    console.log(chalk.yellow('   Manual clipboard management required'));
  }
}

function setupSignalHandlers(server) {
  const cleanup = () => {
    console.log(chalk.yellow('\n\n🛑 Shutting down Universal Clipboard...'));
    
    if (server && server.stop) {
      server.stop();
    }
    
    process.exit(0);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  // Handle daemon mode signals
  if (isLinux) {
    process.on('SIGHUP', () => {
      console.log('🔄 Received SIGHUP, reloading configuration...');
      // Reload config logic here
    });
  }
}

async function loadConfig(configFile) {
  const configPath = configFile || getConfigPath();
  
  const defaultConfig = {
    port: 3000,
    host: '0.0.0.0',
    pollingInterval: 100,
    autoStart: false,
    enableMdns: true,
    maxHistorySize: 10,
    logLevel: 'info'
  };
  
  try {
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...defaultConfig, ...configData };
    }
  } catch (error) {
    console.warn(chalk.yellow(`⚠️ Could not load config: ${error.message}`));
  }
  
  return defaultConfig;
}

async function saveConfig(config) {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);
  
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function resetConfig() {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
}

function getConfigPath() {
  const configDir = path.join(os.homedir(), '.config', 'universal-clipboard');
  return path.join(configDir, 'config.json');
}

async function installSystemdService() {
  const serviceContent = `[Unit]
Description=Universal Clipboard Enhanced
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${__filename} start --daemon
Restart=always
RestartSec=5
User=${os.userInfo().username}
Environment=NODE_ENV=production

[Install]
WantedBy=default.target`;

  const servicePath = path.join(os.homedir(), '.config', 'systemd', 'user', 'universal-clipboard.service');
  const serviceDir = path.dirname(servicePath);
  
  if (!fs.existsSync(serviceDir)) {
    fs.mkdirSync(serviceDir, { recursive: true });
  }
  
  fs.writeFileSync(servicePath, serviceContent);
  
  try {
    execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
  } catch (error) {
    console.warn(chalk.yellow('⚠️ Could not reload systemd daemon'));
  }
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });
    process.stdin.on('end', () => {
      resolve(data.trim());
    });
  });
}

function getLocalIP() {
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

function formatUptime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

if (require.main === module) {
  program.parse();
}

module.exports = program;