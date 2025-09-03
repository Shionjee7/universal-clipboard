#!/bin/bash

# Universal Clipboard Enhanced - macOS Installation Script
# This script installs Universal Clipboard as a LaunchAgent and application

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_NAME="com.universal-clipboard.enhanced"
INSTALL_DIR="$HOME/Applications/UniversalClipboard"
LAUNCHAGENT_DIR="$HOME/Library/LaunchAgents"
LAUNCHAGENT_PLIST="$LAUNCHAGENT_DIR/$SERVICE_NAME.plist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check macOS version
    MACOS_VERSION=$(sw_vers -productVersion)
    log_info "macOS version: $MACOS_VERSION"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js first:"
        log_error "  • Install from: https://nodejs.org"
        log_error "  • Or use Homebrew: brew install node"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | sed 's/v//')
    log_info "Node.js version: $NODE_VERSION"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    # Check if Homebrew is available (optional)
    if command -v brew &> /dev/null; then
        log_info "Homebrew is available"
        HOMEBREW_AVAILABLE=true
    else
        log_info "Homebrew not found (optional)"
        HOMEBREW_AVAILABLE=false
    fi
    
    log_success "Prerequisites check passed"
}

# Install npm dependencies
install_dependencies() {
    log_info "Installing npm dependencies..."
    cd "$PROJECT_DIR"
    
    if [[ ! -f "package.json" ]]; then
        log_error "package.json not found. Make sure you're in the project directory."
        exit 1
    fi
    
    npm install
    log_success "Dependencies installed"
}

# Install application files
install_application() {
    log_info "Installing application files..."
    
    # Create installation directory
    mkdir -p "$INSTALL_DIR"
    
    # Copy application files
    rsync -av --exclude 'node_modules' --exclude '.git' "$PROJECT_DIR/" "$INSTALL_DIR/"
    
    # Install dependencies in the new location
    cd "$INSTALL_DIR"
    npm install --production
    
    # Make script executable
    chmod +x "$INSTALL_DIR/enhanced-index.js"
    
    log_success "Application installed to $INSTALL_DIR"
}

# Create LaunchAgent plist
create_launchagent() {
    log_info "Creating LaunchAgent..."
    
    mkdir -p "$LAUNCHAGENT_DIR"
    
    # Get current user
    CURRENT_USER=$(whoami)
    
    # Create plist content
    cat > "$LAUNCHAGENT_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$SERVICE_NAME</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>$(which node)</string>
        <string>$INSTALL_DIR/enhanced-index.js</string>
        <string>start</string>
        <string>--daemon</string>
        <string>--headless</string>
    </array>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>
    
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/universal-clipboard.log</string>
    
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/universal-clipboard-error.log</string>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>DAEMON_MODE</key>
        <string>true</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    
    <key>ProcessType</key>
    <string>Background</string>
    
    <key>ThrottleInterval</key>
    <integer>10</integer>
    
    <key>ExitTimeOut</key>
    <integer>30</integer>
</dict>
</plist>
EOF
    
    log_success "LaunchAgent created: $LAUNCHAGENT_PLIST"
}

# Install command line tool
install_cli_tool() {
    log_info "Installing command line tool..."
    
    LOCAL_BIN="$HOME/.local/bin"
    mkdir -p "$LOCAL_BIN"
    
    # Create symlink
    ln -sf "$INSTALL_DIR/enhanced-index.js" "$LOCAL_BIN/universal-clipboard"
    
    # Add to PATH if not already there
    SHELL_RC=""
    if [[ "$SHELL" == *"zsh"* ]]; then
        SHELL_RC="$HOME/.zshrc"
    elif [[ "$SHELL" == *"bash"* ]]; then
        SHELL_RC="$HOME/.bash_profile"
    fi
    
    if [[ -n "$SHELL_RC" ]]; then
        if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
            log_info "Added ~/.local/bin to PATH in $SHELL_RC"
        fi
    fi
    
    log_success "Command line tool available as 'universal-clipboard'"
}

# Create application bundle
create_app_bundle() {
    log_info "Creating application bundle..."
    
    APP_NAME="Universal Clipboard.app"
    APP_PATH="$HOME/Applications/$APP_NAME"
    
    # Create app bundle structure
    mkdir -p "$APP_PATH/Contents/"{MacOS,Resources}
    
    # Create Info.plist
    cat > "$APP_PATH/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>universal-clipboard</string>
    <key>CFBundleIdentifier</key>
    <string>com.universal-clipboard.enhanced</string>
    <key>CFBundleName</key>
    <string>Universal Clipboard</string>
    <key>CFBundleVersion</key>
    <string>2.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>2.0</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.12</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSUIElement</key>
    <true/>
</dict>
</plist>
EOF
    
    # Create executable script
    cat > "$APP_PATH/Contents/MacOS/universal-clipboard" << EOF
#!/bin/bash
exec "$INSTALL_DIR/enhanced-index.js" start --minimized
EOF
    
    chmod +x "$APP_PATH/Contents/MacOS/universal-clipboard"
    
    log_success "Application bundle created: $APP_PATH"
}

