
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Template Manager for Audico Quoting System
 * Learns and adapts to different supplier pricelist formats automatically
 */
class TemplateManager {
    constructor(options = {}) {
        this.supabase = options.supabase;
        this.openai = options.openai;
        this.anthropic = options.anthropic;

        // Template storage
        this.templates = new Map();
        this.supplierProfiles = new Map();

        // Learning parameters
        this.learningThreshold = options.learningThreshold || 0.8;
        this.minSamplesForLearning = options.minSamplesForLearning || 3;
        this.adaptationRate = options.adaptationRate || 0.1;

        // Template matching weights
        this.matchingWeights = {
            layoutType: 0.3,
            pricePatterns: 0.25,
            columnStructure: 0.2,
            fileFormat: 0.15,
            supplierHistory: 0.1
        };

        // Performance tracking
        this.performanceStats = {
            templatesCreated: 0,
            templatesUpdated: 0,
            successfulMatches: 0,
            failedMatches: 0,
            learningEvents: 0
        };

        this.initializeDefaultTemplates();
        this.loadExistingTemplates();
    }

    /**
     * Find the best template for a supplier and layout
     */
    async findBestTemplate(supplier, layoutInfo) {
        try {
            console.log(`🔍 Finding best template for ${supplier} with layout: ${layoutInfo.type}`);

            // Get supplier profile
            const supplierProfile = await this.getSupplierProfile(supplier);

            // Find matching templates
            const candidates = await this.findTemplateCandidates(supplier, layoutInfo);

            if (candidates.length === 0) {
                console.log(`📝 No existing templates found, creating new template for ${supplier}`);
                return await this.createNewTemplate(supplier, layoutInfo, supplierProfile);
            }

            // Score and rank candidates
            const scoredCandidates = await this.scoreTemplateCandidates(candidates, layoutInfo, supplierProfile);

            // Select best template
            const bestTemplate = scoredCandidates[0];

            if (bestTemplate.score > this.learningThreshold) {
                console.log(`✅ Found good template match: ${bestTemplate.template.name} (score: ${bestTemplate.score.toFixed(2)})`);
                this.performanceStats.successfulMatches++;
                return bestTemplate.template;
            } else {
                console.log(`⚠️ Best template score too low (${bestTemplate.score.toFixed(2)}), creating adaptive template`);
                return await this.createAdaptiveTemplate(supplier, layoutInfo, bestTemplate.template, supplierProfile);
            }

        } catch (error) {
            console.error('Template matching failed:', error);
            this.performanceStats.failedMatches++;
            return await this.createFallbackTemplate(supplier, layoutInfo);
        }
    }

    /**
     * Update template based on processing results
     */
    async updateTemplate(supplier, layoutInfo, processingResults) {
        try {
            console.log(`📊 Updating template for ${supplier} based on processing results`);

            const templateId = processingResults.templateUsed;
            const template = this.templates.get(templateId);

            if (!template) {
                console.warn(`Template ${templateId} not found for update`);
                return;
            }

            // Calculate success metrics
            const successMetrics = this.calculateSuccessMetrics(processingResults);

            // Update template performance
            template.performance = this.updatePerformanceMetrics(template.performance, successMetrics);

            // Adapt template if needed
            if (successMetrics.overallScore < this.learningThreshold) {
                await this.adaptTemplate(template, layoutInfo, processingResults);
            }

            // Update supplier profile
            await this.updateSupplierProfile(supplier, template, successMetrics);

            // Save changes
            await this.saveTemplate(template);

            this.performanceStats.templatesUpdated++;
            console.log(`✅ Template updated: ${template.name} (performance: ${template.performance.averageScore.toFixed(2)})`);

        } catch (error) {
            console.error('Template update failed:', error);
        }
    }

    /**
     * Create new template for supplier
     */
    async createNewTemplate(supplier, layoutInfo, supplierProfile) {
        try {
            const templateId = uuidv4();

            const template = {
                id: templateId,
                name: `${supplier}_${layoutInfo.type}_${Date.now()}`,
                supplier: supplier,
                layoutType: layoutInfo.type,
                subtype: layoutInfo.subtype,
                version: '1.0.0',
                created: new Date().toISOString(),
                updated: new Date().toISOString(),

                // Layout-specific configuration
                config: this.generateTemplateConfig(layoutInfo, supplierProfile),

                // Processing hints
                processingHints: layoutInfo.processingHints || {},

                // Performance tracking
                performance: {
                    usageCount: 0,
                    successCount: 0,
                    averageScore: 0.5,
                    averageProcessingTime: 0,
                    averageProductCount: 0,
                    lastUsed: null,
                    confidenceHistory: []
                },

                // Learning data
                learningData: {
                    layoutPatterns: [layoutInfo.characteristics],
                    successfulExtractions: [],
                    failedExtractions: [],
                    adaptationHistory: []
                },

                // Validation rules
                validationRules: this.generateValidationRules(supplier, layoutInfo),

                // Metadata
                metadata: {
                    fileFormat: layoutInfo.metadata?.fileSize ? 'pdf' : 'excel',
                    averageFileSize: layoutInfo.metadata?.fileSize || 0,
                    typicalPageCount: layoutInfo.metadata?.pages || 1,
                    commonCharacteristics: layoutInfo.characteristics
                }
            };

            this.templates.set(templateId, template);
            await this.saveTemplate(template);

            this.performanceStats.templatesCreated++;
            console.log(`✨ Created new template: ${template.name}`);

            return template;

        } catch (error) {
            console.error('Template creation failed:', error);
            return await this.createFallbackTemplate(supplier, layoutInfo);
        }
    }

