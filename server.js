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
require('dotenv').config();

// Import multi-agent system components
const AgentOrchestrator = require('./agents/orchestrator');
const JobManager = require('./middleware/job-manager');
const AgentHealthMonitor = require('./middleware/health-monitor');
const DatabaseManager = require('./utils/database-manager');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize multi-agent system
const agentOrchestrator = new AgentOrchestrator({
    openaiApiKey: process.env.OPENAI_API_KEY,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
    enableFallback: true // Enable fallback to legacy processing
});

const jobManager = new JobManager();
const healthMonitor = new AgentHealthMonitor();
const dbManager = new DatabaseManager();

// Middleware
app.use(cors({
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Multer configuration for file uploads
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
            'application/vnd.ms-excel'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF and Excel files are allowed.'));
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

// Legacy processing functions (preserved for fallback)
async function legacyProcessFile(fileBuffer, filename, supplier, options) {
    console.log('🔄 Using legacy processing for:', filename);

    try {
        let products = [];

        if (filename.toLowerCase().endsWith('.pdf')) {
            const pdfData = await pdfParse(fileBuffer);
            products = await parsePDFProducts(pdfData.text, supplier);
        } else if (filename.toLowerCase().endsWith('.xlsx') || filename.toLowerCase().endsWith('.xls')) {
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            products = await parseExcelProducts(workbook, supplier);
        }

        // Apply pricing logic
        products = applyPricingLogic(products, options);

        // Categorize with AI if enabled
        if (options.enableAI) {
            products = await categorizeProductsLegacy(products);
        }

        return {
            success: true,
            products: products,
            processingMethod: 'legacy',
            extractedCount: products.length
        };
    } catch (error) {
        console.error('Legacy processing error:', error);
        throw error;
    }
}

// Legacy PDF parsing function
async function parsePDFProducts(text, supplier) {
    const products = [];
    const lines = text.split('\n').filter(line => line.trim().length > 0);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Enhanced price detection - prioritize "New RRP"
        const newRRPMatch = line.match(/New\s+RRP[:\s]*R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i);
        const oldRRPMatch = line.match(/Old\s+RRP[:\s]*R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i);
        const generalPriceMatch = line.match(/R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);

        let priceMatch = newRRPMatch || oldRRPMatch || generalPriceMatch;

        if (priceMatch) {
            const productName = line.substring(0, line.indexOf(priceMatch[0])).trim();
            if (productName.length > 5) {
                const price = parseFloat(priceMatch[1].replace(/,/g, ''));

                products.push({
                    name: productName,
                    price: price,
                    supplier: supplier,
                    description: productName,
                    specifications: '',
                    category: 'uncategorized',
                    priceType: newRRPMatch ? 'New RRP' : (oldRRPMatch ? 'Old RRP' : 'Standard')
                });
            }
        }
    }

    return products;
}

// Legacy Excel parsing function
async function parseExcelProducts(workbook, supplier) {
    const products = [];

    for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (data.length < 2) continue;

        // Find header row
        let headerRow = 0;
        for (let i = 0; i < Math.min(5, data.length); i++) {
            const row = data[i];
            if (row.some(cell => 
                typeof cell === 'string' && 
                (cell.toLowerCase().includes('product') || 
                 cell.toLowerCase().includes('name') || 
                 cell.toLowerCase().includes('description'))
            )) {
                headerRow = i;
                break;
            }
        }

        const headers = data[headerRow] || [];

        // Find column indices with priority for "New RRP"
        const nameCol = headers.findIndex(h => 
            typeof h === 'string' && 
            (h.toLowerCase().includes('product') || 
             h.toLowerCase().includes('name') || 
             h.toLowerCase().includes('description'))
        );

        const newRRPCol = headers.findIndex(h => 
            typeof h === 'string' && h.toLowerCase().includes('new') && h.toLowerCase().includes('rrp')
        );

        const oldRRPCol = headers.findIndex(h => 
            typeof h === 'string' && h.toLowerCase().includes('old') && h.toLowerCase().includes('rrp')
        );

        const priceCol = headers.findIndex(h => 
            typeof h === 'string' && 
            (h.toLowerCase().includes('price') || h.toLowerCase().includes('rrp'))
        );

        // Prioritize New RRP over Old RRP over general price
        const selectedPriceCol = newRRPCol >= 0 ? newRRPCol : (oldRRPCol >= 0 ? oldRRPCol : priceCol);

        // Parse data rows
        for (let i = headerRow + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            const name = nameCol >= 0 ? row[nameCol] : row[0];
            const price = selectedPriceCol >= 0 ? row[selectedPriceCol] : row[1];

            if (name && price && typeof name === 'string' && name.length > 2) {
                const numericPrice = typeof price === 'number' ? price : parseFloat(String(price).replace(/[^0-9.]/g, ''));

                if (!isNaN(numericPrice) && numericPrice > 0) {
                    products.push({
                        name: name.trim(),
                        price: numericPrice,
                        supplier: supplier,
                        description: name.trim(),
                        specifications: '',
                        category: 'uncategorized',
                        priceType: newRRPCol >= 0 ? 'New RRP' : (oldRRPCol >= 0 ? 'Old RRP' : 'Standard'),
                        sheet: sheetName
                    });
                }
            }
        }
    }

    return products;
}

// Legacy pricing logic
function applyPricingLogic(products, options) {
    return products.map(product => {
        let finalPrice = product.price;

        switch (options.priceType) {
            case 'retail_including_vat':
                break;
            case 'cost_including_vat':
                finalPrice = finalPrice * (1 + (options.marginPercentage || 0) / 100);
                break;
            case 'cost_excluding_vat':
                finalPrice = finalPrice * (1 + (options.vatRate || 15) / 100);
                finalPrice = finalPrice * (1 + (options.marginPercentage || 0) / 100);
                break;
        }

        return {
            ...product,
            original_price: product.price,
            final_price: Math.round(finalPrice * 100) / 100
        };
    });
}

// Legacy AI categorization
async function categorizeProductsLegacy(products) {
    const categorizedProducts = [];

    for (const product of products) {
        try {
            const prompt = `
                Analyze this audio product and categorize it into one of these categories:
                - home: Residential audio, hi-fi, stereo systems, home theater
                - business: Office, commercial, conference room audio
                - restaurant: Restaurant, bar, cafe, hospitality audio
                - gym: Fitness, sports, workout facility audio
                - worship: Church, religious venue audio systems
                - education: School, classroom, university audio
                - club: Entertainment venues, nightclub, event audio

                Product: ${product.name}
                Description: ${product.description}

                Respond with only the category name (lowercase).
            `;

            const response = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 50,
                temperature: 0.1
            });

            const category = response.choices[0].message.content.trim().toLowerCase();
            const validCategories = ['home', 'business', 'restaurant', 'gym', 'worship', 'education', 'club'];
            product.category = validCategories.includes(category) ? category : 'home';

            categorizedProducts.push(product);

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
            console.error(`Error categorizing product ${product.name}:`, error);
            product.category = 'home';
            categorizedProducts.push(product);
        }
    }

    return categorizedProducts;
}

