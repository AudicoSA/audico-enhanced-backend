@echo off
echo ========================================
echo    Audico Enhanced System Setup
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found. Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Git not found. Please install Git from https://git-scm.com/
    pause
    exit /b 1
)

echo ✅ Prerequisites check passed
echo.

REM Create necessary directories
echo 📁 Creating directories...
if not exist "processors" mkdir processors
if not exist "logs" mkdir logs
if not exist "backups" mkdir backups
if not exist "test" mkdir test
if not exist ".vscode" mkdir .vscode

REM Install dependencies
echo 📦 Installing dependencies...
npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

REM Install additional enhanced system dependencies
echo 📦 Installing enhanced system dependencies...
npm install @anthropic-ai/sdk winston node-cron uuid
if %errorlevel% neq 0 (
    echo ❌ Failed to install enhanced dependencies
    pause
    exit /b 1
)

REM Copy environment template if .env doesn't exist
if not exist ".env" (
    echo 🔧 Creating environment file...
    copy .env.example .env
    echo ⚠️  Please edit .env file with your API keys
)

echo.
echo ✅ Setup completed successfully!
echo.
echo Next steps:
echo 1. Edit .env file with your API keys
echo 2. Download enhanced processors from AI Drive
echo 3. Run: npm start
echo.
pause