    /**
     * Create adaptive template based on existing template
     */
    async createAdaptiveTemplate(supplier, layoutInfo, baseTemplate, supplierProfile) {
        try {
            const templateId = uuidv4();

            const adaptiveTemplate = {
                ...JSON.parse(JSON.stringify(baseTemplate)), // Deep copy
                id: templateId,
                name: `${supplier}_adaptive_${Date.now()}`,
                version: '1.0.0-adaptive',
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                baseTemplate: baseTemplate.id,

                // Merge configurations
                config: this.mergeConfigurations(baseTemplate.config, layoutInfo, supplierProfile),

                // Reset performance for new template
                performance: {
                    usageCount: 0,
                    successCount: 0,
                    averageScore: 0.6, // Slightly higher starting score for adaptive
                    averageProcessingTime: baseTemplate.performance.averageProcessingTime,
                    averageProductCount: baseTemplate.performance.averageProductCount,
                    lastUsed: null,
                    confidenceHistory: []
                },

                // Inherit and adapt learning data
                learningData: {
                    layoutPatterns: [...baseTemplate.learningData.layoutPatterns, layoutInfo.characteristics],
                    successfulExtractions: [],
                    failedExtractions: [],
                    adaptationHistory: [{
                        timestamp: new Date().toISOString(),
                        baseTemplate: baseTemplate.id,
                        reason: 'Low confidence match',
                        adaptations: this.identifyAdaptations(baseTemplate, layoutInfo)
                    }]
                }
            };

            this.templates.set(templateId, adaptiveTemplate);
            await this.saveTemplate(adaptiveTemplate);

            this.performanceStats.templatesCreated++;
            this.performanceStats.learningEvents++;

            console.log(`🔄 Created adaptive template: ${adaptiveTemplate.name} based on ${baseTemplate.name}`);

            return adaptiveTemplate;

        } catch (error) {
            console.error('Adaptive template creation failed:', error);
            return baseTemplate; // Fallback to base template
        }
    }

    /**
     * Find template candidates for matching
     */
    async findTemplateCandidates(supplier, layoutInfo) {
        const candidates = [];

        for (const [templateId, template] of this.templates) {
            // Skip if different supplier (unless it's a generic template)
            if (template.supplier !== supplier && template.supplier !== 'generic') {
                continue;
            }

            // Basic layout type matching
            if (template.layoutType === layoutInfo.type || template.layoutType === 'generic') {
                candidates.push(template);
            }
        }

        // Also check database for additional templates
        if (this.supabase) {
            try {
                const { data: dbTemplates, error } = await this.supabase
                    .from('processing_templates')
                    .select('*')
                    .or(`supplier.eq.${supplier},supplier.eq.generic`)
                    .or(`layout_type.eq.${layoutInfo.type},layout_type.eq.generic`);

                if (!error && dbTemplates) {
                    for (const dbTemplate of dbTemplates) {
                        const template = this.deserializeTemplate(dbTemplate);
                        if (!this.templates.has(template.id)) {
                            this.templates.set(template.id, template);
                            candidates.push(template);
                        }
                    }
                }
            } catch (error) {
                console.warn('Failed to load templates from database:', error);
            }
        }

        return candidates;
    }

    /**
     * Score template candidates
     */
    async scoreTemplateCandidates(candidates, layoutInfo, supplierProfile) {
        const scoredCandidates = [];

        for (const template of candidates) {
            const score = await this.calculateTemplateScore(template, layoutInfo, supplierProfile);

            scoredCandidates.push({
                template: template,
                score: score,
                breakdown: this.getScoreBreakdown(template, layoutInfo, supplierProfile)
            });
        }

        // Sort by score (highest first)
        return scoredCandidates.sort((a, b) => b.score - a.score);
    }

    /**
     * Calculate template matching score
     */
    async calculateTemplateScore(template, layoutInfo, supplierProfile) {
        let totalScore = 0;

        // Layout type matching
        const layoutScore = this.calculateLayoutScore(template, layoutInfo);
        totalScore += layoutScore * this.matchingWeights.layoutType;

        // Price pattern matching
        const priceScore = this.calculatePricePatternScore(template, layoutInfo);
        totalScore += priceScore * this.matchingWeights.pricePatterns;

        // Column structure matching (for Excel)
        const columnScore = this.calculateColumnStructureScore(template, layoutInfo);
        totalScore += columnScore * this.matchingWeights.columnStructure;

        // File format matching
        const formatScore = this.calculateFileFormatScore(template, layoutInfo);
        totalScore += formatScore * this.matchingWeights.fileFormat;

        // Supplier history bonus
        const historyScore = this.calculateSupplierHistoryScore(template, supplierProfile);
        totalScore += historyScore * this.matchingWeights.supplierHistory;

        // Performance bonus
        const performanceBonus = template.performance.averageScore * 0.1;
        totalScore += performanceBonus;

        return Math.min(1.0, totalScore);
    }

