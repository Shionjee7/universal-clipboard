#!/bin/bash

# Universal Clipboard Enhanced - Linux Installation Script
# This script installs Universal Clipboard as a system service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_NAME="universal-clipboard"
USER_SERVICE_DIR="$HOME/.config/systemd/user"
SYSTEM_SERVICE_DIR="/etc/systemd/system"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_warning "Running as root. Installing system-wide service."
        INSTALL_MODE="system"
        SERVICE_DIR="$SYSTEM_SERVICE_DIR"
    else
        log_info "Running as user. Installing user service."
        INSTALL_MODE="user"
        SERVICE_DIR="$USER_SERVICE_DIR"
    fi
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    NODE_VERSION=$(node --version | sed 's/v//')
    log_info "Node.js version: $NODE_VERSION"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    # Check systemd
    if ! command -v systemctl &> /dev/null; then
        log_error "systemd is not available. This script requires systemd."
        exit 1
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

# Create systemd service file
create_service_file() {
    log_info "Creating systemd service file..."
    
    # Ensure service directory exists
    mkdir -p "$SERVICE_DIR"
    
    # Get paths
    NODE_PATH=$(which node)
    SCRIPT_PATH="$PROJECT_DIR/enhanced-index.js"
    LOG_DIR="/var/log"
    CONFIG_DIR="$HOME/.config/universal-clipboard"
    
    if [[ "$INSTALL_MODE" == "user" ]]; then
        LOG_DIR="$HOME/.local/log"
        USER_LINE="User=$(whoami)"
        GROUP_LINE="Group=$(id -gn)"
    else
        USER_LINE="User=universal-clipboard"
        GROUP_LINE="Group=universal-clipboard"
    fi
    
    # Ensure log directory exists
    mkdir -p "$LOG_DIR"
    
    # Create config directory
    mkdir -p "$CONFIG_DIR"
    
    # Generate service file content
    cat > "$SERVICE_DIR/$SERVICE_NAME.service" << EOF
[Unit]
Description=Universal Clipboard Enhanced - Cross-platform clipboard sync
Documentation=https://github.com/universal-clipboard/universal-clipboard
After=network.target network-online.target
Wants=network-online.target
StartLimitIntervalSec=30
StartLimitBurst=3

[Service]
Type=simple
ExecStart=$NODE_PATH $SCRIPT_PATH start --daemon --headless --log-file $LOG_DIR/universal-clipboard.log
ExecStop=/bin/kill -TERM \$MAINPID
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=5
TimeoutStopSec=30
$USER_LINE
$GROUP_LINE
Environment=NODE_ENV=production
Environment=DAEMON_MODE=true
StandardOutput=append:$LOG_DIR/universal-clipboard.log
StandardError=append:$LOG_DIR/universal-clipboard.log
SyslogIdentifier=universal-clipboard

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$LOG_DIR $CONFIG_DIR /tmp

# Resource limits
LimitNOFILE=65536
MemoryMax=256M
CPUQuota=50%

# Working directory
WorkingDirectory=$PROJECT_DIR

[Install]
WantedBy=default.target
EOF
    
    log_success "Service file created: $SERVICE_DIR/$SERVICE_NAME.service"
}

# Create user for system installation
create_system_user() {
    if [[ "$INSTALL_MODE" == "system" ]]; then
        log_info "Creating system user for Universal Clipboard..."
        
        if ! id -u universal-clipboard &>/dev/null; then
            useradd --system --home-dir /var/lib/universal-clipboard --create-home --shell /usr/sbin/nologin universal-clipboard
            log_success "System user 'universal-clipboard' created"
        else
            log_info "System user 'universal-clipboard' already exists"
        fi
        
        # Set permissions
        chown -R universal-clipboard:universal-clipboard /var/lib/universal-clipboard
        chmod 755 /var/lib/universal-clipboard
    fi
}

# Install and enable service
install_service() {
    log_info "Installing and enabling service..."
    
    if [[ "$INSTALL_MODE" == "system" ]]; then
        systemctl daemon-reload
        systemctl enable "$SERVICE_NAME"
        log_success "System service enabled"
    else
        systemctl --user daemon-reload
        systemctl --user enable "$SERVICE_NAME"
        log_success "User service enabled"
    fi
}

# Create command line symlink
create_symlink() {
    log_info "Creating command line symlink..."
    
    SYMLINK_TARGET="/usr/local/bin/universal-clipboard"
    
    if [[ "$INSTALL_MODE" == "system" ]]; then
        ln -sf "$PROJECT_DIR/enhanced-index.js" "$SYMLINK_TARGET"
        chmod +x "$SYMLINK_TARGET"
        log_success "Command line tool available as 'universal-clipboard'"
    else
        LOCAL_BIN="$HOME/.local/bin"
        mkdir -p "$LOCAL_BIN"
        ln -sf "$PROJECT_DIR/enhanced-index.js" "$LOCAL_BIN/universal-clipboard"
        chmod +x "$LOCAL_BIN/universal-clipboard"
        
        # Add to PATH if not already there
        if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
            log_info "Added ~/.local/bin to PATH in .bashrc"
        fi
        
        log_success "Command line tool available as 'universal-clipboard' (restart terminal or run 'source ~/.bashrc')"
    fi
}

