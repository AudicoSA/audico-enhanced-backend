
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const { createClient } = require('@supabase/supabase-js');

/**
 * Enhanced Document Processor for Audico Quoting System
 * Handles 50+ different pricelist formats with intelligent pattern recognition
 */
class EnhancedDocumentProcessor {
    constructor(options = {}) {
        this.supabase = options.supabase;
        this.openai = options.openai;
        this.anthropic = options.anthropic; // Claude integration
        this.templateManager = options.templateManager;
        this.layoutDetector = options.layoutDetector;
        this.priceExtractor = options.priceExtractor;
        this.errorRecovery = options.errorRecovery;

        // Processing statistics
        this.stats = {
            totalProcessed: 0,
            successfulExtractions: 0,
            failedExtractions: 0,
            averageConfidence: 0,
            processingTimes: []
        };

        // Known supplier patterns (learned from previous processing)
        this.supplierPatterns = new Map();
        this.loadSupplierPatterns();
    }

    /**
     * Main processing entry point
     */
    async processDocument(fileBuffer, filename, supplier, options = {}) {
        const startTime = Date.now();

        try {
            console.log(`🔄 Processing ${filename} for supplier: ${supplier}`);

            // Step 1: Detect document layout and format
            const layoutInfo = await this.layoutDetector.analyzeLayout(fileBuffer, filename);
            console.log(`📊 Layout detected: ${layoutInfo.type} (confidence: ${layoutInfo.confidence})`);

            // Step 2: Check for existing template
            let template = await this.templateManager.findBestTemplate(supplier, layoutInfo);

            // Step 3: Extract raw data based on file type
            let rawData;
            if (filename.toLowerCase().endsWith('.pdf')) {
                rawData = await this.processPDF(fileBuffer, template, layoutInfo);
            } else if (filename.toLowerCase().endsWith('.xlsx') || filename.toLowerCase().endsWith('.xls')) {
                rawData = await this.processExcel(fileBuffer, template, layoutInfo);
            } else {
                throw new Error(`Unsupported file type: ${filename}`);
            }

            // Step 4: Extract products using intelligent price detection
            const extractedProducts = await this.priceExtractor.extractProducts(
                rawData, 
                supplier, 
                template,
                options
            );

            // Step 5: Validate and clean results
            const validatedProducts = await this.validateProducts(extractedProducts, options);

            // Step 6: Learn from successful extraction
            if (validatedProducts.length > 0) {
                await this.templateManager.updateTemplate(supplier, layoutInfo, {
                    extractedCount: validatedProducts.length,
                    confidence: this.calculateConfidence(validatedProducts),
                    processingTime: Date.now() - startTime
                });
            }

            // Step 7: Update statistics
            this.updateStats(validatedProducts, Date.now() - startTime);

            return {
                success: true,
                products: validatedProducts,
                metadata: {
                    supplier,
                    filename,
                    layoutType: layoutInfo.type,
                    confidence: this.calculateConfidence(validatedProducts),
                    processingTime: Date.now() - startTime,
                    extractedCount: validatedProducts.length,
                    templateUsed: template?.id || 'auto-generated'
                }
            };

        } catch (error) {
            console.error(`❌ Processing failed for ${filename}:`, error);

            // Attempt error recovery
            const recoveryResult = await this.errorRecovery.attemptRecovery(
                fileBuffer, 
                filename, 
                supplier, 
                error, 
                options
            );

            if (recoveryResult.success) {
                console.log(`✅ Recovery successful: ${recoveryResult.products.length} products extracted`);
                return recoveryResult;
            }

            throw error;
        }
    }

    /**
     * Process PDF documents with advanced parsing
     */
    async processPDF(fileBuffer, template, layoutInfo) {
        try {
            const pdfData = await pdfParse(fileBuffer);
            let text = pdfData.text;

            // Apply layout-specific preprocessing
            if (layoutInfo.type === 'table') {
                text = this.preprocessTablePDF(text, layoutInfo);
            } else if (layoutInfo.type === 'multi-column') {
                text = this.preprocessMultiColumnPDF(text, layoutInfo);
            } else if (layoutInfo.type === 'catalog') {
                text = this.preprocessCatalogPDF(text, layoutInfo);
            }

            // Extract structured data
            const lines = text.split('\n').filter(line => line.trim().length > 0);

            return {
                type: 'pdf',
                content: text,
                lines: lines,
                pages: pdfData.numpages,
                layoutInfo: layoutInfo,
                metadata: pdfData.metadata || {}
            };

        } catch (error) {
            console.error('PDF processing error:', error);
            throw new Error(`PDF processing failed: ${error.message}`);
        }
    }

