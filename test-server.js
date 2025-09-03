const ClipboardServer = require('./src/server.js');
const chalk = require('chalk');

async function testServer() {
    console.log(chalk.blue('🧪 Testing Universal Clipboard Server...'));
    
    try {
        console.log(chalk.yellow('📝 Creating server instance...'));
        const server = new ClipboardServer({
            port: 3001,
            host: 'localhost',
            enableMdns: false,
            deviceId: 'test-device'
        });
        
        console.log(chalk.yellow('🚀 Starting server...'));
        await server.start();
        
        console.log(chalk.green('✅ Server started successfully on port 3001'));
        console.log(chalk.blue('🌐 Test URL: http://localhost:3001'));
        console.log(chalk.gray('Press Ctrl+C to stop'));
        
        process.on('SIGINT', () => {
            console.log(chalk.yellow('\n🛑 Stopping test server...'));
            server.stop();
            process.exit(0);
        });
        
    } catch (error) {
        console.error(chalk.red('❌ Test failed:'), error.message);
        process.exit(1);
    }
}

testServer();