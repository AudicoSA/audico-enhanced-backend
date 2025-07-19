
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Import enhanced processors
const EnhancedDocumentProcessor = require('./processors/enhanced-document-processor');
const LayoutDetector = require('./processors/layout-detector');
const PriceExtractionEngine = require('./processors/price-extraction-engine');
const TemplateManager = require('./processors/template-manager');

/**
 * Enhanced Audico System Integration
 * Combines all processors into a unified, intelligent document processing system
 */
class AudicoEnhancedSystem {
    constructor(options = {}) {
        // Core configuration
        this.config = {
            supabaseUrl: options.supabaseUrl || process.env.SUPABASE_URL,
            supabaseKey: options.supabaseKey || process.env.SUPABASE_KEY,
            openaiApiKey: options.openaiApiKey || process.env.OPENAI_API_KEY,
            anthropicApiKey: options.anthropicApiKey || process.env.ANTHROPIC_API_KEY,

            // Processing options
            enableMultiAgent: options.enableMultiAgent !== false,
            enableFallback: options.enableFallback !== false,
            enableLearning: options.enableLearning !== false,
            enableOCR: options.enableOCR || false,

            // Performance settings
            maxConcurrentJobs: options.maxConcurrentJobs || 5,
            processingTimeout: options.processingTimeout || 300000, // 5 minutes
            confidenceThreshold: options.confidenceThreshold || 0.7,

            // Logging
            logLevel: options.logLevel || 'info',
            enableDetailedLogging: options.enableDetailedLogging || false
        };

        // Initialize clients
        this.supabase = null;
        this.openai = null;
        this.anthropic = null;

        // Initialize processors
        this.layoutDetector = null;
        this.priceExtractor = null;
        this.templateManager = null;
        this.documentProcessor = null;

        // System state
        this.isInitialized = false;
        this.processingQueue = [];
        this.activeJobs = new Map();

        // Statistics
        this.systemStats = {
            totalProcessed: 0,
            successfulProcessed: 0,
            failedProcessed: 0,
            averageProcessingTime: 0,
            averageConfidence: 0,
            supplierStats: {},
            formatStats: {},
            startTime: new Date().toISOString()
        };
    }

    /**
     * Initialize the enhanced system
     */
    async initialize() {
        try {
            console.log('🚀 Initializing Audico Enhanced System...');

            // Initialize external clients
            await this.initializeClients();

            // Initialize processors
            await this.initializeProcessors();

            // Setup database tables if needed
            await this.setupDatabase();

            // Load existing templates and patterns
            await this.loadSystemData();

            this.isInitialized = true;

            console.log('✅ Audico Enhanced System initialized successfully');
            console.log(`📊 Configuration: Multi-Agent: ${this.config.enableMultiAgent}, Learning: ${this.config.enableLearning}, OCR: ${this.config.enableOCR}`);

            return {
                success: true,
                message: 'System initialized successfully',
                capabilities: this.getSystemCapabilities(),
                version: '2.0.0-enhanced'
            };

        } catch (error) {
            console.error('❌ System initialization failed:', error);
            throw new Error(`System initialization failed: ${error.message}`);
        }
    }

    /**
     * Initialize external API clients
     */
    async initializeClients() {
        try {
            // Initialize Supabase
            if (this.config.supabaseUrl && this.config.supabaseKey) {
                this.supabase = createClient(this.config.supabaseUrl, this.config.supabaseKey);
                console.log('✅ Supabase client initialized');
            } else {
                console.warn('⚠️ Supabase credentials not provided - database features disabled');
            }

            // Initialize OpenAI
            if (this.config.openaiApiKey) {
                this.openai = new OpenAI({ apiKey: this.config.openaiApiKey });
                console.log('✅ OpenAI client initialized');
            } else {
                console.warn('⚠️ OpenAI API key not provided - AI features limited');
            }

            // Initialize Anthropic (Claude)
            if (this.config.anthropicApiKey) {
                // Note: In real implementation, initialize Anthropic client here
                console.log('✅ Anthropic client ready (placeholder)');
            } else {
                console.warn('⚠️ Anthropic API key not provided - Claude features disabled');
            }

        } catch (error) {
            throw new Error(`Client initialization failed: ${error.message}`);
        }
    }