    /**
     * Process Excel documents with multi-sheet support
     */
    async processExcel(fileBuffer, template, layoutInfo) {
        try {
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const sheets = [];

            for (const sheetName of workbook.SheetNames) {
                // Skip sheets that are typically not product data
                if (this.shouldSkipSheet(sheetName, template)) {
                    continue;
                }

                const worksheet = workbook.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                // Analyze sheet structure
                const sheetInfo = this.analyzeSheetStructure(data, sheetName);

                sheets.push({
                    name: sheetName,
                    data: data,
                    structure: sheetInfo,
                    rowCount: data.length,
                    columnCount: Math.max(...data.map(row => row.length))
                });
            }

            return {
                type: 'excel',
                sheets: sheets,
                sheetNames: workbook.SheetNames,
                layoutInfo: layoutInfo
            };

        } catch (error) {
            console.error('Excel processing error:', error);
            throw new Error(`Excel processing failed: ${error.message}`);
        }
    }

    /**
     * Preprocess table-style PDFs
     */
    preprocessTablePDF(text, layoutInfo) {
        // Remove headers and footers
        const lines = text.split('\n');
        const cleanLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip common header/footer patterns
            if (this.isHeaderFooterLine(line)) {
                continue;
            }

            // Clean up table formatting
            const cleanedLine = line
                .replace(/\s{2,}/g, '\t') // Multiple spaces to tabs
                .replace(/\|/g, '\t')     // Pipes to tabs
                .replace(/[-=]{3,}/g, '')  // Remove separator lines
                .trim();

            if (cleanedLine.length > 0) {
                cleanLines.push(cleanedLine);
            }
        }

