const clipboardy = require('clipboardy').default;

console.log('🔍 Clipboard Diagnostic Test');
console.log('============================');

// Test 1: Basic functionality
try {
    console.log('\n1. Testing basic read/write...');
    clipboardy.writeSync('Diagnostic Test 123');
    const content = clipboardy.readSync();
    console.log('✅ Basic test passed:', content);
} catch (error) {
    console.log('❌ Basic test failed:', error.message);
}

// Test 2: Monitor clipboard for changes
console.log('\n2. Monitoring clipboard for 10 seconds...');
console.log('   Try copying some text now!');

let lastContent = '';
let changeCount = 0;

const monitor = setInterval(() => {
    try {
        const currentContent = clipboardy.readSync();
        if (currentContent !== lastContent && currentContent.trim().length > 0) {
            changeCount++;
            console.log(`📋 Change ${changeCount}: "${currentContent.substring(0, 50)}..."`);
            lastContent = currentContent;
        }
    } catch (error) {
        console.log('❌ Monitor error:', error.message);
    }
}, 500);

setTimeout(() => {
    clearInterval(monitor);
    console.log(`\n📊 Test complete. Detected ${changeCount} clipboard changes.`);
    
    if (changeCount === 0) {
        console.log('\n🔧 Troubleshooting suggestions:');
        console.log('   • Make sure you have clipboard permissions');
        console.log('   • Try running as administrator');
        console.log('   • Check if any security software is blocking clipboard access');
        console.log('   • On macOS, grant Terminal clipboard access in Security preferences');
    } else {
        console.log('\n✅ Clipboard monitoring is working correctly!');
    }
}, 10000);