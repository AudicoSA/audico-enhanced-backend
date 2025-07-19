# 🚀 Audico Enhanced Backend Migration Guide

## Overview

This guide will help you migrate from your existing Audico quoting system to the enhanced multi-agent architecture while maintaining full backward compatibility.

## 📋 Pre-Migration Checklist

### Current System Requirements
- [ ] Node.js backend running (server.js)
- [ ] Supabase database with existing products table
- [ ] OpenAI API key configured
- [ ] Frontend connecting to existing endpoints

### Backup Requirements
- [ ] Export current products table: `SELECT * FROM products`
- [ ] Backup current server.js file
- [ ] Note current environment variables
- [ ] Test current system functionality

## 🔄 Migration Process

### Phase 1: Setup Enhanced Backend (30 minutes)

#### Step 1: Download Enhanced System
```bash
# Your enhanced system is ready at:
# /home/user/output/audico-enhanced-backend/

# Copy to your project directory
cp -r /home/user/output/audico-enhanced-backend/* /path/to/your/audico-backend/
```

#### Step 2: Install Dependencies
```bash
cd /path/to/your/audico-backend/
npm install
```

#### Step 3: Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your existing values
nano .env
```

Required environment variables:
```env
# Existing variables (keep your current values)
SUPABASE_URL=https://ajdehycoypilsegmxbto.supabase.co
SUPABASE_KEY=your_existing_supabase_key
OPENAI_API_KEY=your_existing_openai_key

# New optional variables (for enhanced features)
ENABLE_MULTI_AGENT=true
ENABLE_FALLBACK=true
LOG_LEVEL=info
MAX_CONCURRENT_JOBS=5
ENABLE_OCR=false
GOOGLE_CLOUD_PROJECT_ID=
AZURE_FORM_RECOGNIZER_ENDPOINT=
AZURE_FORM_RECOGNIZER_KEY=
```

#### Step 4: Database Migration
```bash
# Run database migrations to add new tables
npm run migrate
```

This creates:
- `processing_jobs` - Track file processing jobs
- `agent_logs` - Agent activity logging
- `supplier_configs` - Supplier-specific configurations

### Phase 2: Testing Migration (15 minutes)

#### Step 1: Start Enhanced Server
```bash
npm start
```

#### Step 2: Test Existing Endpoints
```bash
# Test health check
curl http://localhost:3000/

# Test existing products endpoint
curl http://localhost:3000/api/products

# Test existing upload (should work with fallback)
curl -X POST -F "file=@test.pdf" -F "supplier=TestSupplier" http://localhost:3000/api/upload
```

#### Step 3: Test New Features
```bash
# Test agent status
curl http://localhost:3000/api/agents/status

# Test async upload
curl -X POST -F "file=@test.pdf" -F "supplier=TestSupplier" http://localhost:3000/api/upload-async
```

### Phase 3: Frontend Integration (10 minutes)

Your existing frontend will continue to work without changes. The enhanced backend maintains full compatibility with existing endpoints.

#### Optional: Add New Features to Frontend

Add agent status monitoring:
```javascript
// Check agent health
fetch('/api/agents/status')
  .then(response => response.json())
  .then(data => {
    console.log('Agent Status:', data);
    // Update UI with agent health indicators
  });
```

Add async upload support:
```javascript
// Start async processing
fetch('/api/upload-async', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => {
  const jobId = data.jobId;

  // Poll for job completion
  const checkStatus = () => {
    fetch(`/api/jobs/${jobId}`)
      .then(response => response.json())
      .then(job => {
        if (job.status === 'completed') {
          console.log('Processing complete:', job.result);
        } else if (job.status === 'failed') {
          console.error('Processing failed:', job.error);
        } else {
          setTimeout(checkStatus, 2000); // Check again in 2 seconds
        }
      });
  };

  checkStatus();
});
```

## 🔧 Configuration Options

### Multi-Agent System Settings

#### Enable/Disable Multi-Agent Processing
```env
ENABLE_MULTI_AGENT=true  # Use new multi-agent system
ENABLE_FALLBACK=true     # Fallback to legacy processing if agents fail
```

#### Agent-Specific Configuration
```env
# Document Agent
ENABLE_OCR=false                    # Enable advanced OCR
GOOGLE_CLOUD_PROJECT_ID=            # For Google Document AI
AZURE_FORM_RECOGNIZER_ENDPOINT=     # For Azure Form Recognizer

# Price Agent
PRICE_CONFIDENCE_THRESHOLD=0.8      # Minimum confidence for price extraction
AI_CATEGORIZATION_MODEL=gpt-3.5-turbo

# Validation Agent
VALIDATION_MODE=standard            # standard or strict
AUTO_CORRECTION=true                # Enable automatic corrections

# Job Manager
MAX_CONCURRENT_JOBS=5               # Maximum simultaneous processing jobs
JOB_TIMEOUT=300000                  # Job timeout in milliseconds (5 minutes)
```

### Supplier-Specific Configuration

The system automatically creates configurations for your existing suppliers:
- Denon
- Mission  
- Nology
- Proaudio
- Polk
- Marantz

#### Custom Supplier Configuration
```javascript
// Add custom supplier configuration via API
const supplierConfig = {
  supplier_name: "NewSupplier",
  config_data: {
    priceColumnPriority: ["New Price", "Current Price", "RRP"],
    documentType: "pdf",
    skipSections: ["Terms", "Conditions"],
    multiSheet: false
  }
};

