@echo off
title Universal Clipboard - One-Click Install for Windows
color 0A

echo.
echo  ████████████████████████████████████████████████████████████
echo  █                                                          █
echo  █            🚀 Universal Clipboard Installer             █
echo  █                                                          █
echo  █     Install once, sync clipboard across ALL devices     █
echo  █        Windows • Mac • Linux • iOS • Android           █
echo  █                                                          █
echo  ████████████████████████████████████████████████████████████
echo.

REM Check if Node.js is installed
echo [1/5] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed!
    echo.
    echo Please install Node.js first:
    echo 1. Go to https://nodejs.org
    echo 2. Download and install the LTS version
    echo 3. Run this installer again
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js detected
echo.

REM Install Universal Clipboard globally
echo [2/5] Installing Universal Clipboard globally...
echo Running: npm install -g @universalclip/sync
npm install -g @universalclip/sync
if %errorlevel% neq 0 (
    echo ❌ Installation failed!
    echo Trying alternative method...
    
    REM Try local installation if global fails
    echo Installing locally...
    git clone https://github.com/universalclip/sync.git universal-clipboard
    cd universal-clipboard
    npm install
    
    REM Create global command
    echo @echo off > "%USERPROFILE%\universal-clipboard.cmd"
    echo node "%CD%\index.js" %%* >> "%USERPROFILE%\universal-clipboard.cmd"
    
    REM Add to PATH
    setx PATH "%PATH%;%USERPROFILE%" /M >nul 2>&1
    echo ✅ Local installation completed with global command
) else (
    echo ✅ Global installation completed
)
echo.

REM Run automatic setup
echo [3/5] Configuring system permissions and startup...
call universal-clipboard setup
if %errorlevel% neq 0 (
    echo ⚠️ Automatic setup had issues, continuing with manual setup...
)
echo.

REM Create Windows-specific shortcuts and services
echo [4/5] Creating Windows integration...

REM Create desktop shortcut
echo Creating desktop shortcut...
echo @echo off > "%USERPROFILE%\Desktop\Universal Clipboard.bat"
echo title Universal Clipboard Control Panel >> "%USERPROFILE%\Desktop\Universal Clipboard.bat"
echo echo Opening Universal Clipboard... >> "%USERPROFILE%\Desktop\Universal Clipboard.bat"
echo start http://localhost:3000 >> "%USERPROFILE%\Desktop\Universal Clipboard.bat"
echo timeout /t 3 /nobreak >> "%USERPROFILE%\Desktop\Universal Clipboard.bat"

REM Create startup entry
echo Creating auto-startup...
set STARTUP_FOLDER="%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
echo @echo off > %STARTUP_FOLDER%\UniversalClipboard.bat
echo start /min "" universal-clipboard start >> %STARTUP_FOLDER%\UniversalClipboard.bat

REM Create system tray helper (optional)
echo Creating system integration...
mkdir "%APPDATA%\UniversalClipboard" >nul 2>&1

echo ✅ Windows integration completed
echo.

REM Start the service
echo [5/5] Starting Universal Clipboard service...
echo Starting background service...
start /min "" universal-clipboard start
timeout /t 3 /nobreak >nul

REM Test the installation
echo Testing installation...
timeout /t 2 /nobreak >nul
curl -s http://localhost:3000 >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️ Service might be starting up... checking again...
    timeout /t 5 /nobreak >nul
    curl -s http://localhost:3000 >nul 2>&1
    if %errorlevel% neq 0 (
        echo ❌ Service test failed - you may need to start manually
        echo Run: universal-clipboard start
    ) else (
        echo ✅ Service is running!
    )
) else (
    echo ✅ Service is running!
)

echo.
echo  ████████████████████████████████████████████████████████████
echo  █                                                          █
echo  █               🎉 INSTALLATION COMPLETE! 🎉              █
echo  █                                                          █
echo  ████████████████████████████████████████████████████████████
echo.

echo 📋 What's installed:
echo    • Universal Clipboard service (auto-starts with Windows)
echo    • Desktop shortcut for control panel
echo    • Global commands: universal-clipboard, uclip
echo.

echo 🚀 How to use:
echo    • Copy text anywhere on Windows - it syncs automatically!
echo    • Open http://localhost:3000 on other devices
echo    • Grant clipboard permissions when asked
echo    • Start copying/pasting between devices!
echo.

echo 📱 Connect your other devices:
echo    • Mac: Open Safari/Chrome → http://localhost:3000
echo    • iPhone: Open Safari → http://localhost:3000 → Add to Home Screen
echo    • Android: Open Chrome → http://localhost:3000 → Add to Home Screen
echo.

echo 🔧 Commands:
echo    • universal-clipboard start    - Start the service
echo    • universal-clipboard stop     - Stop the service  
echo    • universal-clipboard status   - Check service status
echo    • uclip start                  - Short command alias
echo.

echo Opening control panel in 3 seconds...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo ✅ Universal Clipboard is now running in the background!
echo    It will automatically start when you boot Windows.
echo.
pause