# Universal Clipboard Enhanced - Windows Installation Script
# This script installs Universal Clipboard as a Windows service and desktop application

param(
    [switch]$Uninstall,
    [switch]$Help,
    [string]$InstallPath = "$env:LOCALAPPDATA\UniversalClipboard",
    [string]$ServiceName = "UniversalClipboard"
)

# Set execution policy for current session
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

# Colors for output
$Colors = @{
    Info    = 'Cyan'
    Success = 'Green'
    Warning = 'Yellow'
    Error   = 'Red'
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = 'Info'
    )
    
    $prefix = switch ($Level) {
        'Info'    { '[INFO]' }
        'Success' { '[SUCCESS]' }
        'Warning' { '[WARNING]' }
        'Error'   { '[ERROR]' }
    }
    
    Write-Host "$prefix $Message" -ForegroundColor $Colors[$Level]
}

function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Install-Prerequisites {
    Write-Log "Checking prerequisites..." -Level Info
    
    # Check Node.js
    try {
        $nodeVersion = node --version
        Write-Log "Node.js version: $nodeVersion" -Level Info
    } catch {
        Write-Log "Node.js is not installed. Please install Node.js from https://nodejs.org" -Level Error
        exit 1
    }
    
    # Check npm
    try {
        $npmVersion = npm --version
        Write-Log "npm version: $npmVersion" -Level Info
    } catch {
        Write-Log "npm is not available. Please ensure npm is installed with Node.js" -Level Error
        exit 1
    }
    
    Write-Log "Prerequisites check passed" -Level Success
}

function Install-Dependencies {
    Write-Log "Installing npm dependencies..." -Level Info
    
    $projectDir = Split-Path -Parent $PSScriptRoot
    Set-Location $projectDir
    
    if (-not (Test-Path "package.json")) {
        Write-Log "package.json not found. Make sure you're in the project directory." -Level Error
        exit 1
    }
    
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Failed to install npm dependencies" -Level Error
        exit 1
    }
    
    Write-Log "Dependencies installed successfully" -Level Success
}

function Install-Application {
    Write-Log "Installing Universal Clipboard application..." -Level Info
    
    $projectDir = Split-Path -Parent $PSScriptRoot
    
    # Create installation directory
    if (-not (Test-Path $InstallPath)) {
        New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
    }
    
    # Copy application files
    $filesToCopy = @(
        "enhanced-index.js",
        "package.json",
        "src\",
        "public\"
    )
    
    foreach ($file in $filesToCopy) {
        $sourcePath = Join-Path $projectDir $file
        $destPath = Join-Path $InstallPath $file
        
        if (Test-Path $sourcePath) {
            Copy-Item -Path $sourcePath -Destination $destPath -Recurse -Force
            Write-Log "Copied $file" -Level Info
        }
    }
    
    Write-Log "Application files copied to $InstallPath" -Level Success
}

function Install-WindowsService {
    if (-not (Test-Administrator)) {
        Write-Log "Administrator privileges required to install Windows service" -Level Warning
        return
    }
    
    Write-Log "Installing Windows service..." -Level Info
    
    $servicePath = Join-Path $InstallPath "enhanced-index.js"
    $nodeExe = (Get-Command node).Source
    
    # Create service wrapper script
    $wrapperScript = @"
const { spawn } = require('child_process');
const path = require('path');

const servicePath = path.join(__dirname, 'enhanced-index.js');
const child = spawn('node', [servicePath, 'start', '--daemon', '--headless'], {
    stdio: 'inherit',
    cwd: __dirname
});

process.on('SIGINT', () => {
    child.kill('SIGINT');
});

process.on('SIGTERM', () => {
    child.kill('SIGTERM');
});
"@
    
    $wrapperPath = Join-Path $InstallPath "service-wrapper.js"
    Set-Content -Path $wrapperPath -Value $wrapperScript
    
    # Install service using sc command
    $serviceCmd = "sc create `"$ServiceName`" binPath= `"$nodeExe $wrapperPath`" start= auto DisplayName= `"Universal Clipboard Enhanced`""
    
    try {
        Invoke-Expression $serviceCmd
        Write-Log "Windows service installed successfully" -Level Success
    } catch {
        Write-Log "Failed to install Windows service: $($_.Exception.Message)" -Level Error
    }
}

