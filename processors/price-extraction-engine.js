
const fs = require('fs');
const path = require('path');

/**
 * Advanced Price Extraction Engine for Audico Quoting System
 * Handles all price formats with intelligent New RRP vs Old RRP prioritization
 */
class PriceExtractionEngine {
    constructor(options = {}) {
        this.openai = options.openai;
        this.anthropic = options.anthropic;
        this.confidenceThreshold = options.confidenceThreshold || 0.7;

        // Price format patterns with priority scoring
        this.pricePatterns = this.initializePricePatterns();

        // Column priority mapping
        this.columnPriority = {
            'new_rrp': 100,
            'current_rrp': 90,
            'rrp': 80,
            'retail_price': 70,
            'selling_price': 60,
            'old_rrp': 50,
            'cost_price': 40,
            'wholesale_price': 30,
            'price': 20,
            'amount': 10
        };

        // Statistics tracking
        this.extractionStats = {
            totalProducts: 0,
            successfulExtractions: 0,
            priceFormatDistribution: {},
            averageConfidence: 0,
            newRRPFound: 0,
            oldRRPFound: 0
        };
    }

    /**
     * Main product extraction entry point
     */
    async extractProducts(rawData, supplier, template, options = {}) {
        try {
            console.log(`💰 Extracting products for supplier: ${supplier}`);

            let products = [];

            if (rawData.type === 'pdf') {
                products = await this.extractFromPDF(rawData, supplier, template, options);
            } else if (rawData.type === 'excel') {
                products = await this.extractFromExcel(rawData, supplier, template, options);
            } else {
                throw new Error(`Unsupported data type: ${rawData.type}`);
            }

            // Apply pricing logic and categorization
            products = await this.applyPricingLogic(products, options);

            if (options.enableAI) {
                products = await this.enhanceWithAI(products, supplier);
            }

            // Update statistics
            this.updateExtractionStats(products);

            console.log(`✅ Extracted ${products.length} products with average confidence: ${this.calculateAverageConfidence(products).toFixed(2)}`);

            return products;

        } catch (error) {
            console.error('Price extraction failed:', error);
            throw error;
        }
    }

    /**
     * Extract products from PDF data
     */
    async extractFromPDF(rawData, supplier, template, options) {
        const products = [];
        const lines = rawData.lines;

        console.log(`📄 Processing ${lines.length} lines from PDF`);

        // Choose extraction strategy based on layout
        switch (rawData.layoutInfo.type) {
            case 'table':
                return await this.extractFromTablePDF(lines, supplier, template, options);
            case 'multi-column':
                return await this.extractFromMultiColumnPDF(lines, supplier, template, options);
            case 'catalog':
                return await this.extractFromCatalogPDF(lines, supplier, template, options);
            default:
                return await this.extractFromGenericPDF(lines, supplier, template, options);
        }
    }

    /**
     * Extract from table-style PDF
     */
    async extractFromTablePDF(lines, supplier, template, options) {
        const products = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.length < 10) continue; // Skip short lines

            // Enhanced price detection with priority system
            const priceAnalysis = this.analyzePricesInLine(line);

