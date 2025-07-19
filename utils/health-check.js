#!/usr/bin/env node

// Audico Enhanced Backend Health Check Script

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Colors for console output
const colors = {
    reset: '\033[0m',
    red: '\033[31m',
    green: '\033[32m',
    yellow: '\033[33m',
    blue: '\033[34m'
};

function colorize(text, color) {
    return `${colors[color]}${text}${colors.reset}`;
}

function printStatus(message, status = 'info') {
    const prefix = {
        info: colorize('[INFO]', 'blue'),
        success: colorize('[PASS]', 'green'),
        warning: colorize('[WARN]', 'yellow'),
        error: colorize('[FAIL]', 'red')
    };

    console.log(`${prefix[status]} ${message}`);
}

async function checkEnvironmentVariables() {
    printStatus('Checking environment variables...', 'info');

    const requiredVars = [
        'SUPABASE_URL',
        'SUPABASE_KEY',
        'OPENAI_API_KEY'
    ];

    const optionalVars = [
        'ENABLE_MULTI_AGENT',
        'ENABLE_FALLBACK',
        'MAX_CONCURRENT_JOBS',
        'LOG_LEVEL'
    ];

    let allRequired = true;

    // Check required variables
    for (const varName of requiredVars) {
        if (process.env[varName]) {
            printStatus(`${varName}: ✓`, 'success');
        } else {
            printStatus(`${varName}: Missing (required)`, 'error');
            allRequired = false;
        }
    }

    // Check optional variables
    for (const varName of optionalVars) {
        if (process.env[varName]) {
            printStatus(`${varName}: ${process.env[varName]}`, 'success');
        } else {
            printStatus(`${varName}: Not set (optional)`, 'warning');
        }
    }

    return allRequired;
}

async function checkDatabaseConnection() {
    printStatus('Checking database connection...', 'info');

    try {
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_KEY
        );

        const { data, error } = await supabase
            .from('products')
            .select('count')
            .limit(1);

        if (error) {
            printStatus(`Database connection failed: ${error.message}`, 'error');
            return false;
        }

        printStatus('Database connection successful ✓', 'success');
        return true;

    } catch (error) {
        printStatus(`Database connection error: ${error.message}`, 'error');
        return false;
    }
}

async function checkOpenAIConnection() {
    printStatus('Checking OpenAI API connection...', 'info');

    try {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        await openai.models.list();
        printStatus('OpenAI API connection successful ✓', 'success');
        return true;

    } catch (error) {
        printStatus(`OpenAI API connection failed: ${error.message}`, 'error');
        return false;
    }
}

async function checkFileSystem() {
    printStatus('Checking file system...', 'info');

    const requiredDirs = ['logs', 'uploads'];
    const requiredFiles = ['package.json', 'server.js'];

    let allGood = true;

    // Check directories
    for (const dir of requiredDirs) {
        if (fs.existsSync(dir)) {
            printStatus(`Directory ${dir}: ✓`, 'success');
        } else {
            printStatus(`Directory ${dir}: Missing`, 'warning');
            try {
                fs.mkdirSync(dir, { recursive: true });
                printStatus(`Created directory ${dir}`, 'success');
            } catch (error) {
                printStatus(`Failed to create directory ${dir}: ${error.message}`, 'error');
                allGood = false;
            }
        }
    }

    // Check files
    for (const file of requiredFiles) {
        if (fs.existsSync(file)) {
            printStatus(`File ${file}: ✓`, 'success');
        } else {
            printStatus(`File ${file}: Missing`, 'error');
            allGood = false;
        }
    }

    return allGood;
}

async function checkDependencies() {
    printStatus('Checking dependencies...', 'info');

    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const nodeModulesExists = fs.existsSync('node_modules');

        if (!nodeModulesExists) {
            printStatus('node_modules directory missing - run npm install', 'error');
            return false;
        }

        // Check critical dependencies
        const criticalDeps = [
            'express',
            '@supabase/supabase-js',
            'openai',
            'multer',
            'cors'
        ];

        let allInstalled = true;

        for (const dep of criticalDeps) {
            const depPath = path.join('node_modules', dep);
            if (fs.existsSync(depPath)) {
                printStatus(`Dependency ${dep}: ✓`, 'success');
            } else {
                printStatus(`Dependency ${dep}: Missing`, 'error');
                allInstalled = false;
            }
        }

        return allInstalled;

    } catch (error) {
        printStatus(`Dependency check failed: ${error.message}`, 'error');
        return false;
    }
}