// Root route
app.get('/', (req, res) => {
    res.json({ 
        message: '🎵 Audico Enhanced Backend Server is running!',
        status: 'online',
        timestamp: new Date().toISOString(),
        version: '2.0.0-multi-agent',
        agents: {
            orchestrator: agentOrchestrator.isHealthy(),
            jobManager: jobManager.isHealthy(),
            healthMonitor: healthMonitor.getStatus()
        },
        endpoints: {
            upload: '/api/upload',
            uploadAsync: '/api/upload-async',
            jobs: '/api/jobs',
            test: '/api/test',
            products: '/api/products',
            agents: '/api/agents/status'
        }
    });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'Backend connection successful!',
        timestamp: new Date().toISOString(),
        database: 'Connected to Supabase',
        ai: 'OpenAI API configured',
        agents: {
            status: 'Multi-agent system ready',
            orchestrator: agentOrchestrator.isHealthy(),
            fallback: 'Legacy processing available'
        }
    });
});

// Agent status endpoint
app.get('/api/agents/status', async (req, res) => {
    try {
        const status = await healthMonitor.getDetailedStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get products endpoint (unchanged)
app.get('/api/products', async (req, res) => {
    try {
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

// Enhanced synchronous upload endpoint (maintains backward compatibility)
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { supplier, priceType, vatRate, marginPercentage, enableAI, useAgents = 'true' } = req.body;

        console.log('📁 Processing file:', req.file.originalname);
        console.log('🤖 Use agents:', useAgents);

        let result;

        // Try multi-agent processing first (if enabled)
        if (useAgents === 'true' && agentOrchestrator.isHealthy()) {
            try {
                console.log('🚀 Using multi-agent processing...');

                result = await agentOrchestrator.processFile({
                    fileBuffer: req.file.buffer,
                    filename: req.file.originalname,
                    supplier: supplier,
                    options: {
                        priceType,
                        vatRate: parseFloat(vatRate) || 15,
                        marginPercentage: parseFloat(marginPercentage) || 0,
                        enableAI: enableAI === 'true'
                    }
                });

                result.processingMethod = 'multi-agent';

            } catch (agentError) {
                console.warn('⚠️ Multi-agent processing failed, falling back to legacy:', agentError.message);

                // Fallback to legacy processing
                result = await legacyProcessFile(req.file.buffer, req.file.originalname, supplier, {
                    priceType,
                    vatRate: parseFloat(vatRate) || 15,
                    marginPercentage: parseFloat(marginPercentage) || 0,
                    enableAI: enableAI === 'true'
                });
            }
        } else {
            // Use legacy processing directly
            result = await legacyProcessFile(req.file.buffer, req.file.originalname, supplier, {
                priceType,
                vatRate: parseFloat(vatRate) || 15,
                marginPercentage: parseFloat(marginPercentage) || 0,
                enableAI: enableAI === 'true'
            });
        }

        // Save products to database
        if (result.products && result.products.length > 0) {
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
                processing_method: result.processingMethod,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }));

            const { data: insertedProducts, error } = await supabase
                .from('products')
                .insert(productsToInsert);

            if (error) {
                console.error('Database error:', error);
                return res.status(500).json({ error: 'Database error: ' + error.message });
            }
        }

        res.json({
            success: true,
            message: `Successfully processed ${result.products.length} products using ${result.processingMethod} processing`,
            products: result.products.slice(0, 10), // Return first 10 for preview
            totalCount: result.products.length,
            processingMethod: result.processingMethod,
            extractionQuality: result.qualityScore || 'N/A',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            error: error.message,
            processingMethod: 'failed',
            timestamp: new Date().toISOString()
        });
    }
});

