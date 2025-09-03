#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const boxen = require('boxen');
const ora = require('ora');
const qrcodeTerminal = require('qrcode-terminal');
const { machineId } = require('node-machine-id');
const ClipboardServer = require('./src/server.js');
const pkg = require('./package.json');

const program = new Command();

program
  .name('universal-clipboard')
  .description('Cross-platform clipboard sync system')
  .version(pkg.version);

program
  .command('start')
  .description('Start the Universal Clipboard sync service')
  .option('-p, --port <number>', 'Port to run the server on', '3000')
  .option('-h, --host <address>', 'Host address to bind to', '0.0.0.0')
  .option('--no-mdns', 'Disable mDNS device discovery')
  .option('--no-qr', 'Disable QR code display')
  .action(async (options) => {
    const spinner = ora('Starting Universal Clipboard...').start();
    
    try {
      const deviceId = await machineId();
      const server = new ClipboardServer({
        port: parseInt(options.port),
        host: options.host,
        enableMdns: options.mdns,
        deviceId: deviceId.substring(0, 8)
      });

      await server.start();
      spinner.succeed('Universal Clipboard started successfully!');

      const serverUrl = `http://${getLocalIP()}:${options.port}`;
      
      console.log(boxen(
        chalk.green.bold('🔄 Universal Clipboard Running') + '\n\n' +
        chalk.white(`📱 Mobile/Web Access: ${chalk.cyan(serverUrl)}\n`) +
        chalk.white(`🆔 Device ID: ${chalk.yellow(server.deviceId)}\n`) +
        chalk.white(`🌐 Port: ${chalk.yellow(options.port)}\n`) +
        chalk.white(`📋 Clipboard monitoring: ${chalk.green('Active')}\n\n`) +
        chalk.gray('Press Ctrl+C to stop'),
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green'
        }
      ));

      if (options.qr) {
        console.log(chalk.bold('\n📱 Scan QR Code to connect mobile devices:\n'));
        qrcodeTerminal.generate(serverUrl, { small: true });
      }

      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\n🛑 Shutting down Universal Clipboard...'));
        server.stop();
        process.exit(0);
      });

    } catch (error) {
      spinner.fail('Failed to start Universal Clipboard');
      console.error(chalk.red('Error:', error.message));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check the status of running clipboard services')
  .action(() => {
    console.log(chalk.blue('Checking Universal Clipboard status...'));
    console.log(chalk.yellow('Status checking not yet implemented'));
  });

program
  .command('stop')
  .description('Stop the Universal Clipboard service')
  .action(() => {
    console.log(chalk.blue('Stopping Universal Clipboard...'));
    console.log(chalk.yellow('Service stopping not yet implemented'));
  });

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

if (require.main === module) {
  program.parse();
}

module.exports = program;