    /**
     * Calculate layout matching score
     */
    calculateLayoutScore(template, layoutInfo) {
        if (template.layoutType === layoutInfo.type) {
            if (template.subtype === layoutInfo.subtype) {
                return 1.0; // Perfect match
            } else {
                return 0.8; // Good match
            }
        } else if (template.layoutType === 'generic') {
            return 0.5; // Generic fallback
        } else {
            return 0.2; // Poor match
        }
    }

    /**
     * Calculate price pattern matching score
     */
    calculatePricePatternScore(template, layoutInfo) {
        if (!layoutInfo.characteristics || !layoutInfo.characteristics.pricePatterns) {
            return 0.5; // Neutral if no price pattern info
        }

        const templatePatterns = template.learningData.layoutPatterns[0]?.pricePatterns;
        const currentPatterns = layoutInfo.characteristics.pricePatterns;

        if (!templatePatterns) return 0.5;

        let matchScore = 0;
        let totalChecks = 0;

        // Compare price format preferences
        if (templatePatterns.primaryFormat === currentPatterns.primaryFormat) {
            matchScore += 0.3;
        }
        totalChecks += 0.3;

        // Compare New RRP vs Old RRP presence
        if (templatePatterns.hasNewRRP === currentPatterns.hasNewRRP) {
            matchScore += 0.2;
        }
        totalChecks += 0.2;

        if (templatePatterns.hasOldRRP === currentPatterns.hasOldRRP) {
            matchScore += 0.2;
        }
        totalChecks += 0.2;

        // Compare total price references (similar density)
        const templateDensity = templatePatterns.totalPriceReferences || 0;
        const currentDensity = currentPatterns.totalPriceReferences || 0;

        if (templateDensity > 0 && currentDensity > 0) {
            const densityRatio = Math.min(templateDensity, currentDensity) / Math.max(templateDensity, currentDensity);
            matchScore += densityRatio * 0.3;
        }
        totalChecks += 0.3;

        return totalChecks > 0 ? matchScore / totalChecks : 0.5;
    }

    /**
     * Calculate column structure matching score
     */
    calculateColumnStructureScore(template, layoutInfo) {
        // Only relevant for Excel files
        if (layoutInfo.metadata?.fileSize) return 0.5; // PDF file

        const templateConfig = template.config;
        const currentCharacteristics = layoutInfo.characteristics;

        if (!templateConfig.columnMappings || !currentCharacteristics.sheets) {
            return 0.5;
        }

        let matchScore = 0;
        let totalChecks = 0;

        // Compare sheet count
        const templateSheetCount = templateConfig.expectedSheetCount || 1;
        const currentSheetCount = currentCharacteristics.sheetCount || 1;

        if (templateSheetCount === currentSheetCount) {
            matchScore += 0.3;
        } else if (Math.abs(templateSheetCount - currentSheetCount) <= 1) {
            matchScore += 0.15;
        }
        totalChecks += 0.3;

        // Compare primary sheet characteristics
        const primarySheet = currentCharacteristics.sheets?.[0];
        if (primarySheet && templateConfig.primarySheetConfig) {
            const sheetConfig = templateConfig.primarySheetConfig;

            // Compare column count
            if (Math.abs((sheetConfig.expectedColumns || 0) - (primarySheet.columnCount || 0)) <= 2) {
                matchScore += 0.2;
            }
            totalChecks += 0.2;

            // Compare header presence
            if (sheetConfig.hasHeaders === primarySheet.hasHeaders?.detected) {
                matchScore += 0.2;
            }
            totalChecks += 0.2;

            // Compare data quality
            const qualityDiff = Math.abs((sheetConfig.expectedDataQuality || 0.5) - (primarySheet.dataStructure?.dataQuality || 0.5));
            if (qualityDiff < 0.2) {
                matchScore += 0.3;
            }
            totalChecks += 0.3;
        }

        return totalChecks > 0 ? matchScore / totalChecks : 0.5;
    }

    /**
     * Calculate file format matching score
     */
    calculateFileFormatScore(template, layoutInfo) {
        const templateFormat = template.metadata.fileFormat;
        const currentFormat = layoutInfo.metadata?.fileSize ? 'pdf' : 'excel';

        if (templateFormat === currentFormat) {
            return 1.0;
        } else if (templateFormat === 'generic') {
            return 0.6;
        } else {
            return 0.3;
        }
    }

    /**
     * Calculate supplier history score
     */
    calculateSupplierHistoryScore(template, supplierProfile) {
        if (!supplierProfile) return 0.5;

        // Bonus for templates that have worked well with this supplier
        const supplierSuccessRate = supplierProfile.templateSuccessRates?.[template.id] || 0;

        // Bonus for recently used templates
        const daysSinceLastUse = template.performance.lastUsed 
            ? (Date.now() - new Date(template.performance.lastUsed).getTime()) / (1000 * 60 * 60 * 24)
            : 365;

        const recencyBonus = Math.max(0, 1 - (daysSinceLastUse / 30)); // Decay over 30 days

        return (supplierSuccessRate * 0.7) + (recencyBonus * 0.3);
    }

