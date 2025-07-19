# Audico Enhanced System - Windows PowerShell Setup Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    Audico Enhanced System Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if command exists
function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

# Check prerequisites
Write-Host "🔍 Checking prerequisites..." -ForegroundColor Yellow

if (-not (Test-Command "node")) {
    Write-Host "❌ Node.js not found. Please install from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Command "git")) {
    Write-Host "❌ Git not found. Please install from https://git-scm.com/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Command "npm")) {
    Write-Host "❌ npm not found. Please reinstall Node.js" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✅ Prerequisites check passed" -ForegroundColor Green
Write-Host ""

# Display current versions
Write-Host "📋 Current versions:" -ForegroundColor Cyan
Write-Host "Node.js: $(node --version)"
Write-Host "npm: $(npm --version)"
Write-Host "Git: $(git --version)"
Write-Host ""

# Create directories
Write-Host "📁 Creating project directories..." -ForegroundColor Yellow
$directories = @("processors", "logs", "backups", "test", ".vscode", "temp")
foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  ✅ Created: $dir" -ForegroundColor Green
    } else {
        Write-Host "  ℹ️  Exists: $dir" -ForegroundColor Gray
    }
}

# Install dependencies
Write-Host ""
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
try {
    npm install
    Write-Host "✅ Base dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to install base dependencies" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Install enhanced system dependencies
Write-Host ""
Write-Host "📦 Installing enhanced system dependencies..." -ForegroundColor Yellow
$enhancedPackages = @("@anthropic-ai/sdk", "winston", "node-cron", "uuid", "nodemon")
foreach ($package in $enhancedPackages) {
    try {
        npm install $package
        Write-Host "  ✅ Installed: $package" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠️  Warning: Failed to install $package" -ForegroundColor Yellow
    }
}

# Create .env file if it doesn't exist
if (-not (Test-Path ".env")) {
    Write-Host ""
    Write-Host "🔧 Creating environment file..." -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "✅ Created .env from template" -ForegroundColor Green
    } else {
        # Create basic .env file
        $envContent = @"
# Audico Enhanced System Environment Configuration
PORT=3000
NODE_ENV=development

# Supabase Configuration (REQUIRED)
SUPABASE_URL=https://ajdehycoypilsegmxbto.supabase.co
SUPABASE_KEY=your_supabase_key_here

# OpenAI Configuration (REQUIRED)
OPENAI_API_KEY=your_openai_key_here

# Enhanced System Configuration
ENABLE_MULTI_AGENT=true
ENABLE_FALLBACK=true
MAX_CONCURRENT_JOBS=3
LOG_LEVEL=info

# Windows-specific paths
LOG_DIRECTORY=logs
BACKUP_LOCATION=backups\
TEMP_DIRECTORY=%TEMP%\audico-temp
"@
        $envContent | Out-File -FilePath ".env" -Encoding UTF8
        Write-Host "✅ Created basic .env file" -ForegroundColor Green
    }
}

# Create VS Code configuration files
Write-Host ""
Write-Host "🔧 Creating VS Code configuration..." -ForegroundColor Yellow

# Create settings.json
$settingsJson = @"
{
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.codeActionsOnSave": {
        "source.fixAll.eslint": true
    },
    "files.exclude": {
        "**/node_modules": true,
        "**/logs": true,
        "**/backups": true
    },
    "terminal.integrated.defaultProfile.windows": "PowerShell"
}
"@
$settingsJson | Out-File -FilePath ".vscode/settings.json" -Encoding UTF8

# Create launch.json
$launchJson = @"
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Launch Audico Server",
            "type": "node",
            "request": "launch",
            "program": "`${workspaceFolder}\server.js",
            "env": {
                "NODE_ENV": "development"
            },
            "console": "integratedTerminal",
            "restart": true,
            "runtimeExecutable": "node",
            "skipFiles": ["<node_internals>/**"]
        }
    ]
}
"@
$launchJson | Out-File -FilePath ".vscode/launch.json" -Encoding UTF8

# Create tasks.json
$tasksJson = @"
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": "Start Server",
            "type": "shell",
            "command": "npm start",
            "group": "build",
            "presentation": {
                "echo": true,
                "reveal": "always",
                "focus": false,
                "panel": "new"
            }
        },
        {
            "label": "Health Check",
            "type": "shell",
            "command": "npm run health",
            "group": "build"
        }
    ]
}
"@
$tasksJson | Out-File -FilePath ".vscode/tasks.json" -Encoding UTF8

Write-Host "✅ VS Code configuration created" -ForegroundColor Green

# Create test request file
Write-Host ""
Write-Host "🧪 Creating test files..." -ForegroundColor Yellow
$testRequests = @"
### Test server health
GET http://localhost:3000/

### Test enhanced system status
GET http://localhost:3000/api/agents/status

### Test products endpoint
GET http://localhost:3000/api/products

### Test file upload (replace with actual file path)
POST http://localhost:3000/api/upload
Content-Type: multipart/form-data; boundary=boundary

--boundary
Content-Disposition: form-data; name="file"; filename="test.pdf"
Content-Type: application/pdf

< C:\path	o\your	est\pricelist.pdf
--boundary
Content-Disposition: form-data; name="supplier"

Denon
--boundary
Content-Disposition: form-data; name="priceType"

cost_including_vat
--boundary
Content-Disposition: form-data; name="marginPercentage"

25
--boundary--
"@
$testRequests | Out-File -FilePath "test-requests.http" -Encoding UTF8

# Create package.json scripts if package.json exists
if (Test-Path "package.json") {
    Write-Host ""
    Write-Host "📝 Updating package.json scripts..." -ForegroundColor Yellow
    # Note: This would require JSON manipulation, keeping it simple for now
    Write-Host "ℹ️  Please manually add these scripts to package.json:" -ForegroundColor Cyan
    Write-Host '  "setup": "powershell -ExecutionPolicy Bypass -File setup-windows.ps1"' -ForegroundColor Gray
    Write-Host '  "debug": "node --inspect server.js"' -ForegroundColor Gray
}

# Final instructions
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Setup completed successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Yellow
Write-Host "1. Edit .env file with your API keys:" -ForegroundColor White
Write-Host "   - SUPABASE_KEY" -ForegroundColor Gray
Write-Host "   - OPENAI_API_KEY" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Download enhanced processors from AI Drive:" -ForegroundColor White
Write-Host "   https://www.genspark.ai/aidrive/files/audico-enhanced-complete-system" -ForegroundColor Blue
Write-Host ""
Write-Host "3. Open project in VS Code:" -ForegroundColor White
Write-Host "   code ." -ForegroundColor Gray
Write-Host ""
Write-Host "4. Start the server:" -ForegroundColor White
Write-Host "   npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Test the API:" -ForegroundColor White
Write-Host "   Open test-requests.http in VS Code" -ForegroundColor Gray
Write-Host ""

Read-Host "Press Enter to exit"