        return cleanLines.join('\n');
    }

    /**
     * Preprocess multi-column PDFs
     */
    preprocessMultiColumnPDF(text, layoutInfo) {
        // Attempt to reconstruct column structure
        const lines = text.split('\n');
        const reconstructed = [];

        // Group lines by approximate column positions
        const columns = this.detectColumns(lines);

        for (const column of columns) {
            reconstructed.push(...column);
        }

        return reconstructed.join('\n');
    }

    /**
     * Preprocess catalog-style PDFs
     */
    preprocessCatalogPDF(text, layoutInfo) {
        // Handle product catalog layouts with images and descriptions
        const lines = text.split('\n');
        const products = [];
        let currentProduct = null;

        for (const line of lines) {
            const trimmed = line.trim();

            // Detect product boundaries
            if (this.isProductHeader(trimmed)) {
                if (currentProduct) {
                    products.push(currentProduct.join('\n'));
                }
                currentProduct = [trimmed];
            } else if (currentProduct && trimmed.length > 0) {
                currentProduct.push(trimmed);
            }
        }

        if (currentProduct) {
            products.push(currentProduct.join('\n'));
        }

        return products.join('\n\n---PRODUCT-SEPARATOR---\n\n');
    }

    /**
     * Analyze Excel sheet structure
     */
    analyzeSheetStructure(data, sheetName) {
        if (data.length === 0) {
            return { type: 'empty', headerRow: -1, dataStartRow: -1 };
        }

        // Find header row
        let headerRow = -1;
        for (let i = 0; i < Math.min(10, data.length); i++) {
            const row = data[i];
            if (this.isHeaderRow(row)) {
                headerRow = i;
                break;
            }
        }

        // Determine sheet type
        let sheetType = 'unknown';
        if (sheetName.toLowerCase().includes('price')) {
            sheetType = 'pricelist';
        } else if (sheetName.toLowerCase().includes('product')) {
            sheetType = 'products';
        } else if (sheetName.toLowerCase().includes('summary')) {
            sheetType = 'summary';
        } else if (headerRow >= 0) {
            sheetType = 'data';
        }

        return {
            type: sheetType,
            headerRow: headerRow,
            dataStartRow: headerRow >= 0 ? headerRow + 1 : 0,
            hasHeaders: headerRow >= 0,
            estimatedProductCount: Math.max(0, data.length - (headerRow + 1))
        };
    }

    /**
     * Check if a row is likely a header row
     */
    isHeaderRow(row) {
        if (!row || row.length === 0) return false;

        const headerKeywords = [
            'product', 'name', 'description', 'price', 'rrp', 'cost',
            'model', 'code', 'sku', 'brand', 'category', 'qty', 'quantity'
        ];

        const cellText = row.join(' ').toLowerCase();
        const keywordMatches = headerKeywords.filter(keyword => 
            cellText.includes(keyword)
        ).length;

        return keywordMatches >= 2;
    }

    /**
     * Determine if a sheet should be skipped
     */
    shouldSkipSheet(sheetName, template) {
        const skipPatterns = [
            'summary', 'index', 'contents', 'terms', 'conditions',
            'contact', 'info', 'instructions', 'notes'
        ];

        const lowerName = sheetName.toLowerCase();

        // Check template-specific skip patterns
        if (template && template.skipSheets) {
            for (const pattern of template.skipSheets) {
                if (lowerName.includes(pattern.toLowerCase())) {
                    return true;
                }
            }
        }

        // Check default skip patterns
        return skipPatterns.some(pattern => lowerName.includes(pattern));
    }

    /**
     * Validate extracted products
     */
    async validateProducts(products, options) {
        const validated = [];

        for (const product of products) {
            try {
                // Basic validation
                if (!product.name || product.name.length < 3) {
                    continue;
                }

                if (!product.price || product.price <= 0) {
                    continue;
                }

                // Advanced validation using AI if available
                if (this.anthropic && options.enableAdvancedValidation) {
                    const isValid = await this.validateProductWithAI(product);
                    if (!isValid) {
                        continue;
                    }
                }

                validated.push(product);

            } catch (error) {
                console.warn(`Validation failed for product: ${product.name}`, error);
            }
        }

        return validated;
    }

    /**
     * Validate product using Claude/Anthropic AI
     */
    async validateProductWithAI(product) {
        try {
            const prompt = `
                Validate this audio product data:
                Name: ${product.name}
                Price: ${product.price}
                Description: ${product.description || 'N/A'}

                Is this a valid audio/visual product with reasonable data?
                Respond with only 'valid' or 'invalid' and a brief reason.
            `;

            // This would integrate with Claude API
            // For now, return basic validation
            return product.name.length >= 3 && product.price > 0;

        } catch (error) {
            console.warn('AI validation failed:', error);
            return true; // Default to valid if AI fails
        }
    }

    /**
     * Calculate confidence score for extracted products
     */
    calculateConfidence(products) {
        if (products.length === 0) return 0;

        let totalConfidence = 0;

        for (const product of products) {
            let confidence = 0.5; // Base confidence

            // Name quality
            if (product.name && product.name.length > 10) confidence += 0.2;
            if (product.name && /[A-Z]{2,}/.test(product.name)) confidence += 0.1; // Has model numbers

            // Price quality
            if (product.price && product.price > 10) confidence += 0.2;
            if (product.priceType === 'New RRP') confidence += 0.1;

            // Additional data
            if (product.description && product.description.length > 20) confidence += 0.1;
            if (product.specifications) confidence += 0.1;

            totalConfidence += Math.min(1.0, confidence);
        }

        return totalConfidence / products.length;
    }

    /**
     * Update processing statistics
     */
    updateStats(products, processingTime) {
        this.stats.totalProcessed++;

        if (products.length > 0) {
            this.stats.successfulExtractions++;
        } else {
            this.stats.failedExtractions++;
        }

        this.stats.processingTimes.push(processingTime);
        this.stats.averageConfidence = this.calculateConfidence(products);
    }

    /**
     * Load supplier patterns from database
     */
    async loadSupplierPatterns() {
        try {
            if (!this.supabase) return;

            const { data: patterns, error } = await this.supabase
                .from('supplier_patterns')
                .select('*');

            if (error) {
                console.warn('Could not load supplier patterns:', error);
                return;
            }

            for (const pattern of patterns || []) {
                this.supplierPatterns.set(pattern.supplier, pattern.patterns);
            }

            console.log(`📚 Loaded patterns for ${this.supplierPatterns.size} suppliers`);

        } catch (error) {
            console.warn('Error loading supplier patterns:', error);
        }
    }

    /**
     * Helper methods for text analysis
     */
    isHeaderFooterLine(line) {
        const headerFooterPatterns = [
            /page \d+ of \d+/i,
            /^\s*\d+\s*$/,
            /copyright|©/i,
            /confidential|proprietary/i,
            /www\.|http/i,
            /^\s*[-=]{3,}\s*$/
        ];

        return headerFooterPatterns.some(pattern => pattern.test(line));
    }

    isProductHeader(line) {
        const productPatterns = [
            /^[A-Z0-9-]{3,}\s+/,  // Model number at start
            /^\d+\.\s+/,         // Numbered list
            /^[A-Z][a-z]+\s+[A-Z]/ // Brand Model pattern
        ];

        return productPatterns.some(pattern => pattern.test(line));
    }

    detectColumns(lines) {
        // Simple column detection based on consistent spacing
        // This is a simplified version - real implementation would be more sophisticated
        return [lines]; // Return single column for now
    }

    /**
     * Get processing statistics
     */
    getStats() {
        return {
            ...this.stats,
            averageProcessingTime: this.stats.processingTimes.length > 0 
                ? this.stats.processingTimes.reduce((a, b) => a + b, 0) / this.stats.processingTimes.length 
                : 0,
            successRate: this.stats.totalProcessed > 0 
                ? this.stats.successfulExtractions / this.stats.totalProcessed 
                : 0
        };
    }
}

module.exports = EnhancedDocumentProcessor;
