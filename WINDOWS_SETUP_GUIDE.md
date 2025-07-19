# 🪟 Windows VS Code Setup Guide - Audico Enhanced System

## 🎯 Quick Start for Windows Users

This guide will help you set up the Audico Enhanced System on Windows using VS Code, PowerShell, and Git.

## 📋 Prerequisites

### Required Software
- ✅ **Node.js 16+** - [Download from nodejs.org](https://nodejs.org/)
- ✅ **Git for Windows** - [Download from git-scm.com](https://git-scm.com/download/win)
- ✅ **VS Code** - [Download from code.visualstudio.com](https://code.visualstudio.com/)
- ✅ **PowerShell 7+** (recommended) - [Install from Microsoft Store](https://apps.microsoft.com/store/detail/powershell/9MZ1SNWT0N5D)

### Verify Installation
Open PowerShell and run:
```powershell
node --version
npm --version
git --version
```

## 🚀 Step-by-Step Setup

### Step 1: Clone Your Existing Repository
```powershell
# Navigate to your projects folder
cd C:\Users\%USERNAME%\Documents\Projects

# Clone your existing repository
git clone https://github.com/AudicoSA/audico-enhanced-backend.git
cd audico-enhanced-backend
```

### Step 2: Download Enhanced System Files
```powershell
# Create a temporary download folder
mkdir temp-enhanced-system
cd temp-enhanced-system

# Download the enhanced processors (you'll need to manually download these from the AI Drive links)
# Visit: https://www.genspark.ai/aidrive/files/audico-enhanced-complete-system
# Download all files to this temp folder
```

### Step 3: Integrate Enhanced Files
```powershell
# Go back to your project root
cd ..

# Create processors directory
mkdir processors

# Copy enhanced files (adjust paths as needed after download)
copy temp-enhanced-system\processors\*.js processors\
copy temp-enhanced-system\audico-enhanced-system.js .
copy temp-enhanced-system\*.md .

# Clean up temp folder
rmdir /s temp-enhanced-system
```

### Step 4: Install Dependencies
```powershell
# Install existing dependencies
npm install

# Install additional dependencies for enhanced system
npm install @anthropic-ai/sdk winston node-cron uuid
```

### Step 5: Environment Configuration
```powershell
# Copy environment template
copy .env.example .env

# Edit environment file
notepad .env
```

Add these Windows-specific paths to your `.env`:
```env
# Windows-specific paths
LOG_DIRECTORY=logs
BACKUP_LOCATION=backups\
TEMP_DIRECTORY=%TEMP%\audico-temp

# Your existing configuration
SUPABASE_URL=https://ajdehycoypilsegmxbto.supabase.co
SUPABASE_KEY=your_supabase_key_here
OPENAI_API_KEY=your_openai_key_here

# Enhanced system configuration
ENABLE_MULTI_AGENT=true
ENABLE_FALLBACK=true
MAX_CONCURRENT_JOBS=3
```

## 🔧 VS Code Setup

### Step 1: Open Project in VS Code
```powershell
# Open the project in VS Code
code .
```

### Step 2: Install Recommended Extensions
Install these VS Code extensions:
- **Node.js Extension Pack** - Complete Node.js development
- **ES6 String HTML** - Better template literal syntax highlighting
- **REST Client** - Test your API endpoints
- **GitLens** - Enhanced Git capabilities
- **Prettier** - Code formatting
- **ESLint** - JavaScript linting
- **Thunder Client** - API testing (alternative to Postman)

### Step 3: Configure VS Code Settings
Create `.vscode/settings.json`:
```json
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
```

### Step 4: Debug Configuration
Create `.vscode/launch.json`:
```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Launch Audico Server",
            "type": "node",
            "request": "launch",
            "program": "${workspaceFolder}\\server.js",
            "env": {
                "NODE_ENV": "development"
            },
            "console": "integratedTerminal",
            "restart": true,
            "runtimeExecutable": "node",
            "skipFiles": ["<node_internals>/**"]
        },
        {
            "name": "Attach to Process",
            "type": "node",
            "request": "attach",
            "port": 9229,
            "restart": true,
            "localRoot": "${workspaceFolder}",
            "remoteRoot": "."
        }
    ]
}
```

### Step 5: Tasks Configuration
Create `.vscode/tasks.json`:
```json
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
            },
            "problemMatcher": []
        },
        {
            "label": "Run Tests",
            "type": "shell",
            "command": "npm test",
            "group": "test",
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
```

## 🔄 Integration with Existing System

### Update Your server.js
Replace the agent imports in your existing `server.js`:

```javascript
// Replace these lines:
// const AgentOrchestrator = require('./agents/orchestrator');

// With these:
const AudicoEnhancedSystem = require('./audico-enhanced-system');

// Initialize the enhanced system
const enhancedSystem = new AudicoEnhancedSystem({
    openaiApiKey: process.env.OPENAI_API_KEY,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
    enableFallback: true
});
```

### Update Package.json Scripts
Add these scripts to your `package.json`:
```json
{
    "scripts": {
        "start": "node server.js",
        "dev": "nodemon server.js",
        "debug": "node --inspect server.js",
        "test": "node utils/health-check.js",
        "health": "node utils/health-check.js",
        "setup": "node setup-windows.js"
    }
}
```

## 🧪 Testing Your Setup

### Step 1: Start the Server
```powershell
# Method 1: Using npm
npm start

# Method 2: Using VS Code
# Press Ctrl+Shift+P, type "Tasks: Run Task", select "Start Server"

# Method 3: Using VS Code debugger
# Press F5 or go to Run and Debug panel
```

### Step 2: Test API Endpoints
Create a `test-requests.http` file in VS Code:
```http
### Test server health
GET http://localhost:3000/

### Test enhanced system status
GET http://localhost:3000/api/agents/status

### Test file upload (replace with actual file path)
POST http://localhost:3000/api/upload
Content-Type: multipart/form-data; boundary=boundary

--boundary
Content-Disposition: form-data; name="file"; filename="test.pdf"
Content-Type: application/pdf

< C:\path\to\your\test\pricelist.pdf
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
```

### Step 3: Monitor Logs
```powershell
# View logs in real-time
Get-Content -Path "logs\orchestrator.log" -Wait

# Or use VS Code terminal
tail -f logs/orchestrator.log
```

## 🛠️ Windows-Specific Tips

### PowerShell vs Command Prompt
- **Recommended:** Use PowerShell 7+ for better Unicode support
- **Git Bash:** Good alternative for Unix-like commands
- **Command Prompt:** Works but limited features

### File Paths
- Use double backslashes in JSON: `"C:\\path\\to\\file"`
- Use forward slashes in JavaScript: `"C:/path/to/file"`
- Environment variables: `%USERPROFILE%`, `%TEMP%`, `%APPDATA%`

### Windows Defender
Add exclusions for:
- Your project folder: `C:\Users\%USERNAME%\Documents\Projects\audico-enhanced-backend`
- Node.js folder: `C:\Program Files\nodejs`
- npm cache: `%APPDATA%\npm-cache`

### Firewall Configuration
Allow Node.js through Windows Firewall:
1. Windows Security → Firewall & network protection
2. Allow an app through firewall
3. Add Node.js if not already present

## 🚨 Troubleshooting

### Common Windows Issues

#### Issue: "Cannot find module" errors
```powershell
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rmdir /s node_modules
npm install
```

#### Issue: Permission denied errors
```powershell
# Run PowerShell as Administrator
# Or change npm permissions
npm config set prefix %APPDATA%\npm
```

#### Issue: Long path names
```powershell
# Enable long paths in Windows
# Run as Administrator:
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

#### Issue: Port already in use
```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### VS Code Specific Issues

#### Issue: Terminal not opening
- Check VS Code settings for default terminal
- Try: Ctrl+Shift+` to open terminal
- Reset terminal: Ctrl+Shift+P → "Terminal: Kill All Terminals"

#### Issue: Debugger not working
- Ensure Node.js is in PATH
- Check launch.json configuration
- Try restarting VS Code

## 📁 Recommended Folder Structure
```
C:\Users\%USERNAME%\Documents\Projects\
└── audico-enhanced-backend\
    ├── processors\              # Enhanced document processors
    ├── agents\                  # Original agents (backup)
    ├── middleware\              # Existing middleware
    ├── utils\                   # Utilities
    ├── logs\                    # Log files
    ├── backups\                 # Backup files
    ├── test\                    # Test files
    ├── .vscode\                 # VS Code configuration
    ├── server.js                 # Main server file
    ├── audico-enhanced-system.js # Enhanced system integration
    ├── package.json              # Dependencies
    ├── .env                      # Environment variables
    └── README.md                 # Documentation
```

## 🎯 Next Steps

1. **Test with Your Pricelists:** Upload your problematic pricelists to test the enhanced system
2. **Monitor Performance:** Watch the logs to see how the new processors handle different formats
3. **Configure N8N:** Set up N8N workflows for your chat system
4. **Deploy Frontend:** Use the enhanced frontend system for your OpenCart integration

## 📞 Support

If you encounter issues:
1. Check the logs in the `logs\` directory
2. Run health check: `npm run health`
3. Test individual components using the REST Client in VS Code
4. Review the INSTALLATION_GUIDE.md for detailed technical information

---

**🎉 You're Ready!** Your Windows VS Code environment is now set up for the Audico Enhanced System.
