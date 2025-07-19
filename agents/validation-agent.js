const winston = require('winston');

class ValidationAgent {
    constructor(config) {
        this.config = config;
        this.logger = config.logger;
        this.healthy = false;
        this.version = '1.0.0';

        this.stats = {
            validationsPerformed: 0,
            productsValidated: 0,
            issuesFound: 0,
            autoCorrections: 0,
            averageQualityScore: 0
        };

        // Validation rules
        this.validationRules = {
            price: {
                min: 1,
                max: 1000000,
                required: true
            },
            name: {
                minLength: 3,
                maxLength: 500,
                required: true,
                patterns: {
                    invalid: [/^\s*$/, /^[0-9]+$/] // Empty or only numbers
                }
            },
            category: {
                validValues: ['home', 'business', 'restaurant', 'gym', 'worship', 'education', 'club', 'uncategorized']
            }
        };
    }

    async initialize() {
        try {
            this.logger.info('✅ Initializing Validation Agent...');
            this.healthy = true;
            this.logger.info('✅ Validation Agent initialized');
        } catch (error) {
            this.logger.error('❌ Validation Agent initialization failed:', error);
            this.healthy = false;
        }
    }

    async validateProducts(jobData) {
        const startTime = Date.now();

        try {
            this.logger.info(`✅ Starting validation of ${jobData.products.length} products...`);

            const { products, supplierConfig, originalOptions } = jobData;

            const validationResults = {
                validatedProducts: [],
                invalidProducts: [],
                warnings: [],
                recommendations: [],
                qualityScore: 0,
                issuesSummary: {}
            };

            for (let i = 0; i < products.length; i++) {
                const product = products[i];
                const productValidation = await this.validateSingleProduct(product, i, supplierConfig);

                if (productValidation.isValid) {
                    validationResults.validatedProducts.push(productValidation.product);
                } else {
                    validationResults.invalidProducts.push({
                        product: product,
                        issues: productValidation.issues,
                        index: i
                    });
                }

                // Collect warnings and issues
                validationResults.warnings.push(...productValidation.warnings);

                // Update issues summary
                for (const issue of productValidation.issues) {
                    validationResults.issuesSummary[issue.type] = 
                        (validationResults.issuesSummary[issue.type] || 0) + 1;
                }
            }

            // Calculate quality score
            validationResults.qualityScore = this.calculateQualityScore(validationResults);

            // Generate recommendations
            validationResults.recommendations = this.generateRecommendations(validationResults, supplierConfig);

            const processingTime = Date.now() - startTime;
            this.updateStats(products.length, validationResults);

            this.logger.info(`✅ Validation completed: ${validationResults.validatedProducts.length}/${products.length} products valid`);

            return validationResults;

        } catch (error) {
            this.logger.error(`❌ Validation failed: ${error.message}`);
            throw error;
        }
    }

    async validateSingleProduct(product, index, supplierConfig) {
        const issues = [];
        const warnings = [];
        let isValid = true;
        let correctedProduct = { ...product };

        // Validate price
        const priceValidation = this.validatePrice(product.price || product.final_price);
        if (!priceValidation.valid) {
            issues.push({
                type: 'invalid_price',
                field: 'price',
                value: product.price,
                message: priceValidation.message,
                severity: 'high'
            });
            isValid = false;
        }

        // Validate product name
        const nameValidation = this.validateProductName(product.name);
        if (!nameValidation.valid) {
            if (nameValidation.canCorrect) {
                correctedProduct.name = nameValidation.correctedValue;
                warnings.push({
                    type: 'name_corrected',
                    field: 'name',
                    originalValue: product.name,
                    correctedValue: nameValidation.correctedValue,
                    message: nameValidation.message
                });
                this.stats.autoCorrections++;
            } else {
                issues.push({
                    type: 'invalid_name',
                    field: 'name',
                    value: product.name,
                    message: nameValidation.message,
                    severity: 'high'
                });
                isValid = false;
            }
        }

        // Validate category
        const categoryValidation = this.validateCategory(product.category);
        if (!categoryValidation.valid) {
            correctedProduct.category = categoryValidation.correctedValue || 'uncategorized';
            warnings.push({
                type: 'category_corrected',
                field: 'category',
                originalValue: product.category,
                correctedValue: correctedProduct.category,
                message: categoryValidation.message
            });
        }

        // Validate price type preference (New RRP vs Old RRP)
        if (product.priceType === 'Old RRP') {
            warnings.push({
                type: 'old_rrp_used',
                field: 'priceType',
                value: product.priceType,
                message: 'Using Old RRP instead of New RRP - verify pricing is current',
                severity: 'medium'
            });
        }

        // Business logic validations
        const businessValidation = this.validateBusinessLogic(correctedProduct, supplierConfig);
        issues.push(...businessValidation.issues);
        warnings.push(...businessValidation.warnings);

        if (businessValidation.issues.some(issue => issue.severity === 'high')) {
            isValid = false;
        }

        return {
            isValid,
            product: correctedProduct,
            issues,
            warnings
        };
    }

    validatePrice(price) {
        if (price === null || price === undefined) {
            return { valid: false, message: 'Price is required' };
        }

        const numericPrice = typeof price === 'number' ? price : parseFloat(price);

        if (isNaN(numericPrice)) {
            return { valid: false, message: 'Price must be a valid number' };
        }

        if (numericPrice < this.validationRules.price.min) {
            return { valid: false, message: `Price must be at least R${this.validationRules.price.min}` };
        }

        if (numericPrice > this.validationRules.price.max) {
            return { valid: false, message: `Price cannot exceed R${this.validationRules.price.max}` };
        }

        return { valid: true };
    }

