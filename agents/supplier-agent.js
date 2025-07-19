const winston = require('winston');

class SupplierAgent {
    constructor(config) {
        this.config = config;
        this.logger = config.logger;
        this.supabase = config.supabase;
        this.healthy = false;
        this.version = '1.0.0';

        // Default supplier configurations
        this.defaultConfigs = {
            'Denon': {
                priceColumnPriority: ['New RRP', 'Current Price', 'RRP', 'Price'],
                productNamePatterns: [/^[A-Z0-9-]+\s+.+/],
                skipSections: ['Terms', 'Conditions', 'Contact'],
                documentType: 'pdf'
            },
            'Mission': {
                priceColumnPriority: ['Price', 'RRP', 'Cost'],
                productNamePatterns: [/^.+\s+R\d+/],
                skipSections: ['Header', 'Footer'],
                documentType: 'pdf'
            },
            'Nology': {
                priceColumnPriority: ['New RRP', 'RRP', 'Price'],
                multiSheet: true,
                skipSheets: ['Summary', 'Index', 'Contents'],
                documentType: 'excel'
            },
            'Proaudio': {
                priceColumnPriority: ['New Price', 'Current Price', 'RRP'],
                sectionBased: true,
                brandSections: true,
                documentType: 'pdf'
            },
            'Polk': {
                priceColumnPriority: ['Price', 'Unit Price', 'RRP'],
                blockFormat: true,
                currencyHandling: true,
                documentType: 'pdf'
            },
            'Marantz': {
                priceColumnPriority: ['New RRP', 'Current RRP', 'Price'],
                categoryBased: true,
                priceComparison: true,
                documentType: 'pdf'
            }
        };

        this.stats = {
            configurationsUsed: 0,
            successfulConfigurations: 0,
            configurationUpdates: 0
        };
    }

    async initialize() {
        try {
            this.logger.info('⚙️ Initializing Supplier Agent...');

            // Load supplier configurations from database
            await this.loadSupplierConfigurations();

            this.healthy = true;
            this.logger.info('✅ Supplier Agent initialized');
        } catch (error) {
            this.logger.error('❌ Supplier Agent initialization failed:', error);
            this.healthy = false;
        }
    }

    async loadSupplierConfigurations() {
        try {
            // Load configurations from database
            const { data, error } = await this.supabase
                .from('supplier_configs')
                .select('*')
                .eq('is_active', true);

            if (error) {
                this.logger.warn('Could not load supplier configs from database:', error);
                return;
            }

            // Merge with default configurations
            for (const config of data) {
                this.defaultConfigs[config.supplier_name] = {
                    ...this.defaultConfigs[config.supplier_name],
                    ...config.config_data,
                    configId: config.id,
                    version: config.version
                };
            }

            this.logger.info(`📋 Loaded ${data.length} supplier configurations from database`);
        } catch (error) {
            this.logger.error('Failed to load supplier configurations:', error);
        }
    }

    async getConfiguration(supplierName, documentStructure = null) {
        try {
            this.logger.info(`⚙️ Getting configuration for supplier: ${supplierName}`);

            let config = this.defaultConfigs[supplierName];

            if (!config) {
                // Create default configuration for unknown supplier
                config = await this.createDefaultConfiguration(supplierName, documentStructure);
            }

            // Enhance configuration based on document structure
            if (documentStructure) {
                config = await this.enhanceConfiguration(config, documentStructure);
            }

            this.stats.configurationsUsed++;

            return {
                ...config,
                supplierName: supplierName,
                configId: config.configId || `default_${supplierName}`,
                lastUsed: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error(`Failed to get configuration for ${supplierName}:`, error);

            // Return basic fallback configuration
            return {
                supplierName: supplierName,
                priceColumnPriority: ['Price', 'RRP', 'Cost'],
                productNamePatterns: [/.+/],
                skipSections: [],
                documentType: 'unknown',
                configId: `fallback_${supplierName}`
            };
        }
    }

    async createDefaultConfiguration(supplierName, documentStructure) {
        this.logger.info(`🆕 Creating default configuration for: ${supplierName}`);

        const config = {
            priceColumnPriority: ['New RRP', 'RRP', 'Price', 'Cost'],
            productNamePatterns: [/.+/],
            skipSections: ['Terms', 'Conditions', 'Contact', 'Header', 'Footer'],
            documentType: documentStructure?.sheetCount ? 'excel' : 'pdf',
            createdAt: new Date().toISOString(),
            autoGenerated: true
        };

        // Save to database for future use
        try {
            await this.saveConfiguration(supplierName, config);
        } catch (error) {
            this.logger.warn(`Could not save configuration for ${supplierName}:`, error);
        }

        return config;
    }

    async enhanceConfiguration(config, documentStructure) {
        // Enhance configuration based on document analysis
        const enhanced = { ...config };

        if (documentStructure.sheetCount > 1) {
            enhanced.multiSheet = true;
            enhanced.skipSheets = enhanced.skipSheets || ['Summary', 'Index', 'Contents', 'Cover'];
        }

        if (documentStructure.pages > 10) {
            enhanced.largePDF = true;
            enhanced.sectionBased = true;
        }

        return enhanced;
    }

    async saveConfiguration(supplierName, configData) {
        try {
            const { data, error } = await this.supabase
                .from('supplier_configs')
                .upsert([{
                    supplier_name: supplierName,
                    config_data: configData,
                    version: 1,
                    is_active: true
                }], {
                    onConflict: 'supplier_name'
                });

            if (error) {
                throw error;
            }

            this.stats.configurationUpdates++;
            this.logger.info(`💾 Saved configuration for ${supplierName}`);

        } catch (error) {
            this.logger.error(`Failed to save configuration for ${supplierName}:`, error);
            throw error;
        }
    }

    async updateConfigurationSuccess(supplierName, success) {
        try {
            if (success) {
                this.stats.successfulConfigurations++;
            }

            // Update success rate in database
            // Implementation would track success rates per supplier

        } catch (error) {
            this.logger.error(`Failed to update configuration success for ${supplierName}:`, error);
        }
    }

    isHealthy() {
        return this.healthy;
    }

    getVersion() {
        return this.version;
    }

    async getStatus() {
        return {
            healthy: this.healthy,
            version: this.version,
            stats: this.stats,
            configuredSuppliers: Object.keys(this.defaultConfigs).length
        };
    }

    async getMetrics() {
        return this.stats;
    }

    async shutdown() {
        this.logger.info('🛑 Shutting down Supplier Agent...');
        this.healthy = false;
    }
}

module.exports = SupplierAgent;