// New asynchronous upload endpoint
app.post('/api/upload-async', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { supplier, priceType, vatRate, marginPercentage, enableAI } = req.body;

        // Create a job for asynchronous processing
        const jobId = await jobManager.createJob({
            type: 'file_processing',
            fileBuffer: req.file.buffer,
            filename: req.file.originalname,
            supplier: supplier,
            options: {
                priceType,
                vatRate: parseFloat(vatRate) || 15,
                marginPercentage: parseFloat(marginPercentage) || 0,
                enableAI: enableAI === 'true'
            }
        });

        // Start processing asynchronously
        agentOrchestrator.processFileAsync(jobId)
            .then(result => {
                jobManager.completeJob(jobId, result);
            })
            .catch(error => {
                jobManager.failJob(jobId, error);
            });

        res.json({
            success: true,
            jobId: jobId,
            message: 'File processing started. Use /api/jobs/{jobId} to check status.',
            estimatedTime: '2-5 minutes'
        });

    } catch (error) {
        console.error('Async upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Job status endpoint
app.get('/api/jobs/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await jobManager.getJob(jobId);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json(job);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all jobs endpoint
app.get('/api/jobs', async (req, res) => {
    try {
        const jobs = await jobManager.getAllJobs();
        res.json(jobs);
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

    // Stop accepting new requests
    server.close(() => {
        console.log('✅ HTTP server closed');
    });

    // Cleanup agents
    await agentOrchestrator.shutdown();
    await jobManager.shutdown();
    await healthMonitor.shutdown();

    process.exit(0);
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`🎵 Audico Enhanced Backend Server running on http://localhost:${PORT}`);
    console.log(`📊 Visit http://localhost:${PORT} to test`);
    console.log(`🤖 Multi-agent system: ${agentOrchestrator.isHealthy() ? 'Ready' : 'Initializing'}`);
    console.log(`📁 Environment variables loaded successfully`);
});

module.exports = app;