# Install shell completion
install_shell_completion() {
    log_info "Installing shell completion..."
    
    # Zsh completion
    if [[ "$SHELL" == *"zsh"* ]]; then
        ZSH_COMPLETIONS_DIR="$HOME/.local/share/zsh/site-functions"
        mkdir -p "$ZSH_COMPLETIONS_DIR"
        
        cat > "$ZSH_COMPLETIONS_DIR/_universal-clipboard" << 'EOF'
#compdef universal-clipboard

_universal_clipboard() {
    local context state state_descr line
    typeset -A opt_args

    _arguments \
        '1: :->command' \
        '*: :->args'

    case $state in
        command)
            local commands
            commands=(
                'start:Start the Universal Clipboard sync service'
                'stop:Stop the Universal Clipboard daemon'
                'status:Check the status of Universal Clipboard service'
                'restart:Restart the Universal Clipboard daemon'
                'connect:Manually connect to another Universal Clipboard instance'
                'get:Get current clipboard content and output to stdout'
                'set:Set clipboard content from command line'
                'history:Show recent clipboard items'
                'config:Configure Universal Clipboard settings'
                'install-service:Install system service for auto-start'
                'test-terminal:Test terminal clipboard capabilities'
                'help:Display help for command'
            )
            _describe 'command' commands
            ;;
        args)
            case $line[1] in
                start)
                    _arguments \
                        '--port[Port to run the server on]:port:' \
                        '--host[Host address to bind to]:host:' \
                        '--daemon[Run as background daemon]' \
                        '--headless[Run in headless mode without UI output]' \
                        '--terminal-only[Enable terminal-only clipboard mode]' \
                        '--config[Load configuration from file]:file:_files' \
                        '--polling[Clipboard polling interval in milliseconds]:ms:' \
                        '--log-file[Log file path (daemon mode)]:file:_files' \
                        '--no-mdns[Disable mDNS device discovery]' \
                        '--no-qr[Disable QR code display]'
                    ;;
                config)
                    _arguments \
                        '--port[Set default port]:port:' \
                        '--polling[Set clipboard polling interval]:ms:' \
                        '--auto-start[Enable auto-start on boot]' \
                        '--show[Show current configuration]' \
                        '--reset[Reset to default configuration]'
                    ;;
            esac
            ;;
    esac
}

_universal_clipboard "$@"
EOF
        
        log_success "Zsh completion installed"
    fi
    
    # Bash completion
    if [[ "$SHELL" == *"bash"* ]]; then
        BASH_COMPLETIONS_DIR="$HOME/.local/share/bash-completion/completions"
        mkdir -p "$BASH_COMPLETIONS_DIR"
        
        cat > "$BASH_COMPLETIONS_DIR/universal-clipboard" << 'EOF'
#!/bin/bash

_universal_clipboard() {
    local cur prev opts
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    opts="start stop status restart connect get set history config install-service test-terminal help"

    case "${prev}" in
        start)
            COMPREPLY=( $(compgen -W "--port --host --daemon --headless --terminal-only --config --polling --log-file --no-mdns --no-qr" -- ${cur}) )
            return 0
            ;;
        config)
            COMPREPLY=( $(compgen -W "--port --polling --auto-start --show --reset" -- ${cur}) )
            return 0
            ;;
        get)
            COMPREPLY=( $(compgen -W "--format" -- ${cur}) )
            return 0
            ;;
        set)
            COMPREPLY=( $(compgen -W "--from-stdin --sync" -- ${cur}) )
            return 0
            ;;
        history)
            COMPREPLY=( $(compgen -W "--count --json" -- ${cur}) )
            return 0
            ;;
        *)
            ;;
    esac

    COMPREPLY=( $(compgen -W "${opts}" -- ${cur}) )
    return 0
}

complete -F _universal_clipboard universal-clipboard
EOF
        
        log_success "Bash completion installed"
    fi
}

# Install Homebrew formula (optional)
install_homebrew_formula() {
    if [[ "$HOMEBREW_AVAILABLE" != true ]]; then
        return
    fi
    
    log_info "Creating Homebrew formula..."
    
    HOMEBREW_PREFIX=$(brew --prefix)
    FORMULA_DIR="$HOMEBREW_PREFIX/Homebrew/Library/Taps/homebrew/homebrew-core/Formula"
    
    # This would be a proper Homebrew formula in a real deployment
    log_warning "Homebrew formula creation not implemented in this installer"
    log_info "You can use the installed CLI tool instead"
}

