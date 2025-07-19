const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
require('dotenv').config();

// Import enhanced system processors
const EnhancedDocumentProcessor = require('./processors/enhanced-document-processor');
const LayoutDetector = require('./processors/layout-detector');
const PriceExtractionEngine = require('./processors/price-extraction-engine');
const TemplateManager = require('./processors/template-manager');
const AudicoEnhancedSystem = require('./audico-enhanced-system');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Winston logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'audico-enhanced-backend' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ],
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Initialize Enhanced System
const enhancedSystem = new AudicoEnhancedSystem({
    openaiApiKey: process.env.OPENAI_API_KEY,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
    enableFallback: true,
    logger: logger
});

// Initialize individual processors for legacy compatibility
const documentProcessor = new EnhancedDocumentProcessor({
    logger: logger,
    enableOCR: process.env.ENABLE_OCR === 'true'
});

const layoutDetector = new LayoutDetector({
    logger: logger,
    confidenceThreshold: parseFloat(process.env.LAYOUT_CONFIDENCE_THRESHOLD) || 0.7
});

const priceExtractor = new PriceExtractionEngine({
    logger: logger,
    openaiApiKey: process.env.OPENAI_API_KEY,
    confidenceThreshold: parseFloat(process.env.PRICE_CONFIDENCE_THRESHOLD) || 0.8
});

const templateManager = new TemplateManager({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
    logger: logger
});

