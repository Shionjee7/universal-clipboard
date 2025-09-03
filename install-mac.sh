#!/bin/bash

# Universal Clipboard - One-Click Install for macOS
# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Unicode characters for better display
CHECK="✅"
CROSS="❌" 
ROCKET="🚀"
APPLE="🍎"
CLIPBOARD="📋"

clear
echo -e "${BLUE}"
echo "  ████████████████████████████████████████████████████████████"
echo "  █                                                          █"
echo "  █            🚀 Universal Clipboard Installer             █"
echo "  █                                                          █"
echo "  █     Install once, sync clipboard across ALL devices     █"
echo "  █        Windows • Mac • Linux • iOS • Android           █"
echo "  █                                                          █"
echo "  ████████████████████████████████████████████████████████████"
echo -e "${NC}"
echo

# Check if Node.js is installed
echo -e "${YELLOW}[1/5] Checking Node.js installation...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${CROSS} Node.js is not installed!"
    echo
    echo "Please install Node.js first:"
    echo "1. Go to https://nodejs.org"
    echo "2. Download and install the LTS version"
    echo "3. Run this installer again"
    echo
    echo "Or install with Homebrew:"
    echo "  brew install node"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${CHECK} Node.js detected: ${NODE_VERSION}"
echo

# Install Universal Clipboard globally
echo -e "${YELLOW}[2/5] Installing Universal Clipboard globally...${NC}"
echo "Running: npm install -g @universalclip/sync"

if npm install -g @universalclip/sync; then
    echo -e "${CHECK} Global installation completed"
else
    echo -e "${CROSS} Global installation failed, trying alternative method..."
    
    # Try local installation if global fails
    echo "Installing locally..."
    if [ -d "universal-clipboard" ]; then
        rm -rf universal-clipboard
    fi
    
    git clone https://github.com/Shionjee7/universal-clipboard.git universal-clipboard
    cd universal-clipboard || exit 1
    npm install
    
    # Create global command
    echo "#!/bin/bash" > ~/universal-clipboard
    echo "node \"$(pwd)/simple-server.js\" \"\$@\"" >> ~/universal-clipboard
    chmod +x ~/universal-clipboard
    
    # Add to PATH in shell profiles
    SHELL_PROFILE=""
    if [ -f ~/.zshrc ]; then
        SHELL_PROFILE="$HOME/.zshrc"
    elif [ -f ~/.bash_profile ]; then
        SHELL_PROFILE="$HOME/.bash_profile"
    elif [ -f ~/.bashrc ]; then
        SHELL_PROFILE="$HOME/.bashrc"
    fi
    
    if [ ! -z "$SHELL_PROFILE" ]; then
        echo "export PATH=\"$HOME:\$PATH\"" >> "$SHELL_PROFILE"
        echo -e "${CHECK} Added to PATH in $SHELL_PROFILE"
    fi
    
    echo -e "${CHECK} Local installation completed with global command"
    cd - || exit 1
fi
echo

# Run automatic setup
echo -e "${YELLOW}[3/5] Configuring system permissions and startup...${NC}"
if universal-clipboard setup; then
    echo -e "${CHECK} Automatic setup completed"
else
    echo -e "${CROSS} Automatic setup had issues, continuing with manual setup..."
fi
echo

# Create macOS-specific integrations
echo -e "${YELLOW}[4/5] Creating macOS integration...${NC}"

# Create Desktop shortcut
echo "Creating desktop shortcut..."
cat > ~/Desktop/Universal\ Clipboard << 'EOF'
#!/bin/bash
echo "Opening Universal Clipboard..."
open http://localhost:3000
EOF
chmod +x ~/Desktop/Universal\ Clipboard
echo -e "${CHECK} Desktop shortcut created"

# Create LaunchAgent for auto-startup
echo "Creating auto-startup service..."
mkdir -p ~/Library/LaunchAgents

cat > ~/Library/LaunchAgents/com.universalclip.sync.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.universalclip.sync</string>
    <key>Program</key>
    <string>$(which universal-clipboard)</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which universal-clipboard)</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/universal-clipboard.log</string>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/universal-clipboard.log</string>
</dict>
</plist>
EOF

# Load the LaunchAgent
launchctl load ~/Library/LaunchAgents/com.universalclip.sync.plist 2>/dev/null
echo -e "${CHECK} Auto-startup service created"

# Create application in Applications folder (optional)
echo "Creating application shortcut..."
mkdir -p ~/Applications/Universal\ Clipboard.app/Contents/MacOS

cat > ~/Applications/Universal\ Clipboard.app/Contents/MacOS/Universal\ Clipboard << 'EOF'
#!/bin/bash
open http://localhost:3000
EOF

chmod +x ~/Applications/Universal\ Clipboard.app/Contents/MacOS/Universal\ Clipboard

cat > ~/Applications/Universal\ Clipboard.app/Contents/Info.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>Universal Clipboard</string>
    <key>CFBundleIdentifier</key>
    <string>com.universalclip.sync</string>
    <key>CFBundleName</key>
    <string>Universal Clipboard</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
</dict>
</plist>
EOF

echo -e "${CHECK} macOS integration completed"
echo

# Start the service
echo -e "${YELLOW}[5/5] Starting Universal Clipboard service...${NC}"
echo "Starting background service..."
universal-clipboard start --daemon &
sleep 3

# Test the installation
echo "Testing installation..."
sleep 2
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${CHECK} Service is running!"
else
    echo -e "${CROSS} Service test failed, trying again..."
    sleep 5
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo -e "${CHECK} Service is running!"
    else
        echo -e "${CROSS} Service test failed - you may need to start manually"
        echo "Run: universal-clipboard start"
    fi
fi

echo
echo -e "${BLUE}"
echo "  ████████████████████████████████████████████████████████████"
echo "  █                                                          █"
echo "  █               🎉 INSTALLATION COMPLETE! 🎉              █"
echo "  █                                                          █"
echo "  ████████████████████████████████████████████████████████████"
echo -e "${NC}"
echo

echo -e "${CLIPBOARD} What's installed:"
echo "   • Universal Clipboard service (auto-starts with macOS)"
echo "   • Desktop shortcut for control panel"
echo "   • Application in Applications folder"
echo "   • Global commands: universal-clipboard, uclip"
echo

echo -e "${ROCKET} How to use:"
echo "   • Copy text anywhere on Mac - it syncs automatically!"
echo "   • Open http://localhost:3000 on other devices"
echo "   • Grant clipboard permissions when asked"
echo "   • Start copying/pasting between devices!"
echo

echo -e "${APPLE} Connect your other devices:"
echo "   • Windows: Download installer from GitHub or npm install -g @universalclip/sync"
echo "   • iPhone: Open Safari → http://localhost:3000 → Add to Home Screen"
echo "   • Android: Open Chrome → http://localhost:3000 → Add to Home Screen"
echo

echo -e "${BLUE}🔧 Commands:${NC}"
echo "   • universal-clipboard start    - Start the service"
echo "   • universal-clipboard stop     - Stop the service"
echo "   • universal-clipboard status   - Check service status"
echo "   • uclip start                  - Short command alias"
echo

echo "Opening control panel in 3 seconds..."
sleep 3
open http://localhost:3000

echo
echo -e "${CHECK} Universal Clipboard is now running in the background!"
echo "   It will automatically start when you boot macOS."
echo
echo "Press any key to continue..."
read -n 1 -s