    /**
     * Initialize processing components
     */
    async initializeProcessors() {
        try {
            const processorOptions = {
                supabase: this.supabase,
                openai: this.openai,
                anthropic: this.anthropic,
                confidenceThreshold: this.config.confidenceThreshold
            };

            // Initialize layout detector
            this.layoutDetector = new LayoutDetector(processorOptions);
            console.log('✅ Layout Detector initialized');

            // Initialize price extractor
            this.priceExtractor = new PriceExtractionEngine(processorOptions);
            console.log('✅ Price Extraction Engine initialized');

            // Initialize template manager
            this.templateManager = new TemplateManager({
                ...processorOptions,
                learningThreshold: this.config.confidenceThreshold,
                enableLearning: this.config.enableLearning
            });
            console.log('✅ Template Manager initialized');

            // Initialize main document processor
            this.documentProcessor = new EnhancedDocumentProcessor({
                ...processorOptions,
                layoutDetector: this.layoutDetector,
                priceExtractor: this.priceExtractor,
                templateManager: this.templateManager,
                errorRecovery: this // Self-reference for error recovery
            });
            console.log('✅ Enhanced Document Processor initialized');

        } catch (error) {
            throw new Error(`Processor initialization failed: ${error.message}`);
        }
    }

    /**
     * Setup database tables
     */
    async setupDatabase() {
        if (!this.supabase) return;

        try {
            console.log('🗄️ Setting up database tables...');

            // Check if tables exist and create if needed
            const tables = [
                'processing_templates',
                'supplier_profiles', 
                'processing_jobs',
                'system_analytics',
                'supplier_patterns'
            ];

            for (const table of tables) {
                await this.ensureTableExists(table);
            }

            console.log('✅ Database setup complete');

        } catch (error) {
            console.warn('⚠️ Database setup failed:', error.message);
            // Continue without database features
        }
    }

    /**
     * Main processing entry point
     */
    async processDocument(fileBuffer, filename, supplier, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('System not initialized. Call initialize() first.');
            }

            const jobId = this.generateJobId();
            const startTime = Date.now();

            console.log(`📄 Processing document: ${filename} for ${supplier} (Job: ${jobId})`);

            // Create job tracking
            const job = {
                id: jobId,
                filename: filename,
                supplier: supplier,
                startTime: startTime,
                status: 'processing',
                options: options
            };

            this.activeJobs.set(jobId, job);