function Install-StartupShortcut {
    Write-Log "Creating startup shortcut..." -Level Info
    
    $startupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
    $shortcutPath = Join-Path $startupFolder "Universal Clipboard.lnk"
    $targetPath = Join-Path $InstallPath "enhanced-index.js"
    
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut($shortcutPath)
    $Shortcut.TargetPath = "node"
    $Shortcut.Arguments = "`"$targetPath`" start --minimized"
    $Shortcut.WorkingDirectory = $InstallPath
    $Shortcut.Description = "Universal Clipboard Enhanced"
    $Shortcut.Save()
    
    Write-Log "Startup shortcut created" -Level Success
}

function Install-DesktopShortcut {
    Write-Log "Creating desktop shortcut..." -Level Info
    
    $desktopPath = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop")
    $shortcutPath = Join-Path $desktopPath "Universal Clipboard.lnk"
    $targetPath = Join-Path $InstallPath "enhanced-index.js"
    
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut($shortcutPath)
    $Shortcut.TargetPath = "node"
    $Shortcut.Arguments = "`"$targetPath`" start"
    $Shortcut.WorkingDirectory = $InstallPath
    $Shortcut.Description = "Universal Clipboard Enhanced"
    $Shortcut.Save()
    
    Write-Log "Desktop shortcut created" -Level Success
}

function Add-ToPath {
    Write-Log "Adding to system PATH..." -Level Info
    
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    
    if ($currentPath -notlike "*$InstallPath*") {
        $newPath = "$currentPath;$InstallPath"
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        Write-Log "Added to PATH (restart terminal to take effect)" -Level Success
    } else {
        Write-Log "Already in PATH" -Level Info
    }
}

function Install-PowerShellProfile {
    Write-Log "Installing PowerShell completion..." -Level Info
    
    $profilePath = $PROFILE
    $completionScript = @"

# Universal Clipboard Enhanced - PowerShell Completion
Register-ArgumentCompleter -CommandName 'universal-clipboard' -ScriptBlock {
    param(`$commandName, `$parameterName, `$wordToComplete, `$commandAst, `$fakeBoundParameters)
    
    `$commands = @('start', 'stop', 'status', 'restart', 'connect', 'get', 'set', 'history', 'config', 'install-service', 'test-terminal', 'help')
    `$commands | Where-Object { `$_ -like "`$wordToComplete*" }
}
"@
    
    if (Test-Path $profilePath) {
        Add-Content -Path $profilePath -Value $completionScript
    } else {
        New-Item -ItemType File -Path $profilePath -Force | Out-Null
        Set-Content -Path $profilePath -Value $completionScript
    }
    
    Write-Log "PowerShell completion installed" -Level Success
}

function Register-UrlProtocol {
    Write-Log "Registering URL protocol..." -Level Info
    
    $regPath = "HKCU:\SOFTWARE\Classes\clipboard"
    $targetPath = Join-Path $InstallPath "enhanced-index.js"
    
    try {
        New-Item -Path $regPath -Force | Out-Null
        Set-ItemProperty -Path $regPath -Name "(Default)" -Value "URL:Universal Clipboard Protocol"
        Set-ItemProperty -Path $regPath -Name "URL Protocol" -Value ""
        
        New-Item -Path "$regPath\shell\open\command" -Force | Out-Null
        Set-ItemProperty -Path "$regPath\shell\open\command" -Name "(Default)" -Value "node `"$targetPath`" connect %1"
        
        Write-Log "URL protocol registered (clipboard://)" -Level Success
    } catch {
        Write-Log "Failed to register URL protocol: $($_.Exception.Message)" -Level Warning
    }
}

function Start-Service {
    Write-Log "Starting Universal Clipboard..." -Level Info
    
    if (Test-Administrator -and (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
        Start-Service -Name $ServiceName
        Write-Log "Windows service started" -Level Success
    } else {
        # Start as regular application
        $targetPath = Join-Path $InstallPath "enhanced-index.js"
        Start-Process -FilePath "node" -ArgumentList "`"$targetPath`" start --minimized" -WorkingDirectory $InstallPath -WindowStyle Hidden
        Write-Log "Application started" -Level Success
    }
}