    validateProductName(name) {
        if (!name || typeof name !== 'string') {
            return { valid: false, message: 'Product name is required' };
        }

        const trimmedName = name.trim();

        if (trimmedName.length < this.validationRules.name.minLength) {
            return { valid: false, message: `Product name must be at least ${this.validationRules.name.minLength} characters` };
        }

        if (trimmedName.length > this.validationRules.name.maxLength) {
            return { 
                valid: false, 
                canCorrect: true,
                correctedValue: trimmedName.substring(0, this.validationRules.name.maxLength),
                message: 'Product name truncated to maximum length'
            };
        }

        // Check for invalid patterns
        for (const pattern of this.validationRules.name.patterns.invalid) {
            if (pattern.test(trimmedName)) {
                return { valid: false, message: 'Product name contains invalid pattern' };
            }
        }

        // Auto-correct common issues
        if (trimmedName !== name) {
            return {
                valid: true,
                canCorrect: true,
                correctedValue: trimmedName,
                message: 'Removed leading/trailing whitespace'
            };
        }

        return { valid: true };
    }

    validateCategory(category) {
        if (!category) {
            return {
                valid: false,
                correctedValue: 'uncategorized',
                message: 'Category defaulted to uncategorized'
            };
        }

        const validCategories = this.validationRules.category.validValues;

        if (!validCategories.includes(category.toLowerCase())) {
            return {
                valid: false,
                correctedValue: 'uncategorized',
                message: `Invalid category '${category}' changed to 'uncategorized'`
            };
        }

        return { valid: true };
    }

    validateBusinessLogic(product, supplierConfig) {
        const issues = [];
        const warnings = [];

        // Check for duplicate products (basic check by name)
        // In a full implementation, this would check against existing database

        // Check for reasonable price ranges by category
        const categoryPriceRanges = {
            'home': { min: 50, max: 50000 },
            'business': { min: 100, max: 100000 },
            'restaurant': { min: 200, max: 20000 },
            'gym': { min: 150, max: 15000 },
            'worship': { min: 300, max: 30000 },
            'education': { min: 100, max: 10000 },
            'club': { min: 500, max: 50000 }
        };

        const priceRange = categoryPriceRanges[product.category];
        if (priceRange && product.final_price) {
            if (product.final_price < priceRange.min) {
                warnings.push({
                    type: 'price_below_category_range',
                    field: 'final_price',
                    value: product.final_price,
                    message: `Price R${product.final_price} is below typical range for ${product.category} category (R${priceRange.min}-R${priceRange.max})`,
                    severity: 'low'
                });
            } else if (product.final_price > priceRange.max) {
                warnings.push({
                    type: 'price_above_category_range',
                    field: 'final_price',
                    value: product.final_price,
                    message: `Price R${product.final_price} is above typical range for ${product.category} category (R${priceRange.min}-R${priceRange.max})`,
                    severity: 'medium'
                });
            }
        }

        // Check for missing specifications
        if (!product.specifications || product.specifications.trim().length === 0) {
            warnings.push({
                type: 'missing_specifications',
                field: 'specifications',
                message: 'Product specifications are missing',
                severity: 'low'
            });
        }

        return { issues, warnings };
    }

    calculateQualityScore(validationResults) {
        const totalProducts = validationResults.validatedProducts.length + validationResults.invalidProducts.length;
        if (totalProducts === 0) return 0;

        let score = 0;

        // Base score for valid products
        const validPercentage = (validationResults.validatedProducts.length / totalProducts) * 100;
        score += validPercentage * 0.6; // 60% weight for validity

        // Penalty for warnings
        const warningsPerProduct = validationResults.warnings.length / totalProducts;
        score -= Math.min(warningsPerProduct * 5, 20); // Max 20 point penalty

        // Bonus for auto-corrections
        const correctionsPerProduct = this.stats.autoCorrections / totalProducts;
        score += Math.min(correctionsPerProduct * 10, 15); // Max 15 point bonus

        // Penalty for high-severity issues
        const highSeverityIssues = Object.values(validationResults.issuesSummary)
            .reduce((sum, count) => sum + count, 0);
        score -= Math.min(highSeverityIssues * 2, 25); // Max 25 point penalty

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    generateRecommendations(validationResults, supplierConfig) {
        const recommendations = [];

        // Recommend configuration updates based on issues
        if (validationResults.issuesSummary.invalid_price > 0) {
            recommendations.push({
                type: 'configuration',
                priority: 'high',
                message: `Consider updating price column detection for ${supplierConfig.supplierName} - ${validationResults.issuesSummary.invalid_price} invalid prices found`
            });
        }

        if (validationResults.warnings.filter(w => w.type === 'old_rrp_used').length > 0) {
            recommendations.push({
                type: 'data_quality',
                priority: 'medium',
                message: 'Old RRP prices detected - verify supplier is providing current pricing'
            });
        }

        if (validationResults.validatedProducts.length < validationResults.invalidProducts.length) {
            recommendations.push({
                type: 'processing',
                priority: 'high',
                message: 'Low validation success rate - consider manual review or configuration adjustment'
            });
        }

        return recommendations;
    }

    updateStats(productCount, validationResults) {
        this.stats.validationsPerformed++;
        this.stats.productsValidated += productCount;
        this.stats.issuesFound += Object.values(validationResults.issuesSummary)
            .reduce((sum, count) => sum + count, 0);

        // Update average quality score
        this.stats.averageQualityScore = 
            (this.stats.averageQualityScore * (this.stats.validationsPerformed - 1) + validationResults.qualityScore) / 
            this.stats.validationsPerformed;
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
            validationRules: Object.keys(this.validationRules)
        };
    }

    async getMetrics() {
        return this.stats;
    }

    async shutdown() {
        this.logger.info('🛑 Shutting down Validation Agent...');
        this.healthy = false;
    }
}

module.exports = ValidationAgent;