# Load and start LaunchAgent
start_launchagent() {
    log_info "Loading and starting LaunchAgent..."
    
    # Load the LaunchAgent
    launchctl load "$LAUNCHAGENT_PLIST"
    
    # Start the service
    launchctl start "$SERVICE_NAME"
    
    # Wait a moment for startup
    sleep 2
    
    # Check if it's running
    if launchctl list | grep -q "$SERVICE_NAME"; then
        log_success "LaunchAgent started successfully"
    else
        log_error "Failed to start LaunchAgent"
        log_info "Check logs: tail -f ~/Library/Logs/universal-clipboard*.log"
    fi
}

# Request permissions
request_permissions() {
    log_info "Requesting necessary permissions..."
    
    # Request accessibility permissions (for clipboard access)
    log_info "Universal Clipboard may need accessibility permissions for clipboard access."
    log_info "If prompted, please grant permissions in System Preferences > Security & Privacy > Privacy > Accessibility"
    
    # Test clipboard access
    if command -v pbcopy &> /dev/null; then
        echo "Universal Clipboard Test" | pbcopy
        if pbpaste | grep -q "Universal Clipboard Test"; then
            log_success "Clipboard access working"
        else
            log_warning "Clipboard access may be limited"
        fi
    fi
}

# Uninstall function
uninstall() {
    log_info "Uninstalling Universal Clipboard..."
    
    # Stop and unload LaunchAgent
    launchctl stop "$SERVICE_NAME" 2>/dev/null || true
    launchctl unload "$LAUNCHAGENT_PLIST" 2>/dev/null || true
    
    # Remove LaunchAgent plist
    rm -f "$LAUNCHAGENT_PLIST"
    
    # Remove application files
    rm -rf "$INSTALL_DIR"
    
    # Remove application bundle
    rm -rf "$HOME/Applications/Universal Clipboard.app"
    
    # Remove CLI symlink
    rm -f "$HOME/.local/bin/universal-clipboard"
    
    # Remove completions
    rm -f "$HOME/.local/share/zsh/site-functions/_universal-clipboard"
    rm -f "$HOME/.local/share/bash-completion/completions/universal-clipboard"
    
    log_success "Universal Clipboard uninstalled"
}

# Show completion message
show_completion() {
    echo
    log_success "Universal Clipboard Enhanced installation completed!"
    echo
    echo "📋 Installation Information:"
    echo "  • Application: $INSTALL_DIR"
    echo "  • LaunchAgent: $SERVICE_NAME"
    echo "  • Logs: ~/Library/Logs/universal-clipboard*.log"
    echo
    echo "🚀 Next Steps:"
    echo "  • View status: universal-clipboard status"
    echo "  • Open web interface: http://localhost:3000"
    echo "  • Test terminal: universal-clipboard test-terminal"
    echo
    echo "📱 Mobile Connection:"
    echo "  • QR code will be shown when starting with GUI"
    echo "  • Visit the web interface URL on mobile devices"
    echo
    echo "🔧 Management Commands:"
    echo "  • Start: launchctl start $SERVICE_NAME"
    echo "  • Stop: launchctl stop $SERVICE_NAME"
    echo "  • Restart: launchctl restart $SERVICE_NAME"
    echo "  • View logs: tail -f ~/Library/Logs/universal-clipboard*.log"
    echo
    echo "🍎 macOS Integration:"
    echo "  • Application bundle: ~/Applications/Universal Clipboard.app"
    echo "  • Auto-start: Enabled via LaunchAgent"
    echo "  • Shell completion: Installed for $SHELL"
    echo
}

# Main installation function
main() {
    echo "🚀 Universal Clipboard Enhanced - macOS Installation"
    echo "=================================================="
    echo
    
    check_prerequisites
    install_dependencies
    install_application
    create_launchagent
    install_cli_tool
    create_app_bundle
    install_shell_completion
    install_homebrew_formula
    request_permissions
    start_launchagent
    show_completion
}

# Handle command line arguments
case "${1:-}" in
    --uninstall)
        uninstall
        ;;
    --help|-h)
        echo "Universal Clipboard Enhanced - macOS Installation Script"
        echo
        echo "Usage: $0 [OPTIONS]"
        echo
        echo "Options:"
        echo "  --uninstall    Uninstall Universal Clipboard"
        echo "  --help, -h     Show this help message"
        echo
        echo "Installation:"
        echo "  Run without arguments to install Universal Clipboard"
        echo "  The installer will create a LaunchAgent for auto-start"
        echo
        ;;
    *)
        main
        ;;
esac