function Uninstall-UniversalClipboard {
    Write-Log "Uninstalling Universal Clipboard..." -Level Info
    
    # Stop and remove Windows service
    if (Test-Administrator -and (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        sc delete $ServiceName
        Write-Log "Windows service removed" -Level Info
    }
    
    # Remove shortcuts
    $shortcuts = @(
        (Join-Path ([System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")) "Universal Clipboard.lnk"),
        (Join-Path ([System.IO.Path]::Combine($env:USERPROFILE, "Desktop")) "Universal Clipboard.lnk")
    )
    
    foreach ($shortcut in $shortcuts) {
        if (Test-Path $shortcut) {
            Remove-Item $shortcut -Force
            Write-Log "Removed shortcut: $shortcut" -Level Info
        }
    }
    
    # Remove from PATH
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($currentPath -like "*$InstallPath*") {
        $newPath = $currentPath -replace [regex]::Escape(";$InstallPath"), ""
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        Write-Log "Removed from PATH" -Level Info
    }
    
    # Remove URL protocol
    Remove-Item -Path "HKCU:\SOFTWARE\Classes\clipboard" -Recurse -Force -ErrorAction SilentlyContinue
    
    # Remove installation directory
    if (Test-Path $InstallPath) {
        Remove-Item $InstallPath -Recurse -Force
        Write-Log "Installation directory removed" -Level Info
    }
    
    Write-Log "Universal Clipboard uninstalled successfully" -Level Success
}

function Show-Help {
    Write-Host @"
Universal Clipboard Enhanced - Windows Installation Script

Usage: .\install-windows.ps1 [OPTIONS]

Options:
  -Uninstall         Uninstall Universal Clipboard
  -Help              Show this help message
  -InstallPath       Installation directory (default: %LOCALAPPDATA%\UniversalClipboard)
  -ServiceName       Windows service name (default: UniversalClipboard)

Installation:
  Run without arguments to install Universal Clipboard
  Run as Administrator to install as Windows service

Examples:
  .\install-windows.ps1                           # Install for current user
  .\install-windows.ps1 -InstallPath "C:\Tools"   # Install to custom path
  .\install-windows.ps1 -Uninstall                # Uninstall

"@ -ForegroundColor White
}

function Show-Completion {
    Write-Host "`n" -NoNewline
    Write-Log "Universal Clipboard Enhanced installation completed!" -Level Success
    
    Write-Host @"

📋 Installation Information:
  • Path: $InstallPath
  • Service: $ServiceName
  • Status: Running

🚀 Next Steps:
  • View status: universal-clipboard status
  • Open web interface: http://localhost:3000
  • Test terminal: universal-clipboard test-terminal

📱 Mobile Connection:
  • Use the QR code displayed when starting
  • Visit the web interface URL on mobile devices

🔧 Management:
  • Start: universal-clipboard start
  • Stop: universal-clipboard stop
  • Configure: universal-clipboard config

"@ -ForegroundColor White
}

# Main installation function
function Install-UniversalClipboard {
    Write-Host "🚀 Universal Clipboard Enhanced - Windows Installation" -ForegroundColor Cyan
    Write-Host "====================================================" -ForegroundColor Cyan
    Write-Host ""
    
    Install-Prerequisites
    Install-Dependencies
    Install-Application
    
    if (Test-Administrator) {
        Install-WindowsService
    } else {
        Write-Log "Run as Administrator to install as Windows service" -Level Warning
        Install-StartupShortcut
    }
    
    Install-DesktopShortcut
    Add-ToPath
    Install-PowerShellProfile
    Register-UrlProtocol
    Start-Service
    Show-Completion
}

# Handle command line arguments
if ($Help) {
    Show-Help
} elseif ($Uninstall) {
    Uninstall-UniversalClipboard
} else {
    Install-UniversalClipboard
}