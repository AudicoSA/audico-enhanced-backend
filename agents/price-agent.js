const winston = require('winston');
const OpenAI = require('openai');

class PriceAgent {
    constructor(config) {
        this.config = config;
        this.logger = config.logger;
        this.openai = config.openai;
        this.healthy = false;
        this.version = '1.0.0';

        this.stats = {
            extractionsPerformed: 0,
            successfulExtractions: 0,
            priceColumnsDetected: 0,
            newRRPDetected: 0,
            oldRRPDetected: 0,
            averageConfidenceScore: 0
        };
    }

    async initialize() {
        try {
            this.logger.info('💰 Initializing Price Agent...');

            // Test OpenAI connection
            await this.openai.models.list();

            this.healthy = true;
            this.logger.info('✅ Price Agent initialized');
        } catch (error) {
            this.logger.error('❌ Price Agent initialization failed:', error);
            this.healthy = false;
        }
    }

    async extractProducts(jobData) {
        const startTime = Date.now();

        try {
            this.logger.info('💰 Starting price extraction...');

            const { documentContent, documentStructure, supplierConfig, options } = jobData;

            let products = [];
            let extractionMethod = 'unknown';
            let priceColumnsFound = [];

            if (documentStructure.sheetCount) {
                // Excel processing
                const result = await this.extractFromExcel(documentContent, supplierConfig);
                products = result.products;
                extractionMethod = 'excel';
                priceColumnsFound = result.priceColumnsFound;
            } else {
                // PDF processing
                const result = await this.extractFromPDF(documentContent, supplierConfig);
                products = result.products;
                extractionMethod = 'pdf';
                priceColumnsFound = result.priceColumnsFound;
            }

            // Apply CORRECTED pricing logic
            products = this.applyPricingLogic(products, options);

            // Categorize products if AI is enabled
            if (options.enableAI) {
                products = await this.categorizeProducts(products);
            }

            const processingTime = Date.now() - startTime;
            const confidenceScore = this.calculateConfidenceScore(products, priceColumnsFound);

            this.updateStats(true, products.length, priceColumnsFound, confidenceScore);

            return {
                success: true,
                products: products,
                extractionMethod: extractionMethod,
                priceColumnsFound: priceColumnsFound,
                confidenceScore: confidenceScore,
                processingTime: processingTime
            };

        } catch (error) {
            this.logger.error(`❌ Price extraction failed: ${error.message}`);
            this.updateStats(false, 0, [], 0);

            return {
                success: false,
                error: error.message
            };
        }
    }

    async extractFromExcel(sheets, supplierConfig) {
        const products = [];
        const priceColumnsFound = [];

        for (const [sheetName, data] of Object.entries(sheets)) {
            // Skip sheets based on configuration
            if (supplierConfig.skipSheets && 
                supplierConfig.skipSheets.some(skip => 
                    sheetName.toLowerCase().includes(skip.toLowerCase()))) {
                continue;
            }

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

            // Find price columns with priority
            const priceColumnIndex = this.findBestPriceColumn(headers, supplierConfig.priceColumnPriority);
            const nameColumnIndex = this.findNameColumn(headers);

            if (priceColumnIndex >= 0) {
                priceColumnsFound.push({
                    sheet: sheetName,
                    column: headers[priceColumnIndex],
                    index: priceColumnIndex,
                    type: this.determinePriceType(headers[priceColumnIndex])
                });
            }

            // Extract products from this sheet
            for (let i = headerRow + 1; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length === 0) continue;

                const name = nameColumnIndex >= 0 ? row[nameColumnIndex] : row[0];
                const price = priceColumnIndex >= 0 ? row[priceColumnIndex] : row[1];

                if (name && price && typeof name === 'string' && name.length > 2) {
                    const numericPrice = this.parsePrice(price);

                    if (!isNaN(numericPrice) && numericPrice > 0) {
                        products.push({
                            name: name.trim(),
                            price: numericPrice,
                            supplier: supplierConfig.supplierName,
                            description: name.trim(),
                            specifications: '',
                            category: 'uncategorized',
                            priceType: this.determinePriceType(headers[priceColumnIndex] || 'Standard'),
                            sheet: sheetName,
                            sourceRow: i + 1
                        });
                    }
                }
            }
        }