    /**
     * Generate template configuration
     */
    generateTemplateConfig(layoutInfo, supplierProfile) {
        const config = {
            layoutType: layoutInfo.type,
            subtype: layoutInfo.subtype,
            confidence: layoutInfo.confidence,

            // Processing strategy
            processingStrategy: this.determineProcessingStrategy(layoutInfo),

            // Column mappings (for Excel)
            columnMappings: this.generateColumnMappings(layoutInfo),

            // Price extraction settings
            priceExtractionConfig: this.generatePriceExtractionConfig(layoutInfo),

            // Validation settings
            validationConfig: this.generateValidationConfig(layoutInfo, supplierProfile),

            // Performance expectations
            expectedPerformance: {
                minConfidence: 0.7,
                expectedProductCount: this.estimateProductCount(layoutInfo),
                maxProcessingTime: this.estimateProcessingTime(layoutInfo)
            }
        };

        // Add layout-specific configurations
        switch (layoutInfo.type) {
            case 'table':
                config.tableConfig = this.generateTableConfig(layoutInfo);
                break;
            case 'multi-column':
                config.columnConfig = this.generateMultiColumnConfig(layoutInfo);
                break;
            case 'catalog':
                config.catalogConfig = this.generateCatalogConfig(layoutInfo);
                break;
            case 'excel':
                config.excelConfig = this.generateExcelConfig(layoutInfo);
                break;
        }

        return config;
    }

    /**
     * Generate price extraction configuration
     */
    generatePriceExtractionConfig(layoutInfo) {
        const pricePatterns = layoutInfo.characteristics?.pricePatterns;

        if (!pricePatterns) {
            return {
                strategy: 'generic',
                priorityOrder: ['New RRP', 'RRP', 'Price'],
                confidenceThreshold: 0.6
            };
        }

        const config = {
            strategy: 'pattern-based',
            primaryFormat: pricePatterns.primaryFormat,
            confidenceThreshold: 0.7,
            priorityOrder: []
        };

        // Build priority order based on detected patterns
        if (pricePatterns.hasNewRRP) {
            config.priorityOrder.push('New RRP');
        }
        if (pricePatterns.hasOldRRP) {
            config.priorityOrder.push('Old RRP');
        }
        if (pricePatterns.hasCostPrice) {
            config.priorityOrder.push('Cost Price');
        }
        if (pricePatterns.hasRetailPrice) {
            config.priorityOrder.push('Retail Price');
        }

        // Add generic price as fallback
        config.priorityOrder.push('RRP', 'Price');

        return config;
    }

    /**
     * Adapt existing template based on new data
     */
    async adaptTemplate(template, layoutInfo, processingResults) {
        try {
            console.log(`🔄 Adapting template: ${template.name}`);

            const adaptations = [];

            // Analyze what went wrong
            const issues = this.analyzeProcessingIssues(processingResults);

            // Adapt configuration based on issues
            for (const issue of issues) {
                const adaptation = await this.createAdaptation(template, issue, layoutInfo);
                if (adaptation) {
                    adaptations.push(adaptation);
                    this.applyAdaptation(template, adaptation);
                }
            }

            // Update learning data
            template.learningData.adaptationHistory.push({
                timestamp: new Date().toISOString(),
                issues: issues,
                adaptations: adaptations,
                processingResults: {
                    confidence: processingResults.confidence,
                    extractedCount: processingResults.extractedCount,
                    processingTime: processingResults.processingTime
                }
            });

            // Update version
            const versionParts = template.version.split('.');
            versionParts[2] = String(parseInt(versionParts[2]) + 1);
            template.version = versionParts.join('.');
            template.updated = new Date().toISOString();

            this.performanceStats.learningEvents++;

            console.log(`✅ Template adapted with ${adaptations.length} changes`);

        } catch (error) {
            console.error('Template adaptation failed:', error);
        }
    }

    /**
     * Analyze processing issues
     */
    analyzeProcessingIssues(processingResults) {
        const issues = [];

        // Low confidence
        if (processingResults.confidence < 0.7) {
            issues.push({
                type: 'low_confidence',
                severity: 'medium',
                value: processingResults.confidence,
                description: 'Overall extraction confidence is low'
            });
        }

        // Low extraction count
        if (processingResults.extractedCount < 5) {
            issues.push({
                type: 'low_extraction_count',
                severity: 'high',
                value: processingResults.extractedCount,
                description: 'Very few products were extracted'
            });
        }

        // High processing time
        if (processingResults.processingTime > 30000) { // 30 seconds
            issues.push({
                type: 'slow_processing',
                severity: 'low',
                value: processingResults.processingTime,
                description: 'Processing took longer than expected'
            });
        }

        return issues;
    }

    /**
     * Create adaptation for specific issue
     */
    async createAdaptation(template, issue, layoutInfo) {
        switch (issue.type) {
            case 'low_confidence':
                return {
                    type: 'confidence_adjustment',
                    target: 'validationConfig.confidenceThreshold',
                    oldValue: template.config.validationConfig?.confidenceThreshold || 0.7,
                    newValue: Math.max(0.5, (template.config.validationConfig?.confidenceThreshold || 0.7) - 0.1),
                    reason: 'Lowering confidence threshold due to low extraction confidence'
                };

            case 'low_extraction_count':
                return {
                    type: 'extraction_strategy_adjustment',
                    target: 'processingStrategy',
                    oldValue: template.config.processingStrategy,
                    newValue: 'aggressive',
                    reason: 'Switching to more aggressive extraction strategy'
                };

            case 'slow_processing':
                return {
                    type: 'performance_optimization',
                    target: 'expectedPerformance.maxProcessingTime',
                    oldValue: template.config.expectedPerformance?.maxProcessingTime || 15000,
                    newValue: Math.min(60000, (template.config.expectedPerformance?.maxProcessingTime || 15000) * 1.5),
                    reason: 'Adjusting processing time expectations'
                };

            default:
                return null;
        }
    }