// Middleware
app.use(cors({
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000', 'https://tusxfkkg.gensparkspace.com'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Enhanced Multer configuration
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}. Only PDF, Excel, and CSV files are allowed.`));
        }
    }
});

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// Initialize OpenAI client (for fallback)
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Health check and system status
app.get('/', async (req, res) => {
    try {
        const systemHealth = await enhancedSystem.getSystemHealth();
        res.json({ 
            message: '🎵 Audico Enhanced Backend Server is running!',
            status: 'online',
            timestamp: new Date().toISOString(),
            version: '2.0.0-enhanced',
            system: {
                health: systemHealth,
                processors: {
                    documentProcessor: documentProcessor.isHealthy(),
                    layoutDetector: layoutDetector.isHealthy(),
                    priceExtractor: priceExtractor.isHealthy(),
                    templateManager: templateManager.isHealthy()
                }
            },
            endpoints: {
                upload: '/api/upload',
                uploadAsync: '/api/upload-async',
                jobs: '/api/jobs',
                test: '/api/test',
                products: '/api/products',
                system: '/api/system/status',
                templates: '/api/templates',
                suppliers: '/api/suppliers'
            }
        });
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(500).json({
            message: 'System health check failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Enhanced test endpoint
app.get('/api/test', async (req, res) => {
    try {
        // Test database connection
        const { data: testQuery, error: dbError } = await supabase
            .from('products')
            .select('id')
            .limit(1);

        // Test OpenAI connection
        let aiStatus = 'connected';
        try {
            await openai.models.list();
        } catch (aiError) {
            aiStatus = 'error';
            logger.warn('OpenAI connection test failed:', aiError.message);
        }

        res.json({ 
            message: 'Enhanced backend connection successful!',
            timestamp: new Date().toISOString(),
            tests: {
                database: dbError ? 'error' : 'connected',
                ai: aiStatus,
                enhancedSystem: enhancedSystem.isHealthy() ? 'ready' : 'initializing',
                processors: {
                    document: documentProcessor.isHealthy(),
                    layout: layoutDetector.isHealthy(),
                    price: priceExtractor.isHealthy(),
                    template: templateManager.isHealthy()
                }
            },
            configuration: {
                enableMultiAgent: process.env.ENABLE_MULTI_AGENT === 'true',
                enableFallback: process.env.ENABLE_FALLBACK === 'true',
                maxConcurrentJobs: process.env.MAX_CONCURRENT_JOBS || 5,
                logLevel: process.env.LOG_LEVEL || 'info'
            }
        });
    } catch (error) {
        logger.error('Test endpoint failed:', error);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Enhanced system status endpoint
app.get('/api/system/status', async (req, res) => {
    try {
        const status = await enhancedSystem.getDetailedStatus();
        res.json(status);
    } catch (error) {
        logger.error('System status check failed:', error);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get products endpoint (enhanced)
app.get('/api/products', async (req, res) => {
    try {
        const { supplier, category, limit = 100, offset = 0 } = req.query;
        
        let query = supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });

        if (supplier) {
            query = query.eq('supplier', supplier);
        }
        
        if (category) {
            query = query.eq('category', category);
        }

        const { data: products, error, count } = await query
            .range(offset, offset + parseInt(limit) - 1);

        if (error) {
            throw error;
        }

        res.json({
            products: products || [],
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: count
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Products fetch error:', error);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Enhanced synchronous upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    const startTime = Date.now();
    let processingMethod = 'unknown';
    
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { supplier, priceType, vatRate, marginPercentage, enableAI, useEnhanced = 'true' } = req.body;
        
        logger.info(`Processing file: ${req.file.originalname}, supplier: ${supplier}, size: ${req.file.size} bytes`);

        let result;
        
        // Use enhanced system if enabled and healthy
        if (useEnhanced === 'true' && enhancedSystem.isHealthy()) {
            try {
                logger.info('Using enhanced processing system...');
                
                result = await enhancedSystem.processFile({
                    fileBuffer: req.file.buffer,
                    filename: req.file.originalname,
                    supplier: supplier,
                    options: {
                        priceType: priceType || 'cost_including_vat',
                        vatRate: parseFloat(vatRate) || 15,
                        marginPercentage: parseFloat(marginPercentage) || 0,
                        enableAI: enableAI === 'true'
                    }
                });

                processingMethod = 'enhanced';
                
            } catch (enhancedError) {
                logger.warn('Enhanced processing failed, falling back to legacy:', enhancedError.message);
                
                // Fallback to individual processors
                result = await fallbackProcessing(req.file, supplier, {
                    priceType,
                    vatRate: parseFloat(vatRate) || 15,
                    marginPercentage: parseFloat(marginPercentage) || 0,
                    enableAI: enableAI === 'true'
                });
                
                processingMethod = 'fallback';
            }
        } else {
            // Use individual processors directly
            logger.info('Using individual processors...');
            result = await fallbackProcessing(req.file, supplier, {
                priceType,
                vatRate: parseFloat(vatRate) || 15,
                marginPercentage: parseFloat(marginPercentage) || 0,
                enableAI: enableAI === 'true'
            });
            
            processingMethod = 'individual';
        }

        // Save products to database if processing was successful
        if (result.products && result.products.length > 0) {
            const productsToInsert = result.products.map(product => ({
                id: uuidv4(),
                name: product.name || 'Unknown Product',
                description: product.description || product.name || '',
                specifications: product.specifications || '',
                supplier: product.supplier || supplier,
                category: product.category || 'uncategorized',
                original_price: product.original_price || product.price || 0,
                final_price: product.final_price || product.price || 0,
                price_type: product.priceType || 'Standard',
                confidence_score: product.confidence || 0,
                processing_method: processingMethod,
                layout_type: result.layoutType || 'unknown',
                extraction_quality: result.qualityScore || 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }));

            const { data: insertedProducts, error: insertError } = await supabase
                .from('products')
                .insert(productsToInsert);

            if (insertError) {
                logger.error('Database insertion error:', insertError);
                // Continue processing but log the error
            }
        }

        const processingTime = Date.now() - startTime;
        
        logger.info(`File processing completed in ${processingTime}ms using ${processingMethod} method`);

        res.json({
            success: true,
            message: `Successfully processed ${result.products.length} products using ${processingMethod} processing`,
            products: result.products.slice(0, 10), // Return first 10 for preview
            totalCount: result.products.length,
            processingMethod: processingMethod,
            layoutType: result.layoutType,
            extractionQuality: result.qualityScore || 'N/A',
            confidenceScore: result.averageConfidence || 'N/A',
            processingTimeMs: processingTime,
            timestamp: new Date().toISOString(),
            statistics: {
                totalProducts: result.products.length,
                validProducts: result.products.filter(p => p.price > 0).length,
                averagePrice: result.products.length > 0 
                    ? result.products.reduce((sum, p) => sum + (p.final_price || p.price || 0), 0) / result.products.length 
                    : 0
            }
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error('Upload processing error:', error);
        
        res.status(500).json({ 
            error: error.message,
            processingMethod: processingMethod,
            processingTimeMs: processingTime,
            timestamp: new Date().toISOString(),
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Fallback processing function using individual processors
async function fallbackProcessing(file, supplier, options) {
    try {
        // Step 1: Detect layout
        const layoutInfo = await layoutDetector.detectLayout(file.buffer, file.originalname);
        
        // Step 2: Process document
        const documentResult = await documentProcessor.processDocument(
            file.buffer, 
            file.originalname, 
            layoutInfo
        );
        
        // Step 3: Extract prices
        const extractionResult = await priceExtractor.extractPrices(
            documentResult.extractedText,
            documentResult.structuredData,
            {
                supplier: supplier,
                layoutType: layoutInfo.type,
                ...options
            }
        );
        
        // Step 4: Learn from successful extraction
        if (extractionResult.products.length > 0) {
            await templateManager.learnFromExtraction(supplier, layoutInfo, extractionResult);
        }
        
        return {
            products: extractionResult.products,
            layoutType: layoutInfo.type,
            qualityScore: extractionResult.confidence,
            averageConfidence: extractionResult.averageConfidence,
            processingMethod: 'fallback'
        };
        
    } catch (error) {
        logger.error('Fallback processing failed:', error);
        throw error;
    }
}

// Asynchronous upload endpoint
app.post('/api/upload-async', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { supplier, priceType, vatRate, marginPercentage, enableAI } = req.body;
        const jobId = uuidv4();
        
        logger.info(`Starting async processing for job: ${jobId}, file: ${req.file.originalname}`);

        // Start processing asynchronously using enhanced system
        enhancedSystem.processFileAsync(jobId, {
            fileBuffer: req.file.buffer,
            filename: req.file.originalname,
            supplier: supplier,
            options: {
                priceType: priceType || 'cost_including_vat',
                vatRate: parseFloat(vatRate) || 15,
                marginPercentage: parseFloat(marginPercentage) || 0,
                enableAI: enableAI === 'true'
            }
        }).catch(error => {
            logger.error(`Async processing failed for job ${jobId}:`, error);
        });

        res.json({
            success: true,
            jobId: jobId,
            message: 'File processing started. Use /api/jobs/{jobId} to check status.',
            estimatedTime: '2-5 minutes',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Async upload error:', error);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Job status endpoint
app.get('/api/jobs/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await enhancedSystem.getJobStatus(jobId);

        if (!job) {
            return res.status(404).json({ 
                error: 'Job not found',
                jobId: jobId,
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            ...job,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Job status error:', error);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get all jobs endpoint
app.get('/api/jobs', async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;
        const jobs = await enhancedSystem.getJobs({ status, limit: parseInt(limit) });
        
        res.json({
            jobs: jobs,
            count: jobs.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Jobs list error:', error);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Template management endpoints
app.get('/api/templates', async (req, res) => {
    try {
        const { supplier } = req.query;
        const templates = await templateManager.getTemplates(supplier);
        
        res.json({
            templates: templates,
            count: templates.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Templates fetch error:', error);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.post('/api/templates', async (req, res) => {
    try {
        const template = await templateManager.createTemplate(req.body);
        
        res.json({
            success: true,
            template: template,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Template creation error:', error);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Supplier management endpoints
app.get('/api/suppliers', async (req, res) => {
    try {
        const { data: suppliers, error } = await supabase
            .from('products')
            .select('supplier')
            .not('supplier', 'is', null);

        if (error) throw error;

        // Get unique suppliers with product counts
        const supplierCounts = {};
        suppliers.forEach(item => {
            if (item.supplier) {
                supplierCounts[item.supplier] = (supplierCounts[item.supplier] || 0) + 1;
            }
        });

        const supplierList = Object.keys(supplierCounts).map(supplier => ({
            name: supplier,
            productCount: supplierCounts[supplier]
        })).sort((a, b) => b.productCount - a.productCount);

        res.json({
            suppliers: supplierList,
            totalSuppliers: supplierList.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Suppliers fetch error:', error);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// System statistics endpoint
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await enhancedSystem.getSystemStatistics();
        res.json({
            ...stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Statistics fetch error:', error);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Server error:', {
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
    });

    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                error: 'File too large. Maximum size is 50MB.',
                code: 'FILE_TOO_LARGE',
                timestamp: new Date().toISOString()
            });
        }
        
        return res.status(400).json({ 
            error: `File upload error: ${error.message}`,
            code: error.code,
            timestamp: new Date().toISOString()
        });
    }

    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong!',
        timestamp: new Date().toISOString()
    });
});

// Handle 404 routes
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString(),
        availableEndpoints: [
            'GET /',
            'GET /api/test',
            'GET /api/products',
            'POST /api/upload',
            'POST /api/upload-async',
            'GET /api/jobs',
            'GET /api/system/status',
            'GET /api/templates',
            'GET /api/suppliers',
            'GET /api/stats'
        ]
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    
    try {
        await enhancedSystem.shutdown();
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    
    try {
        await enhancedSystem.shutdown();
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Start server
const server = app.listen(PORT, () => {
    logger.info(`🎵 Audico Enhanced Backend Server running on http://localhost:${PORT}`);
    logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🤖 Enhanced system: ${enhancedSystem.isHealthy() ? 'Ready' : 'Initializing'}`);
    logger.info(`📁 Log level: ${process.env.LOG_LEVEL || 'info'}`);
    logger.info(`🔄 Max concurrent jobs: ${process.env.MAX_CONCURRENT_JOBS || 5}`);
    
    console.log(`
    ╔══════════════════════════════════════════════════════════════╗
    ║                🎵 AUDICO ENHANCED BACKEND                    ║
    ║                                                              ║
    ║  🌐 Server: http://localhost:${PORT}                            ║
    ║  📊 Status: http://localhost:${PORT}/api/test                   ║
    ║  📁 Upload: http://localhost:${PORT}/api/upload                 ║
    ║  🔍 Products: http://localhost:${PORT}/api/products             ║
    ║                                                              ║
    ║  🚀 Enhanced processors ready for 50+ pricelist formats     ║
    ╚══════════════════════════════════════════════════════════════╝
    `);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

module.exports = app;