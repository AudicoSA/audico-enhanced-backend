const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const async = require('async');

// Import specialized agents
const DocumentAgent = require('./document-agent');
const SupplierAgent = require('./supplier-agent');
const PriceAgent = require('./price-agent');
const ValidationAgent = require('./validation-agent');
const LearningAgent = require('./learning-agent');

class AgentOrchestrator {
    constructor(config) {
        this.config = config;
        this.healthy = false;

        // Initialize logging
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ filename: 'logs/orchestrator-error.log', level: 'error' }),
                new winston.transports.File({ filename: 'logs/orchestrator.log' }),
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });

        // Initialize clients (reuse existing configuration)
        this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
        this.openai = new OpenAI({ apiKey: config.openaiApiKey });

        // Initialize specialized agents
        this.agents = {
            document: new DocumentAgent({
                logger: this.logger,
                config: config
            }),
            supplier: new SupplierAgent({
                logger: this.logger,
                supabase: this.supabase,
                config: config
            }),
            price: new PriceAgent({
                logger: this.logger,
                openai: this.openai,
                config: config
            }),
            validation: new ValidationAgent({
                logger: this.logger,
                config: config
            }),
            learning: new LearningAgent({
                logger: this.logger,
                supabase: this.supabase,
                config: config
            })
        };

        // Processing statistics
        this.stats = {
            totalProcessed: 0,
            successfulProcessing: 0,
            failedProcessing: 0,
            averageProcessingTime: 0,
            lastProcessed: null
        };

        this.initialize();
    }

    async initialize() {
        try {
            this.logger.info('🚀 Initializing Agent Orchestrator...');

            // Initialize all agents
            await Promise.all([
                this.agents.document.initialize(),
                this.agents.supplier.initialize(),
                this.agents.price.initialize(),
                this.agents.validation.initialize(),
                this.agents.learning.initialize()
            ]);

            // Test database connection
            const { data, error } = await this.supabase.from('products').select('count').limit(1);
            if (error) {
                throw new Error(`Database connection failed: ${error.message}`);
            }

            // Test OpenAI connection
            await this.openai.models.list();

            this.healthy = true;
            this.logger.info('✅ Agent Orchestrator initialized successfully');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Agent Orchestrator:', error);
            this.healthy = false;

            if (this.config.enableFallback) {
                this.logger.warn('⚠️ Fallback mode enabled - will use legacy processing');
            }
        }
    }

    isHealthy() {
        return this.healthy;
    }

    async processFile(jobData) {
        const startTime = Date.now();
        const jobId = uuidv4();

        this.logger.info(`📁 Starting file processing [Job: ${jobId}]`, {
            filename: jobData.filename,
            supplier: jobData.supplier,
            jobId: jobId
        });

        try {
            // Step 1: Document Intelligence - Extract and analyze document structure
            this.logger.info(`🔍 Step 1: Document analysis [Job: ${jobId}]`);
            const documentResult = await this.agents.document.processDocument({
                fileBuffer: jobData.fileBuffer,
                filename: jobData.filename,
                supplier: jobData.supplier
            });

            if (!documentResult.success) {
                throw new Error(`Document processing failed: ${documentResult.error}`);
            }

            // Step 2: Supplier Configuration - Get supplier-specific rules
            this.logger.info(`⚙️ Step 2: Supplier configuration [Job: ${jobId}]`);
            const supplierConfig = await this.agents.supplier.getConfiguration(
                jobData.supplier,
                documentResult.documentStructure
            );

            // Step 3: Price Extraction - Extract products with intelligent price selection
            this.logger.info(`💰 Step 3: Price extraction [Job: ${jobId}]`);
            const extractionResult = await this.agents.price.extractProducts({
                documentContent: documentResult.content,
                documentStructure: documentResult.documentStructure,
                supplierConfig: supplierConfig,
                options: jobData.options
            });

            if (!extractionResult.success) {
                throw new Error(`Price extraction failed: ${extractionResult.error}`);
            }

            // Step 4: Data Validation - Validate and clean extracted data
            this.logger.info(`✅ Step 4: Data validation [Job: ${jobId}]`);
            const validationResult = await this.agents.validation.validateProducts({
                products: extractionResult.products,
                supplierConfig: supplierConfig,
                originalOptions: jobData.options
            });

            // Step 5: Learning - Update system knowledge based on results
            this.logger.info(`🧠 Step 5: Learning update [Job: ${jobId}]`);
            await this.agents.learning.updateKnowledge({
                supplier: jobData.supplier,
                documentStructure: documentResult.documentStructure,
                extractionResults: extractionResult,
                validationResults: validationResult,
                processingTime: Date.now() - startTime
            });

            // Compile final results
            const finalResult = {
                success: true,
                jobId: jobId,
                products: validationResult.validatedProducts,
                qualityScore: validationResult.qualityScore,
                extractionStats: {
                    totalExtracted: extractionResult.products.length,
                    validProducts: validationResult.validatedProducts.length,
                    invalidProducts: validationResult.invalidProducts.length,
                    confidenceScore: extractionResult.confidenceScore
                },
                processingDetails: {
                    documentType: documentResult.documentType,
                    supplierConfigUsed: supplierConfig.configId,
                    priceColumnsFound: extractionResult.priceColumnsFound,
                    processingTime: Date.now() - startTime,
                    agentVersions: this.getAgentVersions()
                },
                warnings: validationResult.warnings || [],
                recommendations: validationResult.recommendations || []
            };

            // Update statistics
            this.updateStats(true, Date.now() - startTime);

            this.logger.info(`✅ File processing completed successfully [Job: ${jobId}]`, {
                productsExtracted: finalResult.products.length,
                qualityScore: finalResult.qualityScore,
                processingTime: finalResult.processingDetails.processingTime
            });

            return finalResult;

        } catch (error) {
            this.logger.error(`❌ File processing failed [Job: ${jobId}]:`, error);

            // Update statistics
            this.updateStats(false, Date.now() - startTime);

            // If fallback is enabled, throw error to trigger legacy processing
            if (this.config.enableFallback) {
                throw new Error(`Multi-agent processing failed: ${error.message}`);
            }

            return {
                success: false,
                jobId: jobId,
                error: error.message,
                processingTime: Date.now() - startTime,
                fallbackAvailable: this.config.enableFallback
            };
        }
    }

    async processFileAsync(jobId) {
        // This method is called for asynchronous processing
        // Implementation would depend on your job queue system (Bull, etc.)
        this.logger.info(`🔄 Starting async processing for job: ${jobId}`);

        try {
            // Get job data from job manager
            const jobData = await this.getJobData(jobId);

            // Process the file
            const result = await this.processFile(jobData);

            return result;

        } catch (error) {
            this.logger.error(`❌ Async processing failed for job ${jobId}:`, error);
            throw error;
        }
    }

    async getJobData(jobId) {
        // This would typically fetch job data from your job queue
        // For now, return a placeholder
        return {
            jobId: jobId,
            // Job data would be retrieved from job manager
        };
    }

    updateStats(success, processingTime) {
        this.stats.totalProcessed++;

        if (success) {
            this.stats.successfulProcessing++;
        } else {
            this.stats.failedProcessing++;
        }

        // Update average processing time
        this.stats.averageProcessingTime = 
            (this.stats.averageProcessingTime * (this.stats.totalProcessed - 1) + processingTime) / 
            this.stats.totalProcessed;

        this.stats.lastProcessed = new Date().toISOString();
    }

    getAgentVersions() {
        return {
            orchestrator: '2.0.0',
            document: this.agents.document.getVersion(),
            supplier: this.agents.supplier.getVersion(),
            price: this.agents.price.getVersion(),
            validation: this.agents.validation.getVersion(),
            learning: this.agents.learning.getVersion()
        };
    }

    getStats() {
        return {
            ...this.stats,
            healthy: this.healthy,
            agentStatus: {
                document: this.agents.document.isHealthy(),
                supplier: this.agents.supplier.isHealthy(),
                price: this.agents.price.isHealthy(),
                validation: this.agents.validation.isHealthy(),
                learning: this.agents.learning.isHealthy()
            }
        };
    }

    async getDetailedStatus() {
        return {
            orchestrator: {
                healthy: this.healthy,
                version: '2.0.0',
                stats: this.stats
            },
            agents: {
                document: await this.agents.document.getStatus(),
                supplier: await this.agents.supplier.getStatus(),
                price: await this.agents.price.getStatus(),
                validation: await this.agents.validation.getStatus(),
                learning: await this.agents.learning.getStatus()
            },
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            }
        };
    }

    async shutdown() {
        this.logger.info('🛑 Shutting down Agent Orchestrator...');

        try {
            // Shutdown all agents gracefully
            await Promise.all([
                this.agents.document.shutdown(),
                this.agents.supplier.shutdown(),
                this.agents.price.shutdown(),
                this.agents.validation.shutdown(),
                this.agents.learning.shutdown()
            ]);

            this.healthy = false;
            this.logger.info('✅ Agent Orchestrator shutdown complete');

        } catch (error) {
            this.logger.error('❌ Error during shutdown:', error);
        }
    }
}

module.exports = AgentOrchestrator;