fetch('/api/supplier-config', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(supplierConfig)
});
```

## 📊 Monitoring and Analytics

### Agent Health Monitoring
```bash
# Check overall system health
curl http://localhost:3000/api/agents/status

# Get detailed agent metrics
curl http://localhost:3000/api/agents/detailed-status
```

### Processing Statistics
```bash
# Get processing statistics
curl http://localhost:3000/api/stats

# Get job history
curl http://localhost:3000/api/jobs
```

### Log Files
Monitor these log files for system health:
- `logs/orchestrator.log` - Main orchestrator activity
- `logs/job-manager.log` - Job processing logs
- `logs/health-monitor.log` - System health monitoring
- `logs/database-manager.log` - Database operations

## 🚨 Troubleshooting

### Common Issues

#### 1. Multi-Agent System Not Starting
**Symptoms:** Server starts but agents show as unhealthy
**Solution:**
```bash
# Check environment variables
npm run health-check

# Check agent status
npm run agents:status

# Enable fallback mode
echo "ENABLE_FALLBACK=true" >> .env
```

#### 2. Database Migration Fails
**Symptoms:** Migration script errors
**Solution:**
```bash
# Check database connection
npm run test

# Manual migration
node migrations/run-migrations.js --force

# Rollback if needed
npm run migrate:rollback
```

#### 3. File Processing Fails
**Symptoms:** Upload returns errors
**Solution:**
```bash
# Check logs
tail -f logs/orchestrator.log

# Test with legacy processing
curl -X POST -F "file=@test.pdf" -F "supplier=Test" -F "useAgents=false" http://localhost:3000/api/upload

# Check agent health
curl http://localhost:3000/api/agents/status
```

#### 4. High Memory Usage
**Symptoms:** Server becomes slow or crashes
**Solution:**
```bash
# Reduce concurrent jobs
echo "MAX_CONCURRENT_JOBS=2" >> .env

# Enable cleanup
echo "ENABLE_CLEANUP=true" >> .env

# Monitor memory
npm run health-check
```

### Performance Optimization

#### For High Volume Processing
```env
# Increase concurrent jobs (if you have sufficient resources)
MAX_CONCURRENT_JOBS=10

# Enable Redis for job queue (optional)
REDIS_URL=redis://localhost:6379

# Enable database connection pooling
DB_POOL_SIZE=20
```

#### For Low Resource Environments
```env
# Reduce concurrent jobs
MAX_CONCURRENT_JOBS=2

# Disable OCR
ENABLE_OCR=false

# Use legacy processing as primary
ENABLE_MULTI_AGENT=false
```

## 🔄 Rollback Plan

If you need to rollback to your original system:

### Step 1: Stop Enhanced Server
```bash
# Stop the enhanced server
npm stop
```

### Step 2: Restore Original Files
```bash
# Restore original server.js
cp server.js.backup server.js

# Restore original package.json
cp package.json.backup package.json

# Reinstall original dependencies
npm install
```

### Step 3: Start Original Server
```bash
# Start original server
node server.js
```

### Step 4: Verify Functionality
```bash
# Test original endpoints
curl http://localhost:3000/api/test
curl http://localhost:3000/api/products
```

## 📈 Benefits After Migration

### Immediate Benefits
- ✅ **Backward Compatibility:** All existing functionality preserved
- ✅ **Enhanced Reliability:** Fallback mechanisms prevent failures
- ✅ **Better Monitoring:** Real-time agent health and processing stats
- ✅ **Improved Logging:** Comprehensive logging for troubleshooting

### Progressive Benefits (as you enable features)
- 🚀 **Better Price Detection:** Intelligent "New RRP" vs "Old RRP" selection
- 🚀 **Multi-Sheet Excel:** Reliable processing of complex Excel files
- 🚀 **Async Processing:** Handle large files without blocking
- 🚀 **Quality Assurance:** Automated validation and error correction
- 🚀 **Continuous Learning:** System improves over time

### Advanced Benefits (with full configuration)
- 🎯 **OCR Integration:** Process scanned PDFs with Google/Azure OCR
- 🎯 **Supplier Optimization:** Automatic configuration tuning per supplier
- 🎯 **Predictive Analytics:** Processing time and success rate predictions
- 🎯 **Auto-scaling:** Dynamic resource allocation based on load

## 🆘 Support

### Getting Help
1. **Check Logs:** Always check log files first
2. **Health Check:** Run `npm run health-check`
3. **Agent Status:** Check `npm run agents:status`
4. **Fallback Mode:** Enable fallback if agents fail
5. **Documentation:** Refer to individual agent documentation

### Contact Information
- **System Issues:** Check logs and agent status
- **Configuration Help:** Review environment variables
- **Performance Issues:** Monitor resource usage
- **Feature Requests:** Document in system logs

## 📚 Next Steps

After successful migration:

1. **Monitor Performance:** Watch processing times and success rates
2. **Optimize Configuration:** Tune supplier-specific settings
3. **Enable Advanced Features:** Gradually enable OCR and learning features
4. **Scale Resources:** Adjust concurrent job limits based on usage
5. **Regular Maintenance:** Run cleanup scripts and monitor logs

---

**Migration Complete!** 🎉

Your Audico system is now enhanced with multi-agent processing while maintaining full backward compatibility.
