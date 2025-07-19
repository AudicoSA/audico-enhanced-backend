const winston = require('winston');

class LearningAgent {
    constructor(config) {
        this.config = config;
        this.logger = config.logger;
        this.supabase = config.supabase;
        this.healthy = false;
        this.version = '1.0.0';

        this.stats = {
            learningUpdates: 0,
            configurationImprovements: 0,
            patternRecognitions: 0,
            successRateImprovements: 0
        };

        // Learning patterns storage
        this.patterns = {
            successful: new Map(),
            failed: new Map(),
            improvements: new Map()
        };
    }

    async initialize() {
        try {
            this.logger.info('🧠 Initializing Learning Agent...');

            // Load existing patterns from database
            await this.loadLearningPatterns();

            this.healthy = true;
            this.logger.info('✅ Learning Agent initialized');
        } catch (error) {
            this.logger.error('❌ Learning Agent initialization failed:', error);
            this.healthy = false;
        }
    }

    async loadLearningPatterns() {
        try {
            // Load learning patterns from database
            // This would be implemented with a dedicated learning_patterns table
            this.logger.info('📚 Loading learning patterns from database...');

            // Placeholder for pattern loading
            // In full implementation, this would load historical patterns

        } catch (error) {
            this.logger.warn('Could not load learning patterns:', error);
        }
    }