# Install desktop entry
install_desktop_entry() {
    if [[ "$INSTALL_MODE" == "user" ]]; then
        log_info "Creating desktop entry..."
        
        DESKTOP_DIR="$HOME/.local/share/applications"
        mkdir -p "$DESKTOP_DIR"
        
        cat > "$DESKTOP_DIR/universal-clipboard.desktop" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Universal Clipboard Enhanced
Comment=Cross-platform clipboard synchronization
Exec=$PROJECT_DIR/enhanced-index.js start
Icon=$PROJECT_DIR/assets/icon.png
Terminal=false
StartupNotify=false
Categories=Utility;Network;
Keywords=clipboard;sync;share;universal;
EOF
        
        chmod +x "$DESKTOP_DIR/universal-clipboard.desktop"
        log_success "Desktop entry created"
    fi
}

# Install bash completion
install_bash_completion() {
    log_info "Installing bash completion..."
    
    if [[ "$INSTALL_MODE" == "system" ]]; then
        COMPLETION_DIR="/etc/bash_completion.d"
    else
        COMPLETION_DIR="$HOME/.local/share/bash-completion/completions"
        mkdir -p "$COMPLETION_DIR"
    fi
    
    cat > "$COMPLETION_DIR/universal-clipboard" << 'EOF'
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
}

# Start service
start_service() {
    log_info "Starting Universal Clipboard service..."
    
    if [[ "$INSTALL_MODE" == "system" ]]; then
        systemctl start "$SERVICE_NAME"
        SERVICE_STATUS=$(systemctl is-active "$SERVICE_NAME")
    else
        systemctl --user start "$SERVICE_NAME"
        SERVICE_STATUS=$(systemctl --user is-active "$SERVICE_NAME")
    fi
    
    if [[ "$SERVICE_STATUS" == "active" ]]; then
        log_success "Service started successfully"
    else
        log_error "Failed to start service"
        exit 1
    fi
}

# Show status and next steps
show_completion() {
    echo
    log_success "Universal Clipboard Enhanced installation completed!"
    echo
    echo "📋 Service Information:"
    echo "  • Name: $SERVICE_NAME"
    echo "  • Mode: $INSTALL_MODE"
    echo "  • Status: $(systemctl ${INSTALL_MODE == "user" && echo "--user" || echo ""} is-active $SERVICE_NAME)"
    echo
    echo "🚀 Next Steps:"
    echo "  • View status: universal-clipboard status"
    echo "  • View logs: journalctl ${INSTALL_MODE == "user" && echo "--user" || echo ""} -u $SERVICE_NAME -f"
    echo "  • Open web interface: http://localhost:3000"
    echo "  • Test terminal: universal-clipboard test-terminal"
    echo
    echo "📱 Mobile Connection:"
    echo "  • Get your IP: universal-clipboard get-ip"
    echo "  • Generate QR: universal-clipboard qr"
    echo
    echo "🔧 Management Commands:"
    echo "  • Stop service: systemctl ${INSTALL_MODE == "user" && echo "--user " || echo ""}stop $SERVICE_NAME"
    echo "  • Start service: systemctl ${INSTALL_MODE == "user" && echo "--user " || echo ""}start $SERVICE_NAME"
    echo "  • Restart service: systemctl ${INSTALL_MODE == "user" && echo "--user " || echo ""}restart $SERVICE_NAME"
    echo "  • Disable service: systemctl ${INSTALL_MODE == "user" && echo "--user " || echo ""}disable $SERVICE_NAME"
    echo
}

# Main installation function
main() {
    echo "🚀 Universal Clipboard Enhanced - Linux Installation"
    echo "=================================================="
    echo
    
    check_root
    check_prerequisites
    install_dependencies
    create_system_user
    create_service_file
    install_service
    create_symlink
    install_desktop_entry
    install_bash_completion
    start_service
    show_completion
}

# Handle command line arguments
case "${1:-}" in
    --uninstall)
        log_info "Uninstalling Universal Clipboard..."
        systemctl ${INSTALL_MODE == "user" && echo "--user" || echo ""} stop "$SERVICE_NAME" 2>/dev/null || true
        systemctl ${INSTALL_MODE == "user" && echo "--user" || echo ""} disable "$SERVICE_NAME" 2>/dev/null || true
        rm -f "$SERVICE_DIR/$SERVICE_NAME.service"
        systemctl ${INSTALL_MODE == "user" && echo "--user" || echo ""} daemon-reload
        log_success "Universal Clipboard uninstalled"
        ;;
    --help|-h)
        echo "Universal Clipboard Enhanced - Linux Installation Script"
        echo
        echo "Usage: $0 [OPTIONS]"
        echo
        echo "Options:"
        echo "  --uninstall    Uninstall Universal Clipboard"
        echo "  --help, -h     Show this help message"
        echo
        echo "Installation:"
        echo "  Run without arguments to install Universal Clipboard"
        echo "  Run as root to install system-wide, or as user for user installation"
        echo
        ;;
    *)
        main
        ;;
esac