async function checkSystemResources() {
    printStatus('Checking system resources...', 'info');

    // Memory check
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();
    const freeMem = require('os').freemem();

    printStatus(`Memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB heap`, 'info');
    printStatus(`System memory: ${Math.round(freeMem / 1024 / 1024)}MB free / ${Math.round(totalMem / 1024 / 1024)}MB total`, 'info');

    // Disk space check (simplified)
    try {
        const stats = fs.statSync('.');
        printStatus('Disk access: ✓', 'success');
    } catch (error) {
        printStatus(`Disk access failed: ${error.message}`, 'error');
        return false;
    }

    return true;
}

async function checkAgentSystem() {
    printStatus('Checking multi-agent system...', 'info');

    const agentFiles = [
        'agents/orchestrator.js',
        'agents/document-agent.js',
        'agents/supplier-agent.js',
        'agents/price-agent.js',
        'agents/validation-agent.js',
        'agents/learning-agent.js'
    ];

    let allAgentsPresent = true;

    for (const agentFile of agentFiles) {
        if (fs.existsSync(agentFile)) {
            printStatus(`Agent ${path.basename(agentFile)}: ✓`, 'success');
        } else {
            printStatus(`Agent ${path.basename(agentFile)}: Missing`, 'error');
            allAgentsPresent = false;
        }
    }

    // Check middleware
    const middlewareFiles = [
        'middleware/job-manager.js',
        'middleware/health-monitor.js'
    ];

    for (const middlewareFile of middlewareFiles) {
        if (fs.existsSync(middlewareFile)) {
            printStatus(`Middleware ${path.basename(middlewareFile)}: ✓`, 'success');
        } else {
            printStatus(`Middleware ${path.basename(middlewareFile)}: Missing`, 'error');
            allAgentsPresent = false;
        }
    }

    return allAgentsPresent;
}

async function generateHealthReport() {
    console.log('\n' + colorize('='.repeat(50), 'blue'));
    console.log(colorize('🏥 AUDICO ENHANCED BACKEND HEALTH CHECK', 'blue'));
    console.log(colorize('='.repeat(50), 'blue') + '\n');

    const checks = [
        { name: 'Environment Variables', fn: checkEnvironmentVariables },
        { name: 'File System', fn: checkFileSystem },
        { name: 'Dependencies', fn: checkDependencies },
        { name: 'Database Connection', fn: checkDatabaseConnection },
        { name: 'OpenAI API Connection', fn: checkOpenAIConnection },
        { name: 'System Resources', fn: checkSystemResources },
        { name: 'Multi-Agent System', fn: checkAgentSystem }
    ];

    const results = [];

    for (const check of checks) {
        console.log(`\n${colorize('▶ ' + check.name, 'blue')}`);
        console.log('-'.repeat(30));

        try {
            const result = await check.fn();
            results.push({ name: check.name, passed: result });
        } catch (error) {
            printStatus(`Check failed: ${error.message}`, 'error');
            results.push({ name: check.name, passed: false });
        }
    }

    // Summary
    console.log('\n' + colorize('📊 HEALTH CHECK SUMMARY', 'blue'));
    console.log('='.repeat(30));

    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    for (const result of results) {
        const status = result.passed ? colorize('✓ PASS', 'green') : colorize('✗ FAIL', 'red');
        console.log(`${result.name.padEnd(25)} ${status}`);
    }

    console.log('\n' + colorize(`Overall: ${passed}/${total} checks passed`, passed === total ? 'green' : 'yellow'));

    if (passed === total) {
        console.log(colorize('🎉 System is healthy and ready!', 'green'));
        process.exit(0);
    } else {
        console.log(colorize('⚠️  Some issues found. Please review and fix.', 'yellow'));
        process.exit(1);
    }
}

// Load environment variables
require('dotenv').config();

// Run health check
generateHealthReport().catch(error => {
    console.error(colorize(`Health check failed: ${error.message}`, 'red'));
    process.exit(1);
});
