#!/usr/bin/env node
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