    /**
     * Apply adaptation to template
     */
    applyAdaptation(template, adaptation) {
        const targetPath = adaptation.target.split('.');
        let current = template.config;

        // Navigate to the target property
        for (let i = 0; i < targetPath.length - 1; i++) {
            if (!current[targetPath[i]]) {
                current[targetPath[i]] = {};
            }
            current = current[targetPath[i]];
        }

        // Apply the change
        const finalKey = targetPath[targetPath.length - 1];
        current[finalKey] = adaptation.newValue;

        console.log(`   Applied adaptation: ${adaptation.target} = ${adaptation.newValue} (was: ${adaptation.oldValue})`);
    }

    /**
     * Get or create supplier profile
     */
    async getSupplierProfile(supplier) {
        if (this.supplierProfiles.has(supplier)) {
            return this.supplierProfiles.get(supplier);
        }

        // Load from database if available
        if (this.supabase) {
            try {
                const { data: profile, error } = await this.supabase
                    .from('supplier_profiles')
                    .select('*')
                    .eq('supplier', supplier)
                    .single();

                if (!error && profile) {
                    const supplierProfile = this.deserializeSupplierProfile(profile);
                    this.supplierProfiles.set(supplier, supplierProfile);
                    return supplierProfile;
                }
            } catch (error) {
                console.warn(`Failed to load supplier profile for ${supplier}:`, error);
            }
        }

        // Create new profile
        const newProfile = this.createSupplierProfile(supplier);
        this.supplierProfiles.set(supplier, newProfile);
        await this.saveSupplierProfile(newProfile);

        return newProfile;
    }