        return { products, priceColumnsFound };
    }

    async extractFromPDF(text, supplierConfig) {
        const products = [];
        const priceColumnsFound = [];
        const lines = text.split('\n').filter(line => line.trim().length > 0);

        // Special handling for Denon/Marantz format with Old RRP / New RRP columns
        if (supplierConfig.supplierName === 'Denon' || supplierConfig.supplierName === 'Marantz') {
            this.logger.info(`🎯 Using special ${supplierConfig.supplierName} PDF parsing (Old RRP vs New RRP)`);
            return this.extractFromDenonMarantzPDF(lines, supplierConfig);
        }

        // Standard PDF processing for other suppliers
        this.logger.info('📄 Using standard PDF parsing');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Enhanced price detection with priority for "New RRP"
            const priceMatches = [
                { pattern: /New\s+RRP[:\s]*R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i, type: 'New RRP', priority: 1 },
                { pattern: /Current\s+Price[:\s]*R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i, type: 'Current Price', priority: 2 },
                { pattern: /RRP[:\s]*R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i, type: 'RRP', priority: 3 },
                { pattern: /Old\s+RRP[:\s]*R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i, type: 'Old RRP', priority: 4 },
                { pattern: /R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/, type: 'Standard', priority: 5 }
            ];

            // Find the best price match based on priority
            let bestMatch = null;
            let bestPriority = Infinity;

            for (const priceMatch of priceMatches) {
                const match = line.match(priceMatch.pattern);
                if (match && priceMatch.priority < bestPriority) {
                    bestMatch = { match, type: priceMatch.type };
                    bestPriority = priceMatch.priority;
                }
            }

            if (bestMatch) {
                const productName = line.substring(0, line.indexOf(bestMatch.match[0])).trim();
                if (productName.length > 5) {
                    const price = parseFloat(bestMatch.match[1].replace(/,/g, ''));

                    products.push({
                        name: productName,
                        price: price,
                        supplier: supplierConfig.supplierName,
                        description: productName,
                        specifications: '',
                        category: 'uncategorized',
                        priceType: bestMatch.type,
                        sourceLine: i + 1
                    });

                    // Track price column types found
                    if (!priceColumnsFound.some(col => col.type === bestMatch.type)) {
                        priceColumnsFound.push({
                            type: bestMatch.type,
                            pattern: bestMatch.match[0],
                            priority: bestPriority
                        });
                    }
                }
            }
        }

        return { products, priceColumnsFound };
    }

    // 🎯 IMPROVED: Special method for Denon/Marantz PDF format
    async extractFromDenonMarantzPDF(lines, supplierConfig) {
        const products = [];
        const priceColumnsFound = [{
            type: 'New RRP',
            pattern: 'Denon/Marantz Column Format',
            priority: 1
        }];

        this.logger.info(`🔍 Processing ${lines.length} lines for ${supplierConfig.supplierName} format`);
        
        // Clean and prepare lines
        const cleanLines = lines.map(line => line.trim()).filter(line => 
            line.length > 0 && 
            !line.includes('##') &&
            !line.match(/^(April|Black|White|AV Receivers|Denon Home)$/i)
        );

        for (let i = 0; i < cleanLines.length; i++) {
            const line = cleanLines[i];
            
            // Skip header lines more thoroughly
            if (line.includes('Old RRP') || line.includes('New RRP') || 
                line.includes('April 2025') || line.length < 10) {
                continue;
            }

            // Method 1: Single line with product name and two prices
            // Pattern: "Product Name R9,990.00 R8,990.00"
            const singleLineMatch = line.match(/^(.+?)\s+R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s+R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)$/);
            
            if (singleLineMatch) {
                const productName = singleLineMatch[1].trim();
                const oldRRP = parseFloat(singleLineMatch[2].replace(/,/g, ''));
                const newRRP = parseFloat(singleLineMatch[3].replace(/,/g, ''));
                
                this.logger.info(`✅ Single line format: ${productName} - Old: R${oldRRP} → New: R${newRRP} (Selected New)`);
                
                products.push({
                    name: productName,
                    price: newRRP, // Always use New RRP (second price)
                    supplier: supplierConfig.supplierName,
                    description: productName,
                    specifications: '',
                    category: 'uncategorized',
                    priceType: 'New RRP',
                    sourceLine: i + 1,
                    oldRRP: oldRRP,
                    newRRP: newRRP,
                    priceSelectionReason: 'Selected New RRP over Old RRP (single line format)'
                });
                continue;
            }

            // Method 2: Product name with prices on same line but different format
            // Pattern: "Product Name R9,990.00 AnotherProduct R11,990.00 R35,990.00"
            const mixedLineMatch = line.match(/(.+?)\s+R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s+(.+?)\s+R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s+R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)$/);
            
            if (mixedLineMatch) {
                // First product
                const product1Name = mixedLineMatch[1].trim();
                const product1Price = parseFloat(mixedLineMatch[2].replace(/,/g, ''));
                
                products.push({
                    name: product1Name,
                    price: product1Price,
                    supplier: supplierConfig.supplierName,
                    description: product1Name,
                    specifications: '',
                    category: 'uncategorized',
                    priceType: 'RRP',
                    sourceLine: i + 1,
                    priceSelectionReason: 'Mixed line format - first product'
                });
                
                // Second product with two prices (Old RRP, New RRP)
                const product2Name = mixedLineMatch[3].trim();
                const product2OldRRP = parseFloat(mixedLineMatch[4].replace(/,/g, ''));
                const product2NewRRP = parseFloat(mixedLineMatch[5].replace(/,/g, ''));
                
                this.logger.info(`✅ Mixed line format: ${product2Name} - Old: R${product2OldRRP} → New: R${product2NewRRP} (Selected New)`);
                
                products.push({
                    name: product2Name,
                    price: product2NewRRP,
                    supplier: supplierConfig.supplierName,
                    description: product2Name,
                    specifications: '',
                    category: 'uncategorized',
                    priceType: 'New RRP',
                    sourceLine: i + 1,
                    oldRRP: product2OldRRP,
                    newRRP: product2NewRRP,
                    priceSelectionReason: 'Mixed line format - selected New RRP over Old RRP'
                });
                continue;
            }

            // Method 3: Multi-line format - Product name followed by prices
            if (!line.match(/R\s*\d/) && line.length > 10) {
                // This line might be a product name, check next few lines for prices
                const productName = line;
                
                // Look ahead for prices in the next 1-3 lines
                for (let j = i + 1; j < Math.min(i + 4, cleanLines.length); j++) {
                    const nextLine = cleanLines[j];
                    
                    // Check for two prices on the next line
                    const twoPricesMatch = nextLine.match(/R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s+R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)$/);
                    if (twoPricesMatch) {
                        const oldRRP = parseFloat(twoPricesMatch[1].replace(/,/g, ''));
                        const newRRP = parseFloat(twoPricesMatch[2].replace(/,/g, ''));
                        
                        this.logger.info(`✅ Multi-line format: ${productName} - Old: R${oldRRP} → New: R${newRRP} (Selected New)`);
                        
                        products.push({
                            name: productName,
                            price: newRRP,
                            supplier: supplierConfig.supplierName,
                            description: productName,
                            specifications: '',
                            category: 'uncategorized',
                            priceType: 'New RRP',
                            sourceLine: i + 1,
                            oldRRP: oldRRP,
                            newRRP: newRRP,
                            priceSelectionReason: 'Multi-line format - selected New RRP over Old RRP'
                        });
                        
                        i = j; // Skip the price line we just processed
                        break;
                    }
                    
                    // Check for single price on the next line
                    const onePriceMatch = nextLine.match(/R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)$/);
                    if (onePriceMatch) {
                        const price = parseFloat(onePriceMatch[1].replace(/,/g, ''));
                        
                        this.logger.info(`✅ Multi-line format: ${productName} - Single price: R${price}`);
                        
                        products.push({
                            name: productName,
                            price: price,
                            supplier: supplierConfig.supplierName,
                            description: productName,
                            specifications: '',
                            category: 'uncategorized',
                            priceType: 'RRP',
                            sourceLine: i + 1,
                            priceSelectionReason: 'Multi-line format - single price'
                        });
                        
                        i = j; // Skip the price line we just processed
                        break;
                    }
                }
            }

            // Method 4: Handle lines with multiple prices (fallback)
            const allPrices = line.match(/R\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g);
            if (allPrices && allPrices.length >= 2 && line.length > 20) {
                // Extract product name (everything before first price)
                const firstPriceIndex = line.indexOf(allPrices[0]);
                const productName = line.substring(0, firstPriceIndex).trim();
                
                if (productName.length > 5 && !productName.includes('R')) {
                    // Use last price as New RRP
                    const selectedPrice = parseFloat(allPrices[allPrices.length - 1].replace(/[^\d.]/g, ''));
                    
                    this.logger.info(`✅ Multi-price fallback: ${productName} - Selected last price: R${selectedPrice} from ${allPrices.length} prices`);
                    
                    products.push({
                        name: productName,
                        price: selectedPrice,
                        supplier: supplierConfig.supplierName,
                        description: productName,
                        specifications: '',
                        category: 'uncategorized',
                        priceType: 'New RRP',
                        sourceLine: i + 1,
                        allPricesFound: allPrices,
                        priceSelectionReason: `Selected last price R${selectedPrice} from ${allPrices.length} prices (${allPrices.join(', ')})`
                    });
                }
            }
        }

        this.logger.info(`🎉 ${supplierConfig.supplierName} extraction complete: ${products.length} products found`);
        
        // Log first few products for debugging
        products.slice(0, 3).forEach(product => {
            this.logger.info(`📝 Product: ${product.name} - R${product.price} (${product.priceSelectionReason})`);
        });
        
        return { products, priceColumnsFound };
    }

    findBestPriceColumn(headers, priorityList) {
        for (const priority of priorityList) {
            const index = headers.findIndex(h => 
                typeof h === 'string' && 
                h.toLowerCase().includes(priority.toLowerCase())
            );
            if (index >= 0) return index;
        }

        // Fallback to any price-related column
        return headers.findIndex(h => 
            typeof h === 'string' && 
            (h.toLowerCase().includes('price') || 
             h.toLowerCase().includes('rrp') || 
             h.toLowerCase().includes('cost'))
        );
    }

    findNameColumn(headers) {
        return headers.findIndex(h => 
            typeof h === 'string' && 
            (h.toLowerCase().includes('product') || 
             h.toLowerCase().includes('name') || 
             h.toLowerCase().includes('description'))
        );
    }

    determinePriceType(columnName) {
        const name = columnName.toLowerCase();
        if (name.includes('new') && name.includes('rrp')) return 'New RRP';
        if (name.includes('old') && name.includes('rrp')) return 'Old RRP';
        if (name.includes('current')) return 'Current Price';
        if (name.includes('rrp')) return 'RRP';
        return 'Standard';
    }

    parsePrice(priceValue) {
        if (typeof priceValue === 'number') return priceValue;
        if (typeof priceValue === 'string') {
            return parseFloat(priceValue.replace(/[^0-9.]/g, ''));
        }
        return NaN;
    }

    // 🔧 CORRECTED PRICING LOGIC
    applyPricingLogic(products, options) {
        this.logger.info(`💰 Applying pricing logic: ${options.priceType} with ${options.marginPercentage}% markup`);
        
        return products.map(product => {
            let costPrice = 0;
            let retailPrice = 0;
            const originalPrice = product.price;
            const vatRate = (options.vatRate || 15) / 100;
            const marginPercentage = (options.marginPercentage || 0) / 100;

            switch (options.priceType) {
                case 'retail_including_vat':
                    // Pricelist shows retail price, calculate cost by removing markup
                    retailPrice = originalPrice;
                    costPrice = originalPrice / (1 + marginPercentage);
                    this.logger.info(`📊 ${product.name}: Retail R${retailPrice} → Cost R${costPrice.toFixed(2)} (removed ${options.marginPercentage}% markup)`);
                    break;

                case 'cost_including_vat':
                    // Pricelist shows cost including VAT, add markup for retail
                    costPrice = originalPrice;
                    retailPrice = costPrice * (1 + marginPercentage);
                    this.logger.info(`📊 ${product.name}: Cost R${costPrice} → Retail R${retailPrice.toFixed(2)} (added ${options.marginPercentage}% markup)`);
                    break;

                case 'cost_excluding_vat':
                    // Pricelist shows cost excluding VAT, add VAT first, then markup
                    costPrice = originalPrice * (1 + vatRate); // Add VAT to get true cost
                    retailPrice = costPrice * (1 + marginPercentage); // Add markup for retail
                    this.logger.info(`📊 ${product.name}: Cost Excl R${originalPrice} → Cost Incl R${costPrice.toFixed(2)} → Retail R${retailPrice.toFixed(2)}`);
                    break;

                default:
                    // Fallback - treat as retail
                    retailPrice = originalPrice;
                    costPrice = originalPrice / (1 + marginPercentage);
                    this.logger.info(`📊 ${product.name}: Default pricing - Retail R${retailPrice} → Cost R${costPrice.toFixed(2)}`);
            }

            return {
                ...product,
                original_price: originalPrice,
                cost_price: Math.round(costPrice * 100) / 100,
                retail_price: Math.round(retailPrice * 100) / 100,
                final_price: Math.round(retailPrice * 100) / 100, // Keep for backward compatibility
                markup_percentage: (options.marginPercentage || 0),
                vat_rate: (options.vatRate || 15),
                price_calculation_method: options.priceType
            };
        });
    }

    async categorizeProducts(products) {
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

                const response = await this.openai.chat.completions.create({
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
                this.logger.error(`Error categorizing product ${product.name}:`, error);
                product.category = 'home';
                categorizedProducts.push(product);
            }
        }

        return categorizedProducts;
    }

    calculateConfidenceScore(products, priceColumnsFound) {
        let score = 0;

        // Base score for successful extraction
        if (products.length > 0) score += 30;

        // Bonus for finding "New RRP" columns
        const hasNewRRP = priceColumnsFound.some(col => col.type === 'New RRP');
        if (hasNewRRP) score += 40;

        // Bonus for consistent price types
        const priceTypes = products.map(p => p.priceType);
        const uniqueTypes = [...new Set(priceTypes)];
        if (uniqueTypes.length === 1) score += 20;

        // Penalty for using "Old RRP"
        const hasOldRRP = priceColumnsFound.some(col => col.type === 'Old RRP');
        if (hasOldRRP && !hasNewRRP) score -= 20;

        // Bonus for reasonable product count
        if (products.length >= 10) score += 10;

        return Math.max(0, Math.min(100, score));
    }

    updateStats(success, productCount, priceColumns, confidenceScore) {
        this.stats.extractionsPerformed++;

        if (success) {
            this.stats.successfulExtractions++;
            this.stats.priceColumnsDetected += priceColumns.length;

            // Count specific price types
            this.stats.newRRPDetected += priceColumns.filter(col => col.type === 'New RRP').length;
            this.stats.oldRRPDetected += priceColumns.filter(col => col.type === 'Old RRP').length;

            // Update average confidence score
            this.stats.averageConfidenceScore = 
                (this.stats.averageConfidenceScore * (this.stats.successfulExtractions - 1) + confidenceScore) / 
                this.stats.successfulExtractions;
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
            capabilities: {
                aiCategorization: true,
                priceTypeDetection: true,
                multiFormat: true,
                denonMarantzSpecialHandling: true
            }
        };
    }

    async getMetrics() {
        return this.stats;
    }

    async shutdown() {
        this.logger.info('🛑 Shutting down Price Agent...');
        this.healthy = false;
    }
}

module.exports = PriceAgent;