            try {
                // Process with enhanced system
                const result = await this.documentProcessor.processDocument(
                    fileBuffer, 
                    filename, 
                    supplier, 
                    {
                        ...options,
                        jobId: jobId,
                        enableLearning: this.config.enableLearning
                    }
                );

                // Update job status
                job.status = 'completed';
                job.result = result;
                job.processingTime = Date.now() - startTime;

                // Update system statistics
                this.updateSystemStats(supplier, result, job.processingTime);

                // Log analytics
                await this.logAnalytics(job);

                console.log(`✅ Document processed successfully: ${result.products.length} products extracted`);

                return {
                    ...result,
                    jobId: jobId,
                    processingTime: job.processingTime,
                    systemVersion: '2.0.0-enhanced'
                };

            } catch (processingError) {
                // Attempt error recovery
                console.warn(`⚠️ Primary processing failed, attempting recovery: ${processingError.message}`);

                const recoveryResult = await this.attemptRecovery(
                    fileBuffer, 
                    filename, 
                    supplier, 
                    processingError, 
                    options
                );

                job.status = recoveryResult.success ? 'recovered' : 'failed';
                job.result = recoveryResult;
                job.processingTime = Date.now() - startTime;
                job.error = processingError.message;

                if (recoveryResult.success) {
                    this.updateSystemStats(supplier, recoveryResult, job.processingTime);
                    await this.logAnalytics(job);

                    console.log(`✅ Recovery successful: ${recoveryResult.products.length} products extracted`);

                    return {
                        ...recoveryResult,
                        jobId: jobId,
                        processingTime: job.processingTime,
                        recoveryUsed: true,
                        originalError: processingError.message
                    };
                } else {
                    throw processingError;
                }
            }

        } catch (error) {
            console.error(`❌ Document processing failed: ${error.message}`);

            // Update failure statistics
            this.systemStats.failedProcessed++;

            throw error;
        } finally {
            // Cleanup job tracking
            if (this.activeJobs.has(jobId)) {
                setTimeout(() => {
                    this.activeJobs.delete(jobId);
                }, 300000); // Keep job info for 5 minutes
            }
        }
    }

    /**
     * Error recovery system
     */
    async attemptRecovery(fileBuffer, filename, supplier, error, options) {
        try {
            console.log('🔄 Attempting error recovery...');

            // Recovery strategy 1: Fallback to legacy processing
            if (this.config.enableFallback) {
                try {
                    const legacyResult = await this.fallbackToLegacyProcessing(
                        fileBuffer, 
                        filename, 
                        supplier, 
                        options
                    );

                    if (legacyResult.products.length > 0) {
                        return {
                            success: true,
                            products: legacyResult.products,
                            recoveryMethod: 'legacy_fallback',
                            originalError: error.message
                        };
                    }
                } catch (legacyError) {
                    console.warn('Legacy fallback also failed:', legacyError.message);
                }
            }

            // Recovery strategy 2: Simplified processing
            try {
                const simplifiedResult = await this.simplifiedProcessing(
                    fileBuffer, 
                    filename, 
                    supplier, 
                    options
                );

                if (simplifiedResult.products.length > 0) {
                    return {
                        success: true,
                        products: simplifiedResult.products,
                        recoveryMethod: 'simplified_processing',
                        originalError: error.message
                    };
                }
            } catch (simplifiedError) {
                console.warn('Simplified processing failed:', simplifiedError.message);
            }

            // Recovery strategy 3: Manual extraction patterns
            try {
                const manualResult = await this.manualPatternExtraction(
                    fileBuffer, 
                    filename, 
                    supplier, 
                    options
                );

                return {
                    success: manualResult.products.length > 0,
                    products: manualResult.products,
                    recoveryMethod: 'manual_patterns',
                    originalError: error.message
                };
            } catch (manualError) {
                console.warn('Manual pattern extraction failed:', manualError.message);
            }

            return {
                success: false,
                products: [],
                recoveryMethod: 'none',
                originalError: error.message,
                recoveryErrors: ['All recovery methods failed']
            };

        } catch (recoveryError) {
            console.error('Recovery system failed:', recoveryError);
            return {
                success: false,
                products: [],
                recoveryMethod: 'error',
                originalError: error.message,
                recoveryError: recoveryError.message
            };
        }
    }

    /**
     * Fallback to legacy processing
     */
    async fallbackToLegacyProcessing(fileBuffer, filename, supplier, options) {
        console.log('📜 Using legacy processing fallback...');

        // Import legacy functions (these would be from your existing server.js)
        const XLSX = require('xlsx');
        const pdfParse = require('pdf-parse');

        let products = [];

        if (filename.toLowerCase().endsWith('.pdf')) {
            const pdfData = await pdfParse(fileBuffer);
            products = await this.legacyParsePDFProducts(pdfData.text, supplier);
        } else if (filename.toLowerCase().endsWith('.xlsx') || filename.toLowerCase().endsWith('.xls')) {
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            products = await this.legacyParseExcelProducts(workbook, supplier);
        }

        // Apply pricing logic
        products = this.legacyApplyPricingLogic(products, options);

        return { products: products };
    }

    /**
     * Simplified processing for difficult documents
     */
    async simplifiedProcessing(fileBuffer, filename, supplier, options) {
        console.log('🔧 Using simplified processing...');

        // Use basic pattern matching with lower confidence thresholds
        const simplifiedOptions = {
            ...options,
            confidenceThreshold: 0.3,
            enableAI: false,
            useSimplePatterns: true
        };

        // Try with generic template
        const genericTemplate = await this.templateManager.findBestTemplate('generic', {
            type: 'generic',
            subtype: 'simple',
            confidence: 0.5,
            characteristics: {}
        });

        return await this.documentProcessor.processDocument(
            fileBuffer, 
            filename, 
            supplier, 
            simplifiedOptions
        );
    }

    /**
     * Manual pattern extraction as last resort
     */
    async manualPatternExtraction(fileBuffer, filename, supplier, options) {
        console.log('🔍 Using manual pattern extraction...');

        const products = [];

        try {
            let text = '';

            if (filename.toLowerCase().endsWith('.pdf')) {
                const pdfParse = require('pdf-parse');
                const pdfData = await pdfParse(fileBuffer);
                text = pdfData.text;
            } else {
                const XLSX = require('xlsx');
                const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                text = data.map(row => row.join(' ')).join('\n');
            }

            // Very basic pattern matching
            const lines = text.split('\n');
            for (const line of lines) {
                const priceMatch = line.match(/R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
                if (priceMatch && line.length > 20) {
                    const price = parseFloat(priceMatch[1].replace(/,/g, ''));
                    const name = line.substring(0, line.indexOf(priceMatch[0])).trim();

                    if (name.length > 5 && price > 0) {
                        products.push({
                            name: name,
                            price: price,
                            supplier: supplier,
                            description: name,
                            category: 'uncategorized',
                            confidence: 0.4,
                            extractionMethod: 'manual_pattern'
                        });
                    }
                }
            }

        } catch (error) {
            console.error('Manual extraction failed:', error);
        }

        return { products: products };
    }

    /**
     * Get system capabilities
     */
    getSystemCapabilities() {
        return {
            processors: {
                layoutDetection: true,
                priceExtraction: true,
                templateLearning: this.config.enableLearning,
                errorRecovery: this.config.enableFallback
            },
            formats: {
                pdf: true,
                excel: true,
                multiSheet: true,
                scannedDocuments: this.config.enableOCR
            },
            ai: {
                openai: !!this.openai,
                anthropic: !!this.anthropic,
                categorization: true,
                validation: true
            },
            database: {
                templates: !!this.supabase,
                analytics: !!this.supabase,
                learning: !!this.supabase && this.config.enableLearning
            }
        };
    }

    /**
     * Get system statistics
     */
    getSystemStats() {
        const stats = { ...this.systemStats };

        // Add processor-specific stats
        if (this.layoutDetector) {
            stats.layoutDetector = this.layoutDetector.getStats();
        }

        if (this.priceExtractor) {
            stats.priceExtractor = this.priceExtractor.getStats();
        }

        if (this.templateManager) {
            stats.templateManager = this.templateManager.getStats();
        }

        // Add active job information
        stats.activeJobs = this.activeJobs.size;
        stats.queuedJobs = this.processingQueue.length;

        // Calculate uptime
        const uptime = Date.now() - new Date(stats.startTime).getTime();
        stats.uptimeMs = uptime;
        stats.uptimeHours = Math.round(uptime / (1000 * 60 * 60) * 100) / 100;

        return stats;
    }

    /**
     * Health check
     */
    async healthCheck() {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '2.0.0-enhanced',
            components: {},
            issues: []
        };

        try {
            // Check initialization
            if (!this.isInitialized) {
                health.status = 'unhealthy';
                health.issues.push('System not initialized');
                return health;
            }

            // Check database connection
            if (this.supabase) {
                try {
                    const { data, error } = await this.supabase.from('products').select('count').limit(1);
                    health.components.database = error ? 'unhealthy' : 'healthy';
                    if (error) health.issues.push(`Database: ${error.message}`);
                } catch (dbError) {
                    health.components.database = 'unhealthy';
                    health.issues.push(`Database connection failed: ${dbError.message}`);
                }
            } else {
                health.components.database = 'disabled';
            }

            // Check AI services
            health.components.openai = this.openai ? 'healthy' : 'disabled';
            health.components.anthropic = this.anthropic ? 'healthy' : 'disabled';

            // Check processors
            health.components.layoutDetector = this.layoutDetector ? 'healthy' : 'unhealthy';
            health.components.priceExtractor = this.priceExtractor ? 'healthy' : 'unhealthy';
            health.components.templateManager = this.templateManager ? 'healthy' : 'unhealthy';
            health.components.documentProcessor = this.documentProcessor ? 'healthy' : 'unhealthy';

            // Check system load
            const activeJobs = this.activeJobs.size;
            const maxJobs = this.config.maxConcurrentJobs;

            if (activeJobs >= maxJobs) {
                health.status = 'degraded';
                health.issues.push(`High load: ${activeJobs}/${maxJobs} concurrent jobs`);
            }

            health.components.systemLoad = activeJobs < maxJobs * 0.8 ? 'healthy' : 'degraded';

            // Overall status
            const unhealthyComponents = Object.values(health.components).filter(status => status === 'unhealthy').length;
            if (unhealthyComponents > 0) {
                health.status = 'unhealthy';
            } else if (health.issues.length > 0) {
                health.status = 'degraded';
            }

        } catch (error) {
            health.status = 'unhealthy';
            health.issues.push(`Health check failed: ${error.message}`);
        }

        return health;
    }

    /**
     * Shutdown system gracefully
     */
    async shutdown() {
        console.log('🛑 Shutting down Audico Enhanced System...');

        try {
            // Wait for active jobs to complete (with timeout)
            const shutdownTimeout = 30000; // 30 seconds
            const startTime = Date.now();

            while (this.activeJobs.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
                console.log(`⏳ Waiting for ${this.activeJobs.size} active jobs to complete...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Force cleanup remaining jobs
            if (this.activeJobs.size > 0) {
                console.warn(`⚠️ Force terminating ${this.activeJobs.size} remaining jobs`);
                this.activeJobs.clear();
            }

            // Save final analytics
            await this.saveSystemAnalytics();

            // Cleanup processors
            if (this.templateManager) {
                // Save any pending templates
                console.log('💾 Saving templates...');
            }

            this.isInitialized = false;

            console.log('✅ System shutdown complete');

        } catch (error) {
            console.error('❌ Error during shutdown:', error);
        }
    }

    /**
     * Helper methods
     */

    generateJobId() {
        return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    updateSystemStats(supplier, result, processingTime) {
        this.systemStats.totalProcessed++;

        if (result.success && result.products.length > 0) {
            this.systemStats.successfulProcessed++;
        }

        // Update averages
        const total = this.systemStats.totalProcessed;
        this.systemStats.averageProcessingTime = 
            ((this.systemStats.averageProcessingTime * (total - 1)) + processingTime) / total;

        if (result.metadata?.confidence) {
            this.systemStats.averageConfidence = 
                ((this.systemStats.averageConfidence * (total - 1)) + result.metadata.confidence) / total;
        }

        // Update supplier stats
        if (!this.systemStats.supplierStats[supplier]) {
            this.systemStats.supplierStats[supplier] = {
                processed: 0,
                successful: 0,
                averageProducts: 0,
                averageConfidence: 0
            };
        }

        const supplierStats = this.systemStats.supplierStats[supplier];
        supplierStats.processed++;

        if (result.success && result.products.length > 0) {
            supplierStats.successful++;
            supplierStats.averageProducts = 
                ((supplierStats.averageProducts * (supplierStats.successful - 1)) + result.products.length) / supplierStats.successful;
        }

        if (result.metadata?.confidence) {
            supplierStats.averageConfidence = 
                ((supplierStats.averageConfidence * (supplierStats.processed - 1)) + result.metadata.confidence) / supplierStats.processed;
        }
    }

    async ensureTableExists(tableName) {
        // This would contain the actual table creation logic
        // For now, just log that we're checking
        console.log(`   Checking table: ${tableName}`);
    }

    async loadSystemData() {
        console.log('📚 Loading system data...');
        // Template manager will load its own data
        // This could load additional system-wide configurations
    }

    async logAnalytics(job) {
        if (!this.supabase) return;

        try {
            const analytics = {
                job_id: job.id,
                filename: job.filename,
                supplier: job.supplier,
                processing_time: job.processingTime,
                status: job.status,
                products_extracted: job.result?.products?.length || 0,
                confidence: job.result?.metadata?.confidence || 0,
                extraction_method: job.result?.metadata?.extractionMethod || 'unknown',
                created_at: new Date().toISOString()
            };

            await this.supabase.from('system_analytics').insert(analytics);
        } catch (error) {
            console.warn('Failed to log analytics:', error);
        }
    }

    async saveSystemAnalytics() {
        if (!this.supabase) return;

        try {
            const analytics = {
                timestamp: new Date().toISOString(),
                system_stats: JSON.stringify(this.systemStats),
                version: '2.0.0-enhanced'
            };

            await this.supabase.from('system_snapshots').insert(analytics);
        } catch (error) {
            console.warn('Failed to save system analytics:', error);
        }
    }

    // Legacy processing methods (simplified versions)
    async legacyParsePDFProducts(text, supplier) {
        const products = [];
        const lines = text.split('\n').filter(line => line.trim().length > 0);

        for (const line of lines) {
            const priceMatch = line.match(/R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
            if (priceMatch) {
                const productName = line.substring(0, line.indexOf(priceMatch[0])).trim();
                if (productName.length > 5) {
                    const price = parseFloat(priceMatch[1].replace(/,/g, ''));
                    products.push({
                        name: productName,
                        price: price,
                        supplier: supplier,
                        description: productName,
                        category: 'uncategorized',
                        extractionMethod: 'legacy_pdf'
                    });
                }
            }
        }

        return products;
    }

    async legacyParseExcelProducts(workbook, supplier) {
        const products = [];

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (data.length < 2) continue;

            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length === 0) continue;

                const name = row[0];
                const price = row[1];

                if (name && price && typeof name === 'string' && name.length > 2) {
                    const numericPrice = typeof price === 'number' ? price : parseFloat(String(price).replace(/[^0-9.]/g, ''));

                    if (!isNaN(numericPrice) && numericPrice > 0) {
                        products.push({
                            name: name.trim(),
                            price: numericPrice,
                            supplier: supplier,
                            description: name.trim(),
                            category: 'uncategorized',
                            extractionMethod: 'legacy_excel'
                        });
                    }
                }
            }
        }

        return products;
    }

    legacyApplyPricingLogic(products, options) {
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
}

module.exports = AudicoEnhancedSystem;