            if (priceAnalysis.prices.length > 0) {
                // Select best price based on priority
                const selectedPrice = this.selectBestPrice(priceAnalysis.prices);

                if (selectedPrice.confidence > 0.5) {
                    const productName = this.extractProductName(line, selectedPrice.position);

                    if (productName && productName.length > 3) {
                        const product = {
                            name: productName,
                            price: selectedPrice.value,
                            priceType: selectedPrice.type,
                            confidence: selectedPrice.confidence,
                            supplier: supplier,
                            description: productName,
                            specifications: this.extractSpecifications(line),
                            category: 'uncategorized',
                            rawLine: line,
                            extractionMethod: 'table_pdf',
                            priceAnalysis: priceAnalysis
                        };

                        products.push(product);
                    }
                }
            }
        }

        return products;
    }

    /**
     * Extract from multi-column PDF
     */
    async extractFromMultiColumnPDF(lines, supplier, template, options) {
        const products = [];

        // Reconstruct products from fragmented lines
        const reconstructedProducts = this.reconstructProductsFromColumns(lines);

        for (const productData of reconstructedProducts) {
            const priceAnalysis = this.analyzePricesInText(productData.text);

            if (priceAnalysis.prices.length > 0) {
                const selectedPrice = this.selectBestPrice(priceAnalysis.prices);

                if (selectedPrice.confidence > 0.4) {
                    const product = {
                        name: productData.name || this.extractProductName(productData.text, 0),
                        price: selectedPrice.value,
                        priceType: selectedPrice.type,
                        confidence: selectedPrice.confidence,
                        supplier: supplier,
                        description: productData.description || productData.text,
                        specifications: productData.specifications || '',
                        category: 'uncategorized',
                        extractionMethod: 'multi_column_pdf',
                        columnData: productData
                    };

                    products.push(product);
                }
            }
        }

        return products;
    }

    /**
     * Extract from catalog-style PDF
     */
    async extractFromCatalogPDF(lines, supplier, template, options) {
        const products = [];

        // Split into product blocks
        const productBlocks = this.splitIntoProductBlocks(lines);

        for (const block of productBlocks) {
            const blockText = block.join(' ');
            const priceAnalysis = this.analyzePricesInText(blockText);

            if (priceAnalysis.prices.length > 0) {
                const selectedPrice = this.selectBestPrice(priceAnalysis.prices);

                if (selectedPrice.confidence > 0.3) {
                    const productName = this.extractProductNameFromBlock(block);
                    const description = this.extractDescriptionFromBlock(block);
                    const specifications = this.extractSpecificationsFromBlock(block);

                    const product = {
                        name: productName,
                        price: selectedPrice.value,
                        priceType: selectedPrice.type,
                        confidence: selectedPrice.confidence,
                        supplier: supplier,
                        description: description,
                        specifications: specifications,
                        category: 'uncategorized',
                        extractionMethod: 'catalog_pdf',
                        blockData: block
                    };

                    products.push(product);
                }
            }
        }

        return products;
    }

    /**
     * Extract from generic PDF
     */
    async extractFromGenericPDF(lines, supplier, template, options) {
        const products = [];

        for (const line of lines) {
            const priceAnalysis = this.analyzePricesInLine(line);

            if (priceAnalysis.prices.length > 0) {
                const selectedPrice = this.selectBestPrice(priceAnalysis.prices);

                if (selectedPrice.confidence > 0.6) {
                    const productName = this.extractProductName(line, selectedPrice.position);

                    if (productName && productName.length > 3) {
                        const product = {
                            name: productName,
                            price: selectedPrice.value,
                            priceType: selectedPrice.type,
                            confidence: selectedPrice.confidence,
                            supplier: supplier,
                            description: productName,
                            specifications: '',
                            category: 'uncategorized',
                            extractionMethod: 'generic_pdf'
                        };

                        products.push(product);
                    }
                }
            }
        }

        return products;
    }

    /**
     * Extract products from Excel data
     */
    async extractFromExcel(rawData, supplier, template, options) {
        const products = [];

        console.log(`📊 Processing ${rawData.sheets.length} Excel sheets`);

        for (const sheet of rawData.sheets) {
            if (sheet.structure.type === 'empty') continue;

            console.log(`   Processing sheet: ${sheet.name} (${sheet.rowCount} rows)`);

            const sheetProducts = await this.extractFromExcelSheet(sheet, supplier, template, options);
            products.push(...sheetProducts);
        }

        return products;
    }

    /**
     * Extract from single Excel sheet
     */
    async extractFromExcelSheet(sheet, supplier, template, options) {
        const products = [];
        const data = sheet.data;

        if (data.length === 0) return products;

        // Find header row and column mappings
        const headerInfo = this.analyzeExcelHeaders(data);
        const columnMappings = this.createColumnMappings(headerInfo, sheet);

        console.log(`     Found columns: ${Object.keys(columnMappings).join(', ')}`);

        // Process data rows
        const startRow = headerInfo.headerRow >= 0 ? headerInfo.headerRow + 1 : 0;

        for (let i = startRow; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            const product = await this.extractProductFromExcelRow(
                row, 
                columnMappings, 
                supplier, 
                i, 
                sheet.name,
                options
            );

            if (product) {
                products.push(product);
            }
        }

        return products;
    }

    /**
     * Extract product from Excel row
     */
    async extractProductFromExcelRow(row, columnMappings, supplier, rowIndex, sheetName, options) {
        try {
            // Extract product name
            const productName = this.getValueFromMappings(row, columnMappings.name);
            if (!productName || productName.length < 3) return null;

            // Extract prices with priority system
            const priceData = this.extractPricesFromExcelRow(row, columnMappings);
            if (!priceData.selectedPrice) return null;

            // Extract additional data
            const description = this.getValueFromMappings(row, columnMappings.description) || productName;
            const specifications = this.getValueFromMappings(row, columnMappings.specifications) || '';
            const model = this.getValueFromMappings(row, columnMappings.model) || '';
            const brand = this.getValueFromMappings(row, columnMappings.brand) || '';

            const product = {
                name: productName.trim(),
                price: priceData.selectedPrice.value,
                priceType: priceData.selectedPrice.type,
                confidence: priceData.selectedPrice.confidence,
                supplier: supplier,
                description: description.trim(),
                specifications: specifications,
                model: model,
                brand: brand,
                category: 'uncategorized',
                extractionMethod: 'excel',
                sheetName: sheetName,
                rowIndex: rowIndex,
                allPrices: priceData.allPrices,
                columnMappings: Object.keys(columnMappings)
            };

            return product;

        } catch (error) {
            console.warn(`Failed to extract product from row ${rowIndex}:`, error);
            return null;
        }
    }

    /**
     * Analyze prices in a single line of text
     */
    analyzePricesInLine(line) {
        const prices = [];
        const analysis = {
            line: line,
            prices: prices,
            hasNewRRP: false,
            hasOldRRP: false,
            primaryCurrency: null
        };

        // Check for New RRP patterns (highest priority)
        const newRRPMatches = this.findPriceMatches(line, this.pricePatterns.newRRP);
        for (const match of newRRPMatches) {
            prices.push({
                value: match.value,
                type: 'New RRP',
                priority: 100,
                confidence: 0.95,
                position: match.position,
                rawMatch: match.raw,
                currency: match.currency
            });
            analysis.hasNewRRP = true;
        }

        // Check for Old RRP patterns (lower priority)
        const oldRRPMatches = this.findPriceMatches(line, this.pricePatterns.oldRRP);
        for (const match of oldRRPMatches) {
            prices.push({
                value: match.value,
                type: 'Old RRP',
                priority: 50,
                confidence: 0.85,
                position: match.position,
                rawMatch: match.raw,
                currency: match.currency
            });
            analysis.hasOldRRP = true;
        }

        // Check for general RRP patterns
        const rrpMatches = this.findPriceMatches(line, this.pricePatterns.rrp);
        for (const match of rrpMatches) {
            // Skip if already found as New/Old RRP
            if (!this.isPositionAlreadyMatched(match.position, prices)) {
                prices.push({
                    value: match.value,
                    type: 'RRP',
                    priority: 80,
                    confidence: 0.8,
                    position: match.position,
                    rawMatch: match.raw,
                    currency: match.currency
                });
            }
        }

        // Check for cost price patterns
        const costMatches = this.findPriceMatches(line, this.pricePatterns.cost);
        for (const match of costMatches) {
            if (!this.isPositionAlreadyMatched(match.position, prices)) {
                prices.push({
                    value: match.value,
                    type: 'Cost',
                    priority: 40,
                    confidence: 0.7,
                    position: match.position,
                    rawMatch: match.raw,
                    currency: match.currency
                });
            }
        }

        // Check for general price patterns
        const generalMatches = this.findPriceMatches(line, this.pricePatterns.general);
        for (const match of generalMatches) {
            if (!this.isPositionAlreadyMatched(match.position, prices)) {
                prices.push({
                    value: match.value,
                    type: 'Price',
                    priority: 20,
                    confidence: 0.6,
                    position: match.position,
                    rawMatch: match.raw,
                    currency: match.currency
                });
            }
        }

        // Determine primary currency
        const currencies = prices.map(p => p.currency).filter(c => c);
        analysis.primaryCurrency = this.getMostCommonCurrency(currencies);

        return analysis;
    }

    /**
     * Analyze prices in text block
     */
    analyzePricesInText(text) {
        const lines = text.split('\n');
        const allPrices = [];

        for (const line of lines) {
            const lineAnalysis = this.analyzePricesInLine(line);
            allPrices.push(...lineAnalysis.prices);
        }

        return {
            text: text,
            prices: allPrices,
            hasNewRRP: allPrices.some(p => p.type === 'New RRP'),
            hasOldRRP: allPrices.some(p => p.type === 'Old RRP'),
            primaryCurrency: this.getMostCommonCurrency(allPrices.map(p => p.currency))
        };
    }

    /**
     * Select the best price from multiple options
     */
    selectBestPrice(prices) {
        if (prices.length === 0) return null;
        if (prices.length === 1) return prices[0];

        // Sort by priority (highest first), then by confidence
        const sortedPrices = prices.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }
            return b.confidence - a.confidence;
        });

        const bestPrice = sortedPrices[0];

        // Boost confidence if New RRP is selected
        if (bestPrice.type === 'New RRP') {
            bestPrice.confidence = Math.min(1.0, bestPrice.confidence + 0.1);
        }

        return bestPrice;
    }

    /**
     * Extract prices from Excel row using column mappings
     */
    extractPricesFromExcelRow(row, columnMappings) {
        const allPrices = [];

        // Check each price column with priority
        const priceColumns = [
            { key: 'newRRP', type: 'New RRP', priority: 100 },
            { key: 'currentRRP', type: 'Current RRP', priority: 90 },
            { key: 'rrp', type: 'RRP', priority: 80 },
            { key: 'retailPrice', type: 'Retail Price', priority: 70 },
            { key: 'oldRRP', type: 'Old RRP', priority: 50 },
            { key: 'costPrice', type: 'Cost Price', priority: 40 },
            { key: 'price', type: 'Price', priority: 20 }
        ];

        for (const column of priceColumns) {
            const value = this.getValueFromMappings(row, columnMappings[column.key]);
            if (value !== null && value !== undefined && value !== '') {
                const numericValue = this.parsePrice(value);
                if (numericValue > 0) {
                    allPrices.push({
                        value: numericValue,
                        type: column.type,
                        priority: column.priority,
                        confidence: 0.9,
                        rawValue: value,
                        column: column.key
                    });
                }
            }
        }

        const selectedPrice = this.selectBestPrice(allPrices);

        return {
            selectedPrice: selectedPrice,
            allPrices: allPrices
        };
    }

    /**
     * Create column mappings from Excel headers
     */
    createColumnMappings(headerInfo, sheet) {
        const mappings = {};

        if (headerInfo.headerRow < 0) {
            // No headers detected, use positional mapping
            return this.createPositionalMappings(sheet);
        }

        const headers = sheet.data[headerInfo.headerRow];

        for (let i = 0; i < headers.length; i++) {
            const header = String(headers[i] || '').toLowerCase().trim();

            // Map product name columns
            if (this.matchesPattern(header, ['product', 'name', 'description', 'item'])) {
                if (!mappings.name) mappings.name = [i];
                else mappings.name.push(i);
            }

            // Map price columns with priority
            if (this.matchesPattern(header, ['new rrp', 'new_rrp', 'newrrp'])) {
                mappings.newRRP = [i];
            } else if (this.matchesPattern(header, ['current rrp', 'current_rrp', 'currentrrp'])) {
                mappings.currentRRP = [i];
            } else if (this.matchesPattern(header, ['old rrp', 'old_rrp', 'oldrrp'])) {
                mappings.oldRRP = [i];
            } else if (this.matchesPattern(header, ['rrp', 'recommended retail price'])) {
                if (!mappings.rrp) mappings.rrp = [i];
            } else if (this.matchesPattern(header, ['retail price', 'retail_price', 'retailprice'])) {
                mappings.retailPrice = [i];
            } else if (this.matchesPattern(header, ['cost price', 'cost_price', 'costprice', 'cost'])) {
                mappings.costPrice = [i];
            } else if (this.matchesPattern(header, ['price', 'amount', 'value'])) {
                if (!mappings.price) mappings.price = [i];
            }

            // Map other columns
            if (this.matchesPattern(header, ['model', 'model number', 'model_number'])) {
                mappings.model = [i];
            }
            if (this.matchesPattern(header, ['brand', 'manufacturer', 'make'])) {
                mappings.brand = [i];
            }
            if (this.matchesPattern(header, ['specification', 'specs', 'details'])) {
                mappings.specifications = [i];
            }
            if (this.matchesPattern(header, ['description', 'desc'])) {
                if (!mappings.description) mappings.description = [i];
            }
        }

        return mappings;
    }

    /**
     * Create positional mappings when no headers are detected
     */
    createPositionalMappings(sheet) {
        // Analyze first few rows to guess column purposes
        const mappings = {};
        const sampleRows = sheet.data.slice(0, Math.min(5, sheet.data.length));

        if (sampleRows.length === 0) return mappings;

        const maxCols = Math.max(...sampleRows.map(row => row.length));

        for (let col = 0; col < maxCols; col++) {
            let textCount = 0;
            let numericCount = 0;
            let priceCount = 0;

            for (const row of sampleRows) {
                const cell = row[col];
                if (cell !== undefined && cell !== '') {
                    const cellStr = String(cell);

                    if (isNaN(parseFloat(cellStr))) {
                        textCount++;
                        // Check if looks like product name
                        if (cellStr.length > 10 && /[a-zA-Z]/.test(cellStr)) {
                            textCount += 2; // Boost text score for likely product names
                        }
                    } else {
                        numericCount++;
                        const numValue = parseFloat(cellStr);
                        if (numValue > 1 && numValue < 1000000) {
                            priceCount++;
                        }
                    }
                }
            }

            // Assign column purpose based on analysis
            if (textCount > numericCount && !mappings.name) {
                mappings.name = [col];
            } else if (priceCount > 0 && !mappings.price) {
                mappings.price = [col];
            }
        }

        return mappings;
    }

    /**
     * Get value from column mappings
     */
    getValueFromMappings(row, columnIndices) {
        if (!columnIndices || columnIndices.length === 0) return null;

        for (const index of columnIndices) {
            const value = row[index];
            if (value !== undefined && value !== null && value !== '') {
                return String(value).trim();
            }
        }

        return null;
    }

    /**
     * Initialize price patterns
     */
    initializePricePatterns() {
        return {
            newRRP: [
                /new\s+rrp[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
                /new\s+recommended\s+retail\s+price[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
                /new_rrp[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi
            ],
            oldRRP: [
                /old\s+rrp[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
                /old\s+recommended\s+retail\s+price[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
                /old_rrp[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
                /previous\s+rrp[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi
            ],
            rrp: [
                /\brrp[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
                /recommended\s+retail\s+price[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
                /retail[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi
            ],
            cost: [
                /cost[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
                /cost\s+price[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
                /wholesale[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi
            ],
            general: [
                /R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
                /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
                /€\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
                /price[:\s]*R?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi
            ]
        };
    }

    /**
     * Find price matches using patterns
     */
    findPriceMatches(text, patterns) {
        const matches = [];

        for (const pattern of patterns) {
            let match;
            const regex = new RegExp(pattern.source, pattern.flags);

            while ((match = regex.exec(text)) !== null) {
                const value = parseFloat(match[1].replace(/,/g, ''));
                if (value > 0) {
                    matches.push({
                        value: value,
                        position: match.index,
                        raw: match[0],
                        currency: this.detectCurrency(match[0])
                    });
                }
            }
        }

        return matches;
    }

    /**
     * Parse price from various formats
     */
    parsePrice(value) {
        if (typeof value === 'number') return value;

        const str = String(value).trim();

        // Remove currency symbols and clean up
        const cleaned = str
            .replace(/[R$€£¥]/g, '')
            .replace(/[^\d.,]/g, '')
            .trim();

        if (cleaned === '') return 0;

        // Handle different decimal separators
        let numericValue;
        if (cleaned.includes(',') && cleaned.includes('.')) {
            // Both comma and dot - assume comma is thousands separator
            numericValue = parseFloat(cleaned.replace(/,/g, ''));
        } else if (cleaned.includes(',')) {
            // Only comma - could be decimal or thousands separator
            const parts = cleaned.split(',');
            if (parts.length === 2 && parts[1].length <= 2) {
                // Likely decimal separator
                numericValue = parseFloat(cleaned.replace(',', '.'));
            } else {
                // Likely thousands separator
                numericValue = parseFloat(cleaned.replace(/,/g, ''));
            }
        } else {
            numericValue = parseFloat(cleaned);
        }

        return isNaN(numericValue) ? 0 : numericValue;
    }

    /**
     * Apply pricing logic based on options
     */
    async applyPricingLogic(products, options) {
        const processedProducts = [];

        for (const product of products) {
            try {
                let finalPrice = product.price;
                const originalPrice = product.price;

                // Apply pricing transformations based on price type and options
                switch (options.priceType) {
                    case 'retail_including_vat':
                        // Price is already retail with VAT - no change needed
                        break;

                    case 'cost_including_vat':
                        // Add margin to cost price
                        const marginMultiplier = 1 + (options.marginPercentage || 0) / 100;
                        finalPrice = originalPrice * marginMultiplier;
                        break;

                    case 'cost_excluding_vat':
                        // Add VAT first, then margin
                        const vatMultiplier = 1 + (options.vatRate || 15) / 100;
                        const withVAT = originalPrice * vatMultiplier;
                        const marginMult = 1 + (options.marginPercentage || 0) / 100;
                        finalPrice = withVAT * marginMult;
                        break;
                }

                // Special handling for New RRP vs Old RRP
                let priceAdjustment = 1.0;
                if (product.priceType === 'New RRP') {
                    // New RRP gets priority and slight confidence boost
                    product.confidence = Math.min(1.0, product.confidence + 0.1);
                } else if (product.priceType === 'Old RRP') {
                    // Old RRP might need adjustment or flagging
                    product.notes = 'Using Old RRP - verify current pricing';
                }

                const processedProduct = {
                    ...product,
                    original_price: originalPrice,
                    final_price: Math.round(finalPrice * 100) / 100,
                    price_adjustment: priceAdjustment,
                    pricing_method: options.priceType,
                    margin_applied: options.marginPercentage || 0,
                    vat_rate: options.vatRate || 15,
                    processing_timestamp: new Date().toISOString()
                };

                processedProducts.push(processedProduct);

            } catch (error) {
                console.warn(`Failed to process pricing for product: ${product.name}`, error);
                // Include product with original pricing if processing fails
                processedProducts.push({
                    ...product,
                    original_price: product.price,
                    final_price: product.price,
                    processing_error: error.message
                });
            }
        }

        return processedProducts;
    }

    /**
     * Enhance products with AI categorization
     */
    async enhanceWithAI(products, supplier) {
        const enhancedProducts = [];

        console.log(`🤖 Enhancing ${products.length} products with AI categorization`);

        for (const product of products) {
            try {
                // Categorize product
                const category = await this.categorizeProduct(product);

                // Validate product data
                const validation = await this.validateProductWithAI(product);

                const enhancedProduct = {
                    ...product,
                    category: category,
                    ai_validation: validation,
                    ai_enhanced: true
                };

                enhancedProducts.push(enhancedProduct);

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.warn(`AI enhancement failed for product: ${product.name}`, error);
                enhancedProducts.push({
                    ...product,
                    category: 'home', // Default category
                    ai_enhanced: false,
                    ai_error: error.message
                });
            }
        }

        return enhancedProducts;
    }

    /**
     * Categorize product using AI
     */
    async categorizeProduct(product) {
        try {
            const categories = ['home', 'business', 'restaurant', 'gym', 'worship', 'education', 'club'];

            // Simple keyword-based categorization for now
            // In real implementation, this would use OpenAI/Anthropic API
            const name = product.name.toLowerCase();
            const description = (product.description || '').toLowerCase();
            const text = `${name} ${description}`;

            if (text.includes('home') || text.includes('residential') || text.includes('living')) {
                return 'home';
            } else if (text.includes('business') || text.includes('office') || text.includes('conference')) {
                return 'business';
            } else if (text.includes('restaurant') || text.includes('bar') || text.includes('cafe')) {
                return 'restaurant';
            } else if (text.includes('gym') || text.includes('fitness') || text.includes('sport')) {
                return 'gym';
            } else if (text.includes('church') || text.includes('worship') || text.includes('religious')) {
                return 'worship';
            } else if (text.includes('school') || text.includes('education') || text.includes('classroom')) {
                return 'education';
            } else if (text.includes('club') || text.includes('entertainment') || text.includes('venue')) {
                return 'club';
            }

            return 'home'; // Default category

        } catch (error) {
            console.warn('Product categorization failed:', error);
            return 'home';
        }
    }

    /**
     * Validate product with AI
     */
    async validateProductWithAI(product) {
        try {
            const validation = {
                isValid: true,
                confidence: 0.8,
                issues: [],
                suggestions: []
            };

            // Basic validation rules
            if (product.name.length < 3) {
                validation.issues.push('Product name too short');
                validation.confidence -= 0.3;
            }

            if (product.price <= 0) {
                validation.issues.push('Invalid price');
                validation.confidence -= 0.5;
                validation.isValid = false;
            }

            if (product.price > 1000000) {
                validation.issues.push('Price seems unusually high');
                validation.confidence -= 0.2;
            }

            // Check for audio-related keywords
            const audioKeywords = ['speaker', 'amplifier', 'audio', 'sound', 'music', 'stereo', 'subwoofer'];
            const hasAudioKeywords = audioKeywords.some(keyword => 
                product.name.toLowerCase().includes(keyword) || 
                (product.description || '').toLowerCase().includes(keyword)
            );

            if (!hasAudioKeywords) {
                validation.suggestions.push('Product may not be audio-related');
                validation.confidence -= 0.1;
            }

            return validation;

        } catch (error) {
            return {
                isValid: true,
                confidence: 0.5,
                issues: [`Validation error: ${error.message}`],
                suggestions: []
            };
        }
    }

    /**
     * Helper methods
     */

    detectCurrency(text) {
        if (text.includes('R')) return 'ZAR';
        if (text.includes('$')) return 'USD';
        if (text.includes('€')) return 'EUR';
        if (text.includes('£')) return 'GBP';
        return 'ZAR'; // Default to South African Rand
    }

    getMostCommonCurrency(currencies) {
        if (currencies.length === 0) return 'ZAR';

        const counts = {};
        for (const currency of currencies) {
            counts[currency] = (counts[currency] || 0) + 1;
        }

        return Object.entries(counts).sort(([,a], [,b]) => b - a)[0][0];
    }

    isPositionAlreadyMatched(position, existingPrices) {
        return existingPrices.some(price => 
            Math.abs(price.position - position) < 10
        );
    }

    matchesPattern(text, patterns) {
        const lowerText = text.toLowerCase();
        return patterns.some(pattern => lowerText.includes(pattern.toLowerCase()));
    }

    extractProductName(line, pricePosition) {
        // Extract product name from line, avoiding the price portion
        const beforePrice = line.substring(0, pricePosition).trim();

        // Clean up the product name
        const cleaned = beforePrice
            .replace(/^\d+\.?\s*/, '') // Remove leading numbers
            .replace(/\s+/g, ' ')        // Normalize spaces
            .trim();

        return cleaned.length > 3 ? cleaned : null;
    }

    extractSpecifications(line) {
        // Extract technical specifications from line
        const specs = [];

        // Look for common specification patterns
        const specPatterns = [
            /\b\d+\s*W\b/gi,           // Watts
            /\b\d+\s*Hz\b/gi,          // Frequency
            /\b\d+\s*Ohm\b/gi,         // Impedance
            /\b\d+\s*dB\b/gi,          // Decibels
            /\b\d+\s*mm\b/gi,          // Dimensions
            /\b\d+\s*inch\b/gi,        // Dimensions
            /\b\d+\s*x\s*\d+\b/gi    // Dimensions
        ];

        for (const pattern of specPatterns) {
            const matches = line.match(pattern);
            if (matches) {
                specs.push(...matches);
            }
        }

        return specs.join(', ');
    }

    reconstructProductsFromColumns(lines) {
        // Simplified column reconstruction
        // In a real implementation, this would be more sophisticated
        const products = [];
        let currentProduct = null;

        for (const line of lines) {
            if (this.looksLikeProductStart(line)) {
                if (currentProduct) {
                    products.push(currentProduct);
                }
                currentProduct = {
                    name: line.trim(),
                    text: line,
                    description: '',
                    specifications: ''
                };
            } else if (currentProduct) {
                currentProduct.text += ' ' + line;
                if (line.length > 50) {
                    currentProduct.description += ' ' + line;
                } else {
                    currentProduct.specifications += ' ' + line;
                }
            }
        }

        if (currentProduct) {
            products.push(currentProduct);
        }

        return products;
    }

    looksLikeProductStart(line) {
        return /^[A-Z0-9-]{3,}\s+/.test(line) || /^\d+\.\s+/.test(line);
    }

    splitIntoProductBlocks(lines) {
        const blocks = [];
        let currentBlock = [];

        for (const line of lines) {
            if (line.includes('---PRODUCT-SEPARATOR---')) {
                if (currentBlock.length > 0) {
                    blocks.push(currentBlock);
                    currentBlock = [];
                }
            } else {
                currentBlock.push(line);
            }
        }

        if (currentBlock.length > 0) {
            blocks.push(currentBlock);
        }

        return blocks;
    }

    extractProductNameFromBlock(block) {
        // Find the most likely product name line
        for (const line of block) {
            if (this.looksLikeProductStart(line)) {
                return line.trim();
            }
        }
        return block[0] ? block[0].trim() : 'Unknown Product';
    }

    extractDescriptionFromBlock(block) {
        // Find description lines (usually longer text)
        const descriptions = block.filter(line => 
            line.length > 30 && 
            !this.looksLikeProductStart(line) &&
            !/R\s*\d+/.test(line)
        );

        return descriptions.join(' ').trim();
    }

    extractSpecificationsFromBlock(block) {
        // Find specification lines (usually shorter, technical)
        const specs = [];

        for (const line of block) {
            if (this.extractSpecifications(line)) {
                specs.push(this.extractSpecifications(line));
            }
        }

        return specs.join(', ');
    }

    analyzeExcelHeaders(data) {
        if (data.length === 0) return { headerRow: -1, headers: [] };

        const headerKeywords = [
            'product', 'name', 'description', 'price', 'rrp', 'cost',
            'model', 'code', 'sku', 'brand', 'category', 'new', 'old'
        ];

        let bestRow = -1;
        let bestScore = 0;

        // Check first 5 rows for headers
        for (let i = 0; i < Math.min(5, data.length); i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            let score = 0;
            const cellText = row.join(' ').toLowerCase();

            for (const keyword of headerKeywords) {
                if (cellText.includes(keyword)) {
                    score++;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestRow = i;
            }
        }

        return {
            headerRow: bestRow,
            headers: bestRow >= 0 ? data[bestRow] : [],
            score: bestScore
        };
    }

    calculateAverageConfidence(products) {
        if (products.length === 0) return 0;

        const totalConfidence = products.reduce((sum, product) => 
            sum + (product.confidence || 0), 0
        );

        return totalConfidence / products.length;
    }

    updateExtractionStats(products) {
        this.extractionStats.totalProducts += products.length;

        for (const product of products) {
            if (product.confidence > 0.5) {
                this.extractionStats.successfulExtractions++;
            }

            // Track price format distribution
            const format = product.priceType || 'Unknown';
            this.extractionStats.priceFormatDistribution[format] = 
                (this.extractionStats.priceFormatDistribution[format] || 0) + 1;

            // Track New RRP vs Old RRP usage
            if (product.priceType === 'New RRP') {
                this.extractionStats.newRRPFound++;
            } else if (product.priceType === 'Old RRP') {
                this.extractionStats.oldRRPFound++;
            }
        }

        this.extractionStats.averageConfidence = this.calculateAverageConfidence(products);
    }

    /**
     * Get extraction statistics
     */
    getStats() {
        return {
            ...this.extractionStats,
            successRate: this.extractionStats.totalProducts > 0 
                ? this.extractionStats.successfulExtractions / this.extractionStats.totalProducts 
                : 0,
            newRRPPreference: this.extractionStats.newRRPFound > this.extractionStats.oldRRPFound
        };
    }
}

module.exports = PriceExtractionEngine;