    /**
     * Create new supplier profile
     */
    createSupplierProfile(supplier) {
        return {
            supplier: supplier,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),

            // Processing history
            processingHistory: {
                totalFiles: 0,
                successfulFiles: 0,
                totalProducts: 0,
                averageConfidence: 0,
                averageProcessingTime: 0
            },

            // Template usage
            templateSuccessRates: {},
            preferredTemplates: [],

            // Common patterns
            commonPatterns: {
                fileFormats: {},
                layoutTypes: {},
                priceFormats: {},
                documentStructures: {}
            },

            // Quality metrics
            qualityMetrics: {
                consistencyScore: 0.5,
                reliabilityScore: 0.5,
                adaptabilityScore: 0.5
            },

            // Learning preferences
            learningPreferences: {
                adaptationRate: this.adaptationRate,
                confidenceThreshold: 0.7,
                enableAggressiveLearning: false
            }
        };
    }

    /**
     * Update supplier profile
     */
    async updateSupplierProfile(supplier, template, successMetrics) {
        try {
            const profile = await this.getSupplierProfile(supplier);

            // Update processing history
            profile.processingHistory.totalFiles++;
            if (successMetrics.overallScore > 0.6) {
                profile.processingHistory.successfulFiles++;
            }

            profile.processingHistory.totalProducts += successMetrics.extractedCount || 0;
            profile.processingHistory.averageConfidence = this.updateAverage(
                profile.processingHistory.averageConfidence,
                successMetrics.confidence || 0,
                profile.processingHistory.totalFiles
            );

            profile.processingHistory.averageProcessingTime = this.updateAverage(
                profile.processingHistory.averageProcessingTime,
                successMetrics.processingTime || 0,
                profile.processingHistory.totalFiles
            );

            // Update template success rates
            const templateId = template.id;
            const currentRate = profile.templateSuccessRates[templateId] || 0;
            const newRate = successMetrics.overallScore > 0.6 ? 1 : 0;
            profile.templateSuccessRates[templateId] = this.updateAverage(currentRate, newRate, template.performance.usageCount);

            // Update common patterns
            this.updateCommonPatterns(profile, template, successMetrics);

            // Update quality metrics
            this.updateQualityMetrics(profile, successMetrics);

            profile.updated = new Date().toISOString();

            await this.saveSupplierProfile(profile);

        } catch (error) {
            console.error('Failed to update supplier profile:', error);
        }
    }

    /**
     * Update common patterns in supplier profile
     */
    updateCommonPatterns(profile, template, successMetrics) {
        const patterns = profile.commonPatterns;

        // File format
        const fileFormat = template.metadata.fileFormat;
        patterns.fileFormats[fileFormat] = (patterns.fileFormats[fileFormat] || 0) + 1;

        // Layout type
        const layoutType = template.layoutType;
        patterns.layoutTypes[layoutType] = (patterns.layoutTypes[layoutType] || 0) + 1;

        // Price format (if available)
        if (template.config.priceExtractionConfig?.primaryFormat) {
            const priceFormat = template.config.priceExtractionConfig.primaryFormat;
            patterns.priceFormats[priceFormat] = (patterns.priceFormats[priceFormat] || 0) + 1;
        }
    }

    /**
     * Update quality metrics
     */
    updateQualityMetrics(profile, successMetrics) {
        const metrics = profile.qualityMetrics;
        const alpha = 0.1; // Learning rate

        // Consistency: how consistent are the results
        const consistencyScore = successMetrics.confidence || 0;
        metrics.consistencyScore = metrics.consistencyScore * (1 - alpha) + consistencyScore * alpha;

        // Reliability: how often do we get good results
        const reliabilityScore = successMetrics.overallScore > 0.6 ? 1 : 0;
        metrics.reliabilityScore = metrics.reliabilityScore * (1 - alpha) + reliabilityScore * alpha;

        // Adaptability: how well do we adapt to new formats
        const adaptabilityScore = successMetrics.templateWasAdapted ? 0.8 : 0.6;
        metrics.adaptabilityScore = metrics.adaptabilityScore * (1 - alpha) + adaptabilityScore * alpha;
    }

    /**
     * Calculate success metrics from processing results
     */
    calculateSuccessMetrics(processingResults) {
        const metrics = {
            confidence: processingResults.confidence || 0,
            extractedCount: processingResults.extractedCount || 0,
            processingTime: processingResults.processingTime || 0,
            overallScore: 0,
            templateWasAdapted: false
        };

        // Calculate overall score
        let score = 0;

        // Confidence component (40%)
        score += (metrics.confidence || 0) * 0.4;

        // Extraction success component (40%)
        const extractionSuccess = metrics.extractedCount > 0 ? Math.min(1.0, metrics.extractedCount / 10) : 0;
        score += extractionSuccess * 0.4;

        // Processing time component (20%) - faster is better
        const timeScore = metrics.processingTime > 0 ? Math.max(0, 1 - (metrics.processingTime / 60000)) : 0.5;
        score += timeScore * 0.2;

        metrics.overallScore = score;

        return metrics;
    }

    /**
     * Update performance metrics
     */
    updatePerformanceMetrics(currentPerformance, successMetrics) {
        const updated = { ...currentPerformance };

        updated.usageCount++;
        if (successMetrics.overallScore > 0.6) {
            updated.successCount++;
        }

        updated.averageScore = this.updateAverage(
            updated.averageScore,
            successMetrics.overallScore,
            updated.usageCount
        );

        updated.averageProcessingTime = this.updateAverage(
            updated.averageProcessingTime,
            successMetrics.processingTime,
            updated.usageCount
        );

        updated.averageProductCount = this.updateAverage(
            updated.averageProductCount,
            successMetrics.extractedCount,
            updated.usageCount
        );

        updated.lastUsed = new Date().toISOString();

        // Keep confidence history (last 10 entries)
        updated.confidenceHistory.push(successMetrics.confidence);
        if (updated.confidenceHistory.length > 10) {
            updated.confidenceHistory.shift();
        }

        return updated;
    }

    /**
     * Initialize default templates
     */
    initializeDefaultTemplates() {
        // Generic PDF template
        const genericPDFTemplate = {
            id: 'generic-pdf',
            name: 'Generic PDF Template',
            supplier: 'generic',
            layoutType: 'generic',
            subtype: 'generic',
            version: '1.0.0',
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            config: {
                layoutType: 'generic',
                processingStrategy: 'conservative',
                priceExtractionConfig: {
                    strategy: 'generic',
                    priorityOrder: ['New RRP', 'RRP', 'Price'],
                    confidenceThreshold: 0.6
                },
                validationConfig: {
                    minProductNameLength: 3,
                    minPrice: 1,
                    maxPrice: 1000000,
                    confidenceThreshold: 0.6
                }
            },
            performance: {
                usageCount: 0,
                successCount: 0,
                averageScore: 0.5,
                averageProcessingTime: 15000,
                averageProductCount: 10,
                lastUsed: null,
                confidenceHistory: []
            },
            learningData: {
                layoutPatterns: [],
                successfulExtractions: [],
                failedExtractions: [],
                adaptationHistory: []
            },
            validationRules: {
                required: ['name', 'price'],
                optional: ['description', 'specifications'],
                priceRange: { min: 1, max: 1000000 }
            },
            metadata: {
                fileFormat: 'pdf',
                averageFileSize: 0,
                typicalPageCount: 1,
                commonCharacteristics: {}
            }
        };

        // Generic Excel template
        const genericExcelTemplate = {
            ...genericPDFTemplate,
            id: 'generic-excel',
            name: 'Generic Excel Template',
            metadata: {
                ...genericPDFTemplate.metadata,
                fileFormat: 'excel'
            }
        };

        this.templates.set('generic-pdf', genericPDFTemplate);
        this.templates.set('generic-excel', genericExcelTemplate);

        console.log('📚 Initialized default templates');
    }

    /**
     * Helper methods
     */

    updateAverage(currentAverage, newValue, count) {
        if (count <= 1) return newValue;
        return ((currentAverage * (count - 1)) + newValue) / count;
    }

    determineProcessingStrategy(layoutInfo) {
        if (layoutInfo.confidence > 0.8) {
            return 'conservative';
        } else if (layoutInfo.confidence > 0.5) {
            return 'balanced';
        } else {
            return 'aggressive';
        }
    }

    generateColumnMappings(layoutInfo) {
        // Generate expected column mappings based on layout analysis
        const mappings = {};

        if (layoutInfo.characteristics?.sheets) {
            const primarySheet = layoutInfo.characteristics.sheets[0];
            if (primarySheet?.priceColumns) {
                mappings.priceColumns = primarySheet.priceColumns.map(col => ({
                    column: col.column,
                    type: col.header,
                    confidence: col.confidence
                }));
            }
            if (primarySheet?.productColumns) {
                mappings.productColumns = primarySheet.productColumns.map(col => ({
                    column: col.column,
                    type: col.header,
                    confidence: col.confidence
                }));
            }
        }

        return mappings;
    }

    generateValidationConfig(layoutInfo, supplierProfile) {
        const config = {
            minProductNameLength: 3,
            minPrice: 1,
            maxPrice: 1000000,
            confidenceThreshold: 0.7,
            enableStrictValidation: false
        };

        // Adjust based on supplier profile
        if (supplierProfile?.qualityMetrics?.consistencyScore > 0.8) {
            config.confidenceThreshold = 0.8;
            config.enableStrictValidation = true;
        }

        return config;
    }

    estimateProductCount(layoutInfo) {
        if (layoutInfo.characteristics?.sheets) {
            const totalRows = layoutInfo.characteristics.sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0);
            return Math.max(1, Math.floor(totalRows * 0.8)); // Assume 80% are product rows
        } else if (layoutInfo.characteristics?.totalLines) {
            return Math.max(1, Math.floor(layoutInfo.characteristics.totalLines * 0.3)); // Assume 30% are product lines
        }
        return 10; // Default estimate
    }

    estimateProcessingTime(layoutInfo) {
        const baseTime = 5000; // 5 seconds base

        if (layoutInfo.metadata?.fileSize) {
            // PDF processing time based on file size
            const sizeMultiplier = Math.max(1, layoutInfo.metadata.fileSize / (1024 * 1024)); // MB
            return baseTime * sizeMultiplier;
        } else if (layoutInfo.characteristics?.sheets) {
            // Excel processing time based on sheet count and rows
            const totalRows = layoutInfo.characteristics.sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0);
            return baseTime + (totalRows * 10); // 10ms per row
        }

        return baseTime;
    }

    generateTableConfig(layoutInfo) {
        return {
            expectedColumns: layoutInfo.characteristics?.averageLineLength ? Math.floor(layoutInfo.characteristics.averageLineLength / 20) : 3,
            hasHeaders: layoutInfo.characteristics?.headerFooterRatio < 0.1,
            separatorPattern: layoutInfo.characteristics?.hasTabularData?.detected ? 'tabs' : 'spaces'
        };
    }

    generateMultiColumnConfig(layoutInfo) {
        return {
            columnCount: layoutInfo.characteristics?.hasMultiColumn?.columnBreaks?.length || 2,
            reconstructionStrategy: 'alignment-based',
            mergeThreshold: 0.8
        };
    }

    generateCatalogConfig(layoutInfo) {
        return {
            productBlockSize: 3, // Average lines per product
            hasImages: layoutInfo.characteristics?.hasCatalogStructure?.score > 10,
            descriptionLength: 'medium'
        };
    }

    generateExcelConfig(layoutInfo) {
        const config = {
            multiSheet: layoutInfo.characteristics?.sheetCount > 1,
            expectedSheetCount: layoutInfo.characteristics?.sheetCount || 1,
            primarySheetConfig: {}
        };

        if (layoutInfo.characteristics?.sheets?.[0]) {
            const primarySheet = layoutInfo.characteristics.sheets[0];
            config.primarySheetConfig = {
                hasHeaders: primarySheet.hasHeaders?.detected || false,
                expectedColumns: primarySheet.columnCount || 5,
                expectedDataQuality: primarySheet.dataStructure?.dataQuality || 0.5,
                priceColumnCount: primarySheet.priceColumns?.length || 1
            };
        }

        return config;
    }

    mergeConfigurations(baseConfig, layoutInfo, supplierProfile) {
        const merged = JSON.parse(JSON.stringify(baseConfig)); // Deep copy

        // Merge layout-specific adjustments
        if (layoutInfo.processingHints) {
            merged.processingHints = {
                ...merged.processingHints,
                ...layoutInfo.processingHints
            };
        }

        // Merge supplier-specific preferences
        if (supplierProfile?.learningPreferences) {
            merged.validationConfig = {
                ...merged.validationConfig,
                confidenceThreshold: supplierProfile.learningPreferences.confidenceThreshold
            };
        }

        return merged;
    }

    identifyAdaptations(baseTemplate, layoutInfo) {
        const adaptations = [];

        // Compare layout types
        if (baseTemplate.layoutType !== layoutInfo.type) {
            adaptations.push(`Layout type changed from ${baseTemplate.layoutType} to ${layoutInfo.type}`);
        }

        // Compare confidence levels
        if (Math.abs(baseTemplate.config.validationConfig.confidenceThreshold - layoutInfo.confidence) > 0.2) {
            adaptations.push(`Confidence threshold adjusted for layout confidence: ${layoutInfo.confidence}`);
        }

        return adaptations;
    }

    getScoreBreakdown(template, layoutInfo, supplierProfile) {
        return {
            layoutScore: this.calculateLayoutScore(template, layoutInfo),
            priceScore: this.calculatePricePatternScore(template, layoutInfo),
            columnScore: this.calculateColumnStructureScore(template, layoutInfo),
            formatScore: this.calculateFileFormatScore(template, layoutInfo),
            historyScore: this.calculateSupplierHistoryScore(template, supplierProfile),
            performanceBonus: template.performance.averageScore * 0.1
        };
    }

    createFallbackTemplate(supplier, layoutInfo) {
        // Return appropriate generic template
        const fileFormat = layoutInfo.metadata?.fileSize ? 'pdf' : 'excel';
        const genericId = `generic-${fileFormat}`;

        return this.templates.get(genericId) || this.templates.get('generic-pdf');
    }

    /**
     * Persistence methods
     */

    async saveTemplate(template) {
        try {
            if (this.supabase) {
                const serialized = this.serializeTemplate(template);

                const { error } = await this.supabase
                    .from('processing_templates')
                    .upsert(serialized);

                if (error) {
                    console.warn('Failed to save template to database:', error);
                }
            }

            // Also save to local storage/file system if needed
            // await fs.promises.writeFile(`templates/${template.id}.json`, JSON.stringify(template, null, 2));

        } catch (error) {
            console.error('Template save failed:', error);
        }
    }

    async saveSupplierProfile(profile) {
        try {
            if (this.supabase) {
                const serialized = this.serializeSupplierProfile(profile);

                const { error } = await this.supabase
                    .from('supplier_profiles')
                    .upsert(serialized);

                if (error) {
                    console.warn('Failed to save supplier profile to database:', error);
                }
            }
        } catch (error) {
            console.error('Supplier profile save failed:', error);
        }
    }

    async loadExistingTemplates() {
        try {
            if (this.supabase) {
                const { data: templates, error } = await this.supabase
                    .from('processing_templates')
                    .select('*');

                if (!error && templates) {
                    for (const templateData of templates) {
                        const template = this.deserializeTemplate(templateData);
                        this.templates.set(template.id, template);
                    }

                    console.log(`📚 Loaded ${templates.length} existing templates from database`);
                }
            }
        } catch (error) {
            console.warn('Failed to load existing templates:', error);
        }
    }

    serializeTemplate(template) {
        return {
            id: template.id,
            name: template.name,
            supplier: template.supplier,
            layout_type: template.layoutType,
            subtype: template.subtype,
            version: template.version,
            created: template.created,
            updated: template.updated,
            config: JSON.stringify(template.config),
            processing_hints: JSON.stringify(template.processingHints),
            performance: JSON.stringify(template.performance),
            learning_data: JSON.stringify(template.learningData),
            validation_rules: JSON.stringify(template.validationRules),
            metadata: JSON.stringify(template.metadata)
        };
    }

    deserializeTemplate(data) {
        return {
            id: data.id,
            name: data.name,
            supplier: data.supplier,
            layoutType: data.layout_type,
            subtype: data.subtype,
            version: data.version,
            created: data.created,
            updated: data.updated,
            config: JSON.parse(data.config || '{}'),
            processingHints: JSON.parse(data.processing_hints || '{}'),
            performance: JSON.parse(data.performance || '{}'),
            learningData: JSON.parse(data.learning_data || '{}'),
            validationRules: JSON.parse(data.validation_rules || '{}'),
            metadata: JSON.parse(data.metadata || '{}')
        };
    }

    serializeSupplierProfile(profile) {
        return {
            supplier: profile.supplier,
            created: profile.created,
            updated: profile.updated,
            processing_history: JSON.stringify(profile.processingHistory),
            template_success_rates: JSON.stringify(profile.templateSuccessRates),
            preferred_templates: JSON.stringify(profile.preferredTemplates),
            common_patterns: JSON.stringify(profile.commonPatterns),
            quality_metrics: JSON.stringify(profile.qualityMetrics),
            learning_preferences: JSON.stringify(profile.learningPreferences)
        };
    }

    deserializeSupplierProfile(data) {
        return {
            supplier: data.supplier,
            created: data.created,
            updated: data.updated,
            processingHistory: JSON.parse(data.processing_history || '{}'),
            templateSuccessRates: JSON.parse(data.template_success_rates || '{}'),
            preferredTemplates: JSON.parse(data.preferred_templates || '[]'),
            commonPatterns: JSON.parse(data.common_patterns || '{}'),
            qualityMetrics: JSON.parse(data.quality_metrics || '{}'),
            learningPreferences: JSON.parse(data.learning_preferences || '{}')
        };
    }

    /**
     * Get template statistics
     */
    getStats() {
        const templateStats = {};

        for (const [id, template] of this.templates) {
            const supplier = template.supplier;
            if (!templateStats[supplier]) {
                templateStats[supplier] = {
                    count: 0,
                    averageScore: 0,
                    totalUsage: 0,
                    layoutTypes: {}
                };
            }

            templateStats[supplier].count++;
            templateStats[supplier].averageScore += template.performance.averageScore;
            templateStats[supplier].totalUsage += template.performance.usageCount;

            const layoutType = template.layoutType;
            templateStats[supplier].layoutTypes[layoutType] = (templateStats[supplier].layoutTypes[layoutType] || 0) + 1;
        }

        // Calculate averages
        for (const supplier in templateStats) {
            const stats = templateStats[supplier];
            stats.averageScore = stats.averageScore / stats.count;
        }

        return {
            totalTemplates: this.templates.size,
            supplierStats: templateStats,
            performanceStats: this.performanceStats,
            supplierProfiles: this.supplierProfiles.size
        };
    }
}

module.exports = TemplateManager;
