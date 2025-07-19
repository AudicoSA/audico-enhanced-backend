
# 🚀 Audico Enhanced System - Installation & Setup Guide

## 📋 Overview

The Audico Enhanced System is a sophisticated document processing solution designed to handle 50+ different pricelist formats with intelligent learning capabilities. This guide will walk you through the complete installation and setup process.

## 🎯 System Requirements

### Minimum Requirements
- **Node.js**: Version 16.0.0 or higher
- **NPM**: Version 7.0.0 or higher
- **Memory**: 4GB RAM minimum (8GB recommended)
- **Storage**: 2GB free space
- **OS**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 18.04+)

### Recommended Requirements
- **Node.js**: Version 18.0.0 or higher
- **Memory**: 16GB RAM for optimal performance
- **CPU**: Multi-core processor (4+ cores recommended)
- **Storage**: SSD with 10GB free space

## 🔧 Prerequisites

### 1. External Services Setup

#### Supabase Database
1. Create account at [supabase.com](https://supabase.com)
2. Create new project
3. Note your project URL and anon key
4. Run the database setup script (provided below)

#### OpenAI API (Required for AI features)
1. Create account at [platform.openai.com](https://platform.openai.com)
2. Generate API key
3. Ensure you have sufficient credits

#### Anthropic API (Optional - for Claude integration)
1. Create account at [console.anthropic.com](https://console.anthropic.com)
2. Generate API key
3. Note: This is optional but recommended for enhanced AI capabilities

## 📦 Installation Steps

### Step 1: Clone or Download Enhanced System

```bash
# If you have the enhanced system files
cd your-audico-project-directory

# Copy the enhanced system files to your project
cp -r /path/to/enhanced-system/* ./
```

### Step 2: Install Dependencies

```bash
# Install all required packages
npm install

# Install additional enhanced system dependencies
npm install uuid winston node-cron

# Optional: Install OCR dependencies (if you need OCR support)
npm install tesseract.js
```

### Step 3: Environment Configuration

Create a `.env` file in your project root:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```env
# =============================================================================
# CORE CONFIGURATION (Required)
# =============================================================================

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key_here

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic Configuration (Optional)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Server Configuration
PORT=3000
NODE_ENV=production

# =============================================================================
# ENHANCED SYSTEM CONFIGURATION
# =============================================================================

# Enable/Disable Features
ENABLE_MULTI_AGENT=true
ENABLE_FALLBACK=true
ENABLE_LEARNING=true
ENABLE_OCR=false

# Performance Settings
MAX_CONCURRENT_JOBS=5
PROCESSING_TIMEOUT=300000
CONFIDENCE_THRESHOLD=0.7

# Logging
LOG_LEVEL=info
ENABLE_DETAILED_LOGGING=false
```

### Step 4: Database Setup

Run the database setup script:

```bash
node setup-database.js
```

Or manually create the required tables in Supabase:

```sql
-- Processing Templates Table
CREATE TABLE processing_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    supplier VARCHAR(100) NOT NULL,
    layout_type VARCHAR(50) NOT NULL,
    subtype VARCHAR(50),
    version VARCHAR(20) DEFAULT '1.0.0',
    created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    config JSONB NOT NULL DEFAULT '{}',
    processing_hints JSONB DEFAULT '{}',
    performance JSONB DEFAULT '{}',
    learning_data JSONB DEFAULT '{}',
    validation_rules JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
);

-- Supplier Profiles Table
CREATE TABLE supplier_profiles (
    supplier VARCHAR(100) PRIMARY KEY,
    created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_history JSONB DEFAULT '{}',
    template_success_rates JSONB DEFAULT '{}',
    preferred_templates JSONB DEFAULT '[]',
    common_patterns JSONB DEFAULT '{}',
    quality_metrics JSONB DEFAULT '{}',
    learning_preferences JSONB DEFAULT '{}'
);

-- System Analytics Table
CREATE TABLE system_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(100),
    filename VARCHAR(255),
    supplier VARCHAR(100),
    processing_time INTEGER,
    status VARCHAR(50),
    products_extracted INTEGER DEFAULT 0,
    confidence DECIMAL(3,2) DEFAULT 0,
    extraction_method VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Processing Jobs Table (for async processing)
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(100) UNIQUE NOT NULL,
    filename VARCHAR(255),
    supplier VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    result JSONB,
    error_message TEXT,
    processing_options JSONB DEFAULT '{}'
);

-- System Snapshots Table
CREATE TABLE system_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    system_stats JSONB NOT NULL,
    version VARCHAR(20)
);

-- Supplier Patterns Table
CREATE TABLE supplier_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier VARCHAR(100) NOT NULL,
    pattern_type VARCHAR(50) NOT NULL,
    patterns JSONB NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_processing_templates_supplier ON processing_templates(supplier);
CREATE INDEX idx_processing_templates_layout_type ON processing_templates(layout_type);
CREATE INDEX idx_system_analytics_supplier ON system_analytics(supplier);
CREATE INDEX idx_system_analytics_created_at ON system_analytics(created_at);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX idx_processing_jobs_created_at ON processing_jobs(created_at);
```

### Step 5: Update Your Server File

Replace your existing server.js or create a new enhanced server:

```javascript
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Import the enhanced system
const AudicoEnhancedSystem = require('./audico-enhanced-system');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize the enhanced system
const audicoSystem = new AudicoEnhancedSystem({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    enableMultiAgent: process.env.ENABLE_MULTI_AGENT === 'true',
    enableFallback: process.env.ENABLE_FALLBACK === 'true',
    enableLearning: process.env.ENABLE_LEARNING === 'true',
    enableOCR: process.env.ENABLE_OCR === 'true',
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS) || 5,
    processingTimeout: parseInt(process.env.PROCESSING_TIMEOUT) || 300000,
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7
});

// Middleware
app.use(cors({
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF and Excel files are allowed.'));
        }
    }
});

// Initialize system on startup
let systemReady = false;

async function initializeSystem() {
    try {
        console.log('🚀 Initializing Audico Enhanced System...');
        await audicoSystem.initialize();
        systemReady = true;
        console.log('✅ System ready for processing');
    } catch (error) {
        console.error('❌ System initialization failed:', error);
        process.exit(1);
    }
}

// Routes

// Root route with system status
app.get('/', async (req, res) => {
    const health = await audicoSystem.healthCheck();
    const stats = audicoSystem.getSystemStats();

    res.json({
        message: '🎵 Audico Enhanced System',
        status: systemReady ? 'ready' : 'initializing',
        version: '2.0.0-enhanced',
        health: health,
        stats: {
            totalProcessed: stats.totalProcessed,
            successRate: stats.totalProcessed > 0 ? 
                (stats.successfulProcessed / stats.totalProcessed * 100).toFixed(1) + '%' : '0%',
            averageProcessingTime: Math.round(stats.averageProcessingTime / 1000) + 's',
            uptime: stats.uptimeHours + 'h'
        },
        capabilities: audicoSystem.getSystemCapabilities(),
        endpoints: {
            upload: '/api/upload',
            health: '/api/health',
            stats: '/api/stats',
            test: '/api/test'
        }
    });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    const health = await audicoSystem.healthCheck();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

// System statistics endpoint
app.get('/api/stats', (req, res) => {
    const stats = audicoSystem.getSystemStats();
    res.json(stats);
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        message: 'Enhanced system connection successful!',
        timestamp: new Date().toISOString(),
        systemReady: systemReady,
        version: '2.0.0-enhanced'
    });
});

// Enhanced upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!systemReady) {
            return res.status(503).json({ 
                error: 'System is still initializing. Please wait a moment and try again.' 
            });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { supplier, priceType, vatRate, marginPercentage, enableAI } = req.body;

        console.log(`📁 Processing file: ${req.file.originalname} for ${supplier}`);

        // Process with enhanced system
        const result = await audicoSystem.processDocument(
            req.file.buffer,
            req.file.originalname,
            supplier,
            {
                priceType,
                vatRate: parseFloat(vatRate) || 15,
                marginPercentage: parseFloat(marginPercentage) || 0,
                enableAI: enableAI === 'true'
            }
        );

        // Save products to database (existing products table)
        if (result.products && result.products.length > 0) {
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

            const productsToInsert = result.products.map(product => ({
                id: uuidv4(),
                name: product.name,
                description: product.description,
                specifications: product.specifications || '',
                supplier: product.supplier,
                category: product.category,
                original_price: product.original_price || product.price,
                final_price: product.final_price || product.price,
                price_type: product.priceType || 'Standard',
                processing_method: result.metadata?.extractionMethod || 'enhanced',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }));

            const { error } = await supabase.from('products').insert(productsToInsert);
            if (error) {
                console.error('Database error:', error);
            }
        }

        res.json({
            success: true,
            message: `Successfully processed ${result.products.length} products using enhanced system`,
            products: result.products.slice(0, 10), // Return first 10 for preview
            totalCount: result.products.length,
            processingMethod: result.metadata?.extractionMethod || 'enhanced',
            confidence: result.metadata?.confidence || 0,
            processingTime: result.processingTime,
            jobId: result.jobId,
            systemVersion: result.systemVersion,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString(),
            systemVersion: '2.0.0-enhanced'
        });
    }
});

// Get products endpoint (unchanged)
app.get('/api/products', async (req, res) => {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        const { data: products, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error.stack);

    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
        }
    }

    res.status(500).json({
        error: 'Something went wrong!',
        message: error.message,
        timestamp: new Date().toISOString()
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down gracefully...');
    await audicoSystem.shutdown();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 Shutting down gracefully...');
    await audicoSystem.shutdown();
    process.exit(0);
});

// Start server
const server = app.listen(PORT, async () => {
    console.log(`🎵 Audico Enhanced Backend Server running on http://localhost:${PORT}`);
    console.log(`📊 Visit http://localhost:${PORT} to check system status`);

    // Initialize system after server starts
    await initializeSystem();
});

module.exports = app;
```

## 🧪 Testing Your Installation

### Step 1: Basic System Test

```bash
# Start the server
npm start

# Test basic connectivity
curl http://localhost:3000/api/test

# Check system health
curl http://localhost:3000/api/health
```

### Step 2: Upload Test

Use your existing test.html file or create a simple test:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Enhanced System Test</title>
</head>
<body>
    <h2>🧪 Test Enhanced Audico System</h2>

    <form action="http://localhost:3000/api/upload" method="post" enctype="multipart/form-data">
        <div>
            <label>File:</label>
            <input type="file" name="file" accept=".pdf,.xlsx,.xls" required>
        </div>

        <div>
            <label>Supplier:</label>
            <select name="supplier">
                <option value="Denon">Denon</option>
                <option value="Mission">Mission</option>
                <option value="TestSupplier">Test Supplier</option>
            </select>
        </div>

        <div>
            <label>Price Type:</label>
            <select name="priceType">
                <option value="cost_including_vat">Cost Including VAT</option>
                <option value="retail_including_vat">Retail Including VAT</option>
            </select>
        </div>

        <div>
            <label>Margin %:</label>
            <input type="number" name="marginPercentage" value="25">
        </div>

        <div>
            <label>VAT %:</label>
            <input type="number" name="vatRate" value="15">
        </div>

        <div>
            <label>
                <input type="checkbox" name="enableAI" value="true" checked>
                Enable AI Processing
            </label>
        </div>

        <button type="submit">🚀 Process with Enhanced System</button>
    </form>

    <div id="status"></div>

    <script>
        // Check system status on page load
        fetch('/api/health')
            .then(response => response.json())
            .then(data => {
                document.getElementById('status').innerHTML = 
                    `<h3>System Status: ${data.status}</h3>
                     <p>Components: ${JSON.stringify(data.components, null, 2)}</p>`;
            });
    </script>
</body>
</html>
```

## 🔧 Configuration Options

### Performance Tuning

For high-volume processing:
```env
MAX_CONCURRENT_JOBS=10
PROCESSING_TIMEOUT=600000
ENABLE_DETAILED_LOGGING=true
```

For low-resource environments:
```env
MAX_CONCURRENT_JOBS=2
CONFIDENCE_THRESHOLD=0.6
ENABLE_OCR=false
```

### Supplier-Specific Configuration

You can configure supplier-specific settings:

```env
# Denon specific settings
SUPPLIER_DENON_CONFIG={"priceColumnPriority":["New RRP","Current Price"],"documentType":"pdf"}

# Nology specific settings  
SUPPLIER_NOLOGY_CONFIG={"multiSheet":true,"skipSheets":["Summary","Index"],"documentType":"excel"}
```

## 📊 Monitoring and Maintenance

### System Health Monitoring

Check system health regularly:
```bash
curl http://localhost:3000/api/health
```

### Performance Statistics

Monitor processing statistics:
```bash
curl http://localhost:3000/api/stats
```

### Log Files

Monitor these log files:
- `logs/system.log` - General system logs
- `logs/processing.log` - Document processing logs
- `logs/errors.log` - Error logs

### Database Maintenance

Regular maintenance tasks:

```sql
-- Clean old analytics data (older than 30 days)
DELETE FROM system_analytics 
WHERE created_at < NOW() - INTERVAL '30 days';

-- Clean old job records (older than 7 days)
DELETE FROM processing_jobs 
WHERE created_at < NOW() - INTERVAL '7 days' 
AND status IN ('completed', 'failed');

-- Update statistics
ANALYZE processing_templates;
ANALYZE supplier_profiles;
ANALYZE system_analytics;
```

## 🚨 Troubleshooting

### Common Issues

#### 1. System Won't Initialize
```bash
# Check environment variables
node -e "console.log(process.env.SUPABASE_URL)"

# Check database connection
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
supabase.from('products').select('count').limit(1).then(console.log);
"
```

#### 2. Processing Fails
- Check file format is supported (PDF, Excel)
- Verify file size is under 50MB
- Check system health endpoint
- Review error logs

#### 3. Low Confidence Scores
- Enable AI processing
- Check if supplier has existing templates
- Verify document quality
- Consider manual template creation

#### 4. Performance Issues
- Reduce MAX_CONCURRENT_JOBS
- Increase server memory
- Check database performance
- Monitor system resources

### Debug Mode

Enable debug mode for detailed logging:
```env
LOG_LEVEL=debug
ENABLE_DETAILED_LOGGING=true
NODE_ENV=development
```

## 🔄 Migration from Existing System

### Backup Current System

```bash
# Backup current server.js
cp server.js server.js.backup

# Backup current package.json
cp package.json package.json.backup

# Export current products
node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
supabase.from('products').select('*').then(({data}) => {
    fs.writeFileSync('products_backup.json', JSON.stringify(data, null, 2));
    console.log('Products backed up to products_backup.json');
});
"
```

### Gradual Migration

1. **Phase 1**: Install enhanced system alongside existing system
2. **Phase 2**: Test with sample files
3. **Phase 3**: Gradually migrate suppliers
4. **Phase 4**: Full migration

### Rollback Plan

If you need to rollback:
```bash
# Stop enhanced server
npm stop

# Restore original files
cp server.js.backup server.js
cp package.json.backup package.json

# Reinstall original dependencies
npm install

# Start original server
node server.js
```

## 📈 Next Steps

After successful installation:

1. **Test with Sample Files**: Process a few sample pricelists
2. **Monitor Performance**: Watch processing times and success rates
3. **Configure Suppliers**: Set up supplier-specific configurations
4. **Enable Learning**: Let the system learn from successful extractions
5. **Scale Resources**: Adjust concurrent job limits based on usage

## 🆘 Support

### Getting Help

1. **Check Logs**: Always check log files first
2. **Health Check**: Run health check endpoint
3. **System Stats**: Review processing statistics
4. **Documentation**: Refer to component documentation

### Performance Optimization

- **Memory**: Increase if processing large files
- **Concurrent Jobs**: Adjust based on server capacity
- **Database**: Optimize queries and indexes
- **Caching**: Enable template caching for better performance

---

## 🎉 Congratulations!

Your Audico Enhanced System is now ready to handle 50+ different pricelist formats with intelligent learning capabilities!

**Key Benefits You Now Have:**
- ✅ Intelligent layout detection
- ✅ Advanced price extraction with New RRP prioritization  
- ✅ Template learning and adaptation
- ✅ Multi-level error recovery
- ✅ Comprehensive analytics and monitoring
- ✅ Backward compatibility with existing frontend
- ✅ Scalable architecture for future growth

**Next Steps:**
1. Process your first enhanced pricelist
2. Monitor the learning system
3. Configure supplier-specific optimizations
4. Scale based on your processing volume

Happy processing! 🎵
