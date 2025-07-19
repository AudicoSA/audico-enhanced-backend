const { createClient } = require('@supabase/supabase-js');
const winston = require('winston');

class DatabaseManager {
    constructor(config = {}) {
        this.config = config;

        // Initialize logging
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ filename: 'logs/database-manager.log' }),
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });

        this.supabase = null;
        this.healthy = false;
        this.connectionRetries = 0;
        this.maxRetries = config.maxRetries || 3;

        this.logger.info('🗄️ Database Manager initialized');
    }

    async initialize(supabaseUrl, supabaseKey) {
        try {
            this.supabase = createClient(supabaseUrl, supabaseKey);

            // Test connection
            await this.testConnection();

            this.healthy = true;
            this.logger.info('✅ Database connection established');

        } catch (error) {
            this.logger.error('❌ Database initialization failed:', error);
            this.healthy = false;
            throw error;
        }
    }

    async testConnection() {
        try {
            const { data, error } = await this.supabase
                .from('products')
                .select('count')
                .limit(1);

            if (error) {
                throw error;
            }

            return true;
        } catch (error) {
            this.logger.error('Database connection test failed:', error);
            throw error;
        }
    }

    async ensureTablesExist() {
        try {
            // Check if required tables exist and create them if needed
            const requiredTables = [
                'products',
                'processing_jobs',
                'agent_logs',
                'supplier_configs'
            ];

            for (const table of requiredTables) {
                await this.ensureTableExists(table);
            }

            this.logger.info('✅ All required tables verified');

        } catch (error) {
            this.logger.error('❌ Table verification failed:', error);
            throw error;
        }
    }

    async ensureTableExists(tableName) {
        try {
            // Try to query the table
            const { data, error } = await this.supabase
                .from(tableName)
                .select('*')
                .limit(1);

            if (error && error.code === 'PGRST116') {
                // Table doesn't exist, create it
                await this.createTable(tableName);
            } else if (error) {
                throw error;
            }

        } catch (error) {
            this.logger.error(`Table check failed for ${tableName}:`, error);
            throw error;
        }
    }

    async createTable(tableName) {
        const tableSchemas = {
            'processing_jobs': `
                CREATE TABLE processing_jobs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    job_id VARCHAR(255) UNIQUE NOT NULL,
                    status VARCHAR(50) NOT NULL DEFAULT 'queued',
                    type VARCHAR(100) NOT NULL,
                    supplier VARCHAR(100),
                    filename VARCHAR(255),
                    file_size INTEGER,
                    processing_method VARCHAR(100),
                    products_extracted INTEGER DEFAULT 0,
                    quality_score DECIMAL(3,2),
                    error_message TEXT,
                    started_at TIMESTAMP,
                    completed_at TIMESTAMP,
                    processing_time INTEGER,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );

                CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
                CREATE INDEX idx_processing_jobs_supplier ON processing_jobs(supplier);
                CREATE INDEX idx_processing_jobs_created_at ON processing_jobs(created_at);
            `,

            'agent_logs': `
                CREATE TABLE agent_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    agent_name VARCHAR(100) NOT NULL,
                    job_id VARCHAR(255),
                    level VARCHAR(20) NOT NULL,
                    message TEXT NOT NULL,
                    metadata JSONB,
                    created_at TIMESTAMP DEFAULT NOW()
                );

                CREATE INDEX idx_agent_logs_agent_name ON agent_logs(agent_name);
                CREATE INDEX idx_agent_logs_job_id ON agent_logs(job_id);
                CREATE INDEX idx_agent_logs_level ON agent_logs(level);
                CREATE INDEX idx_agent_logs_created_at ON agent_logs(created_at);
            `,

            'supplier_configs': `
                CREATE TABLE supplier_configs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    supplier_name VARCHAR(100) UNIQUE NOT NULL,
                    config_data JSONB NOT NULL,
                    version INTEGER DEFAULT 1,
                    is_active BOOLEAN DEFAULT true,
                    success_rate DECIMAL(5,2) DEFAULT 0.00,
                    total_processed INTEGER DEFAULT 0,
                    last_updated TIMESTAMP DEFAULT NOW(),
                    created_at TIMESTAMP DEFAULT NOW()
                );

                CREATE INDEX idx_supplier_configs_supplier_name ON supplier_configs(supplier_name);
                CREATE INDEX idx_supplier_configs_is_active ON supplier_configs(is_active);
            `
        };

        const schema = tableSchemas[tableName];
        if (!schema) {
            throw new Error(`No schema defined for table: ${tableName}`);
        }

        try {
            // Execute the schema creation
            const { error } = await this.supabase.rpc('exec_sql', { sql: schema });

            if (error) {
                throw error;
            }

            this.logger.info(`✅ Created table: ${tableName}`);

        } catch (error) {
            this.logger.error(`❌ Failed to create table ${tableName}:`, error);
            throw error;
        }
    }

    async saveProcessingJob(jobData) {
        try {
            const { data, error } = await this.supabase
                .from('processing_jobs')
                .insert([{
                    job_id: jobData.jobId,
                    status: jobData.status,
                    type: jobData.type,
                    supplier: jobData.supplier,
                    filename: jobData.filename,
                    file_size: jobData.fileSize,
                    processing_method: jobData.processingMethod,
                    products_extracted: jobData.productsExtracted,
                    quality_score: jobData.qualityScore,
                    error_message: jobData.errorMessage,
                    started_at: jobData.startedAt,
                    completed_at: jobData.completedAt,
                    processing_time: jobData.processingTime
                }])
                .select();

            if (error) {
                throw error;
            }

            return data[0];

        } catch (error) {
            this.logger.error('Failed to save processing job:', error);
            throw error;
        }
    }

    async updateProcessingJob(jobId, updates) {
        try {
            const { data, error } = await this.supabase
                .from('processing_jobs')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('job_id', jobId)
                .select();

            if (error) {
                throw error;
            }

            return data[0];

        } catch (error) {
            this.logger.error(`Failed to update processing job ${jobId}:`, error);
            throw error;
        }
    }

    async logAgentActivity(agentName, jobId, level, message, metadata = {}) {
        try {
            const { data, error } = await this.supabase
                .from('agent_logs')
                .insert([{
                    agent_name: agentName,
                    job_id: jobId,
                    level: level,
                    message: message,
                    metadata: metadata
                }]);

            if (error) {
                throw error;
            }

            return data;

        } catch (error) {
            this.logger.error('Failed to log agent activity:', error);
            // Don't throw error for logging failures
        }
    }

    async saveSupplierConfig(supplierName, configData) {
        try {
            const { data, error } = await this.supabase
                .from('supplier_configs')
                .upsert([{
                    supplier_name: supplierName,
                    config_data: configData,
                    last_updated: new Date().toISOString()
                }], {
                    onConflict: 'supplier_name'
                })
                .select();

            if (error) {
                throw error;
            }

            return data[0];

        } catch (error) {
            this.logger.error(`Failed to save supplier config for ${supplierName}:`, error);
            throw error;
        }
    }

    async getSupplierConfig(supplierName) {
        try {
            const { data, error } = await this.supabase
                .from('supplier_configs')
                .select('*')
                .eq('supplier_name', supplierName)
                .eq('is_active', true)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return data;

        } catch (error) {
            this.logger.error(`Failed to get supplier config for ${supplierName}:`, error);
            return null;
        }
    }

    async updateSupplierStats(supplierName, success, processingTime) {
        try {
            // Get current stats
            const config = await this.getSupplierConfig(supplierName);
            if (!config) return;

            const totalProcessed = (config.total_processed || 0) + 1;
            const currentSuccessRate = config.success_rate || 0;
            const successfulJobs = Math.round((currentSuccessRate / 100) * (totalProcessed - 1));
            const newSuccessfulJobs = success ? successfulJobs + 1 : successfulJobs;
            const newSuccessRate = (newSuccessfulJobs / totalProcessed) * 100;

            const { data, error } = await this.supabase
                .from('supplier_configs')
                .update({
                    success_rate: newSuccessRate,
                    total_processed: totalProcessed,
                    last_updated: new Date().toISOString()
                })
                .eq('supplier_name', supplierName);

            if (error) {
                throw error;
            }

            return data;

        } catch (error) {
            this.logger.error(`Failed to update supplier stats for ${supplierName}:`, error);
        }
    }

    async getProcessingStats(timeframe = '24h') {
        try {
            let timeFilter = new Date();

            switch (timeframe) {
                case '1h':
                    timeFilter.setHours(timeFilter.getHours() - 1);
                    break;
                case '24h':
                    timeFilter.setDate(timeFilter.getDate() - 1);
                    break;
                case '7d':
                    timeFilter.setDate(timeFilter.getDate() - 7);
                    break;
                case '30d':
                    timeFilter.setDate(timeFilter.getDate() - 30);
                    break;
            }

            const { data, error } = await this.supabase
                .from('processing_jobs')
                .select('*')
                .gte('created_at', timeFilter.toISOString());

            if (error) {
                throw error;
            }

            // Calculate statistics
            const stats = {
                total: data.length,
                completed: data.filter(job => job.status === 'completed').length,
                failed: data.filter(job => job.status === 'failed').length,
                processing: data.filter(job => job.status === 'processing').length,
                queued: data.filter(job => job.status === 'queued').length,
                averageProcessingTime: 0,
                totalProductsExtracted: 0,
                averageQualityScore: 0
            };

            const completedJobs = data.filter(job => job.status === 'completed' && job.processing_time);
            if (completedJobs.length > 0) {
                stats.averageProcessingTime = completedJobs.reduce((sum, job) => sum + job.processing_time, 0) / completedJobs.length;
                stats.totalProductsExtracted = completedJobs.reduce((sum, job) => sum + (job.products_extracted || 0), 0);

                const jobsWithQuality = completedJobs.filter(job => job.quality_score);
                if (jobsWithQuality.length > 0) {
                    stats.averageQualityScore = jobsWithQuality.reduce((sum, job) => sum + job.quality_score, 0) / jobsWithQuality.length;
                }
            }

            return stats;

        } catch (error) {
            this.logger.error('Failed to get processing stats:', error);
            throw error;
        }
    }

    async cleanup(daysToKeep = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            // Clean up old processing jobs
            const { data: jobsData, error: jobsError } = await this.supabase
                .from('processing_jobs')
                .delete()
                .lt('created_at', cutoffDate.toISOString());

            if (jobsError) {
                throw jobsError;
            }

            // Clean up old agent logs
            const { data: logsData, error: logsError } = await this.supabase
                .from('agent_logs')
                .delete()
                .lt('created_at', cutoffDate.toISOString());

            if (logsError) {
                throw logsError;
            }

            this.logger.info(`🧹 Database cleanup completed - removed records older than ${daysToKeep} days`);

        } catch (error) {
            this.logger.error('Database cleanup failed:', error);
            throw error;
        }
    }

    isHealthy() {
        return this.healthy;
    }

    async getStatus() {
        try {
            await this.testConnection();

            return {
                healthy: this.healthy,
                connected: true,
                lastCheck: new Date().toISOString(),
                retries: this.connectionRetries
            };

        } catch (error) {
            return {
                healthy: false,
                connected: false,
                lastCheck: new Date().toISOString(),
                error: error.message,
                retries: this.connectionRetries
            };
        }
    }

    async shutdown() {
        this.logger.info('🛑 Shutting down Database Manager...');

        this.healthy = false;

        // Supabase client doesn't need explicit cleanup
        this.supabase = null;

        this.logger.info('✅ Database Manager shutdown complete');
    }
}

module.exports = DatabaseManager;