    async updateKnowledge(learningData) {
        try {
            this.logger.info('🧠 Updating knowledge base...');

            const {
                supplier,
                documentStructure,
                extractionResults,
                validationResults,
                processingTime
            } = learningData;

            // Analyze extraction success patterns
            await this.analyzeExtractionPatterns(supplier, documentStructure, extractionResults);

            // Analyze validation patterns
            await this.analyzeValidationPatterns(supplier, validationResults);

            // Update supplier-specific learning
            await this.updateSupplierLearning(supplier, {
                documentStructure,
                extractionResults,
                validationResults,
                processingTime
            });

            // Generate improvement suggestions
            const improvements = await this.generateImprovements(supplier, learningData);

            this.stats.learningUpdates++;

            this.logger.info(`🧠 Knowledge update completed for ${supplier}`);

            return {
                success: true,
                improvements: improvements,
                patternsUpdated: this.stats.patternRecognitions
            };

        } catch (error) {
            this.logger.error('❌ Knowledge update failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async analyzeExtractionPatterns(supplier, documentStructure, extractionResults) {
        try {
            const patternKey = `${supplier}_extraction`;

            if (!this.patterns.successful.has(patternKey)) {
                this.patterns.successful.set(patternKey, []);
            }

            const patterns = this.patterns.successful.get(patternKey);

            // Record successful patterns
            if (extractionResults.success && extractionResults.products.length > 0) {
                patterns.push({
                    documentType: documentStructure.sheetCount ? 'excel' : 'pdf',
                    priceColumnsFound: extractionResults.priceColumnsFound,
                    productCount: extractionResults.products.length,
                    confidenceScore: extractionResults.confidenceScore,
                    timestamp: new Date().toISOString()
                });

                // Keep only recent patterns (last 100)
                if (patterns.length > 100) {
                    patterns.splice(0, patterns.length - 100);
                }

                this.stats.patternRecognitions++;
            }

            // Analyze for common successful patterns
            await this.identifySuccessfulPatterns(supplier, patterns);

        } catch (error) {
            this.logger.error('Pattern analysis failed:', error);
        }
    }

    async analyzeValidationPatterns(supplier, validationResults) {
        try {
            const patternKey = `${supplier}_validation`;

            // Track validation success rates
            const validationPattern = {
                qualityScore: validationResults.qualityScore,
                validProductsRatio: validationResults.validatedProducts.length / 
                    (validationResults.validatedProducts.length + validationResults.invalidProducts.length),
                commonIssues: Object.keys(validationResults.issuesSummary),
                timestamp: new Date().toISOString()
            };

            if (!this.patterns.successful.has(patternKey)) {
                this.patterns.successful.set(patternKey, []);
            }

            this.patterns.successful.get(patternKey).push(validationPattern);

        } catch (error) {
            this.logger.error('Validation pattern analysis failed:', error);
        }
    }

    async updateSupplierLearning(supplier, data) {
        try {
            // Calculate success metrics
            const successRate = data.validationResults.qualityScore;
            const extractionEfficiency = data.extractionResults.products.length / (data.processingTime / 1000); // products per second

            // Update supplier-specific learning data
            const learningUpdate = {
                supplier: supplier,
                success_rate: successRate,
                extraction_efficiency: extractionEfficiency,
                common_issues: Object.keys(data.validationResults.issuesSummary),
                best_practices: this.extractBestPractices(data),
                last_updated: new Date().toISOString()
            };

            // Save to database (in full implementation)
            await this.saveLearningData(learningUpdate);

        } catch (error) {
            this.logger.error('Supplier learning update failed:', error);
        }
    }

    extractBestPractices(data) {
        const practices = [];

        // Identify what worked well
        if (data.extractionResults.confidenceScore > 80) {
            practices.push({
                type: 'extraction',
                practice: 'High confidence extraction achieved',
                details: {
                    priceColumns: data.extractionResults.priceColumnsFound,
                    method: data.extractionResults.extractionMethod
                }
            });
        }

        if (data.validationResults.qualityScore > 85) {
            practices.push({
                type: 'validation',
                practice: 'High quality validation achieved',
                details: {
                    validProductsRatio: data.validationResults.validatedProducts.length / 
                        (data.validationResults.validatedProducts.length + data.validationResults.invalidProducts.length)
                }
            });
        }

        return practices;
    }

    async identifySuccessfulPatterns(supplier, patterns) {
        if (patterns.length < 5) return; // Need minimum data for pattern recognition

        try {
            // Analyze patterns for common success factors
            const recentPatterns = patterns.slice(-20); // Last 20 patterns

            // Find most successful price column types
            const priceColumnSuccess = {};
            recentPatterns.forEach(pattern => {
                pattern.priceColumnsFound.forEach(col => {
                    if (!priceColumnSuccess[col.type]) {
                        priceColumnSuccess[col.type] = { count: 0, totalConfidence: 0 };
                    }
                    priceColumnSuccess[col.type].count++;
                    priceColumnSuccess[col.type].totalConfidence += pattern.confidenceScore;
                });
            });

            // Identify best performing price column types
            const bestPriceColumns = Object.entries(priceColumnSuccess)
                .map(([type, data]) => ({
                    type,
                    averageConfidence: data.totalConfidence / data.count,
                    frequency: data.count
                }))
                .sort((a, b) => b.averageConfidence - a.averageConfidence);

            if (bestPriceColumns.length > 0) {
                await this.suggestConfigurationImprovement(supplier, {
                    type: 'price_column_priority',
                    suggestion: bestPriceColumns[0].type,
                    confidence: bestPriceColumns[0].averageConfidence,
                    evidence: `Based on ${bestPriceColumns[0].frequency} successful extractions`
                });
            }

        } catch (error) {
            this.logger.error('Pattern identification failed:', error);
        }
    }

    async suggestConfigurationImprovement(supplier, improvement) {
        try {
            this.logger.info(`💡 Configuration improvement suggested for ${supplier}:`, improvement);

            // Store improvement suggestion
            const improvementKey = `${supplier}_${improvement.type}`;
            this.patterns.improvements.set(improvementKey, {
                ...improvement,
                timestamp: new Date().toISOString(),
                applied: false
            });

            this.stats.configurationImprovements++;

            // In full implementation, this could automatically apply improvements
            // or queue them for manual review

        } catch (error) {
            this.logger.error('Configuration improvement suggestion failed:', error);
        }
    }

    async generateImprovements(supplier, learningData) {
        const improvements = [];

        try {
            // Analyze current performance
            const qualityScore = learningData.validationResults.qualityScore;
            const confidenceScore = learningData.extractionResults.confidenceScore;

            // Suggest improvements based on performance
            if (qualityScore < 70) {
                improvements.push({
                    type: 'quality',
                    priority: 'high',
                    suggestion: 'Consider reviewing supplier configuration - low quality score detected',
                    currentScore: qualityScore,
                    targetScore: 85
                });
            }

            if (confidenceScore < 60) {
                improvements.push({
                    type: 'extraction',
                    priority: 'high',
                    suggestion: 'Extraction confidence is low - document format may have changed',
                    currentScore: confidenceScore,
                    targetScore: 80
                });
            }

            // Check for Old RRP usage
            const oldRRPWarnings = learningData.validationResults.warnings
                .filter(w => w.type === 'old_rrp_used');

            if (oldRRPWarnings.length > 0) {
                improvements.push({
                    type: 'pricing',
                    priority: 'medium',
                    suggestion: 'Old RRP prices detected - verify supplier is providing current pricing',
                    affectedProducts: oldRRPWarnings.length
                });
            }

            // Suggest pattern-based improvements
            const patternImprovements = await this.getPatternBasedImprovements(supplier);
            improvements.push(...patternImprovements);

        } catch (error) {
            this.logger.error('Improvement generation failed:', error);
        }

        return improvements;
    }

    async getPatternBasedImprovements(supplier) {
        const improvements = [];

        try {
            const improvementKey = `${supplier}_price_column_priority`;
            const storedImprovement = this.patterns.improvements.get(improvementKey);

            if (storedImprovement && !storedImprovement.applied) {
                improvements.push({
                    type: 'configuration',
                    priority: 'medium',
                    suggestion: `Consider prioritizing '${storedImprovement.suggestion}' price columns`,
                    evidence: storedImprovement.evidence,
                    confidence: storedImprovement.confidence
                });
            }

        } catch (error) {
            this.logger.error('Pattern-based improvement retrieval failed:', error);
        }

        return improvements;
    }

    async saveLearningData(learningData) {
        try {
            // Save learning data to database
            // In full implementation, this would use a dedicated learning_data table

            this.logger.debug('💾 Saving learning data for:', learningData.supplier);

            // Placeholder for database save
            // await this.supabase.from('learning_data').upsert([learningData]);

        } catch (error) {
            this.logger.error('Learning data save failed:', error);
        }
    }

    async getLearningInsights(supplier = null) {
        try {
            const insights = {
                overallStats: this.stats,
                supplierInsights: {},
                recommendations: []
            };

            if (supplier) {
                // Get supplier-specific insights
                const supplierPatterns = this.patterns.successful.get(`${supplier}_extraction`) || [];
                const supplierValidation = this.patterns.successful.get(`${supplier}_validation`) || [];

                insights.supplierInsights[supplier] = {
                    extractionPatterns: supplierPatterns.length,
                    averageConfidence: supplierPatterns.length > 0 ? 
                        supplierPatterns.reduce((sum, p) => sum + p.confidenceScore, 0) / supplierPatterns.length : 0,
                    validationPatterns: supplierValidation.length,
                    averageQuality: supplierValidation.length > 0 ?
                        supplierValidation.reduce((sum, p) => sum + p.qualityScore, 0) / supplierValidation.length : 0
                };
            }

            return insights;

        } catch (error) {
            this.logger.error('Learning insights retrieval failed:', error);
            return { error: error.message };
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
            patternsStored: {
                successful: this.patterns.successful.size,
                failed: this.patterns.failed.size,
                improvements: this.patterns.improvements.size
            }
        };
    }

    async getMetrics() {
        return this.stats;
    }

    async shutdown() {
        this.logger.info('🛑 Shutting down Learning Agent...');

        // Save current patterns to database before shutdown
        try {
            await this.savePatternsToDatabase();
        } catch (error) {
            this.logger.error('Failed to save patterns during shutdown:', error);
        }

        this.healthy = false;
    }

    async savePatternsToDatabase() {
        // Save learning patterns to database for persistence
        this.logger.info('💾 Saving learning patterns to database...');

        // Implementation would save patterns to database
        // for persistence across restarts
    }
}

module.exports = LearningAgent;
