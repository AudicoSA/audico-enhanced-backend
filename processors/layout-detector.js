
const fs = require('fs');
const path = require('path');

/**
 * Intelligent Layout Detector for Audico Pricelist Processing
 * Automatically identifies different pricelist formats and structures
 */
class LayoutDetector {
    constructor(options = {}) {
        this.openai = options.openai;
        this.anthropic = options.anthropic;
        this.confidenceThreshold = options.confidenceThreshold || 0.7;

        // Known layout patterns learned from processing
        this.knownPatterns = new Map();
        this.loadKnownPatterns();

        // Layout classification rules
        this.layoutRules = this.initializeLayoutRules();
    }

    /**
     * Main layout analysis entry point
     */
    async analyzeLayout(fileBuffer, filename) {
        try {
            console.log(`🔍 Analyzing layout for: ${filename}`);

            const fileType = this.getFileType(filename);
            let layoutInfo;

            if (fileType === 'pdf') {
                layoutInfo = await this.analyzePDFLayout(fileBuffer);
            } else if (fileType === 'excel') {
                layoutInfo = await this.analyzeExcelLayout(fileBuffer);
            } else {
                throw new Error(`Unsupported file type: ${fileType}`);
            }

            // Enhance with AI analysis if available and confidence is low
            if (layoutInfo.confidence < this.confidenceThreshold && this.anthropic) {
                layoutInfo = await this.enhanceWithAI(layoutInfo, fileBuffer, filename);
            }

            // Store successful pattern for learning
            if (layoutInfo.confidence >= this.confidenceThreshold) {
                await this.storePattern(filename, layoutInfo);
            }

            return layoutInfo;

        } catch (error) {
            console.error('Layout analysis failed:', error);
            return {
                type: 'unknown',
                confidence: 0.1,
                error: error.message,
                fallbackStrategy: 'generic'
            };
        }
    }

    /**
     * Analyze PDF layout structure
     */
    async analyzePDFLayout(fileBuffer) {
        const pdfParse = require('pdf-parse');

        try {
            const pdfData = await pdfParse(fileBuffer);
            const text = pdfData.text;
            const lines = text.split('\n').filter(line => line.trim().length > 0);

            // Analyze text patterns
            const analysis = {
                totalLines: lines.length,
                averageLineLength: lines.reduce((sum, line) => sum + line.length, 0) / lines.length,
                hasTabularData: this.detectTabularData(lines),
                hasMultiColumn: this.detectMultiColumn(lines),
                hasCatalogStructure: this.detectCatalogStructure(lines),
                pricePatterns: this.detectPricePatterns(lines),
                headerFooterRatio: this.calculateHeaderFooterRatio(lines),
                consistentFormatting: this.analyzeFormattingConsistency(lines)
            };

            // Classify layout type
            const layoutType = this.classifyPDFLayout(analysis);
            const confidence = this.calculateLayoutConfidence(analysis, layoutType);

            return {
                type: layoutType.type,
                subtype: layoutType.subtype,
                confidence: confidence,
                characteristics: analysis,
                processingHints: this.generateProcessingHints(layoutType, analysis),
                metadata: {
                    pages: pdfData.numpages,
                    fileSize: fileBuffer.length,
                    textDensity: text.length / pdfData.numpages
                }
            };

        } catch (error) {
            throw new Error(`PDF layout analysis failed: ${error.message}`);
        }
    }

    /**
     * Analyze Excel layout structure
     */
    async analyzeExcelLayout(fileBuffer) {
        const XLSX = require('xlsx');

        try {
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const analysis = {
                sheetCount: workbook.SheetNames.length,
                sheets: []
            };

            // Analyze each sheet
            for (const sheetName of workbook.SheetNames) {
                const worksheet = workbook.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                const sheetAnalysis = {
                    name: sheetName,
                    rowCount: data.length,
                    columnCount: Math.max(...data.map(row => row.length)),
                    hasHeaders: this.detectExcelHeaders(data),
                    dataStructure: this.analyzeExcelDataStructure(data),
                    priceColumns: this.detectExcelPriceColumns(data),
                    productColumns: this.detectExcelProductColumns(data),
                    emptyRatio: this.calculateEmptyRatio(data),
                    consistencyScore: this.calculateExcelConsistency(data)
                };

                analysis.sheets.push(sheetAnalysis);
            }

            // Classify overall Excel layout
            const layoutType = this.classifyExcelLayout(analysis);
            const confidence = this.calculateExcelConfidence(analysis, layoutType);

            return {
                type: layoutType.type,
                subtype: layoutType.subtype,
                confidence: confidence,
                characteristics: analysis,
                processingHints: this.generateExcelProcessingHints(layoutType, analysis),
                metadata: {
                    fileSize: fileBuffer.length,
                    primarySheet: this.identifyPrimarySheet(analysis.sheets)
                }
            };

        } catch (error) {
            throw new Error(`Excel layout analysis failed: ${error.message}`);
        }
    }

    /**
     * Detect tabular data patterns in PDF
     */
    detectTabularData(lines) {
        let tabularScore = 0;
        const sampleSize = Math.min(50, lines.length);

        for (let i = 0; i < sampleSize; i++) {
            const line = lines[i];

            // Check for consistent column separators
            if (line.includes('\t') || line.match(/\s{3,}/g)) {
                tabularScore += 1;
            }

            // Check for price patterns in structured format
            if (line.match(/\b\d+[.,]\d{2}\b.*\b\d+[.,]\d{2}\b/)) {
                tabularScore += 2;
            }

            // Check for consistent field patterns
            if (line.match(/^[A-Z0-9-]+\s+.*\s+R?\s*\d+[.,]\d{2}/)) {
                tabularScore += 2;
            }
        }

        return {
            detected: tabularScore > sampleSize * 0.3,
            confidence: Math.min(1.0, tabularScore / (sampleSize * 0.5)),
            indicators: tabularScore
        };
    }

    /**
     * Detect multi-column layout in PDF
     */
    detectMultiColumn(lines) {
        const columnBreaks = [];
        let multiColumnScore = 0;

        // Look for consistent line length variations that suggest columns
        const lineLengths = lines.map(line => line.length);
        const avgLength = lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length;

        // Check for lines that are significantly shorter (column breaks)
        for (let i = 0; i < lines.length - 1; i++) {
            if (lines[i].length < avgLength * 0.5 && lines[i + 1].length > avgLength * 0.8) {
                columnBreaks.push(i);
                multiColumnScore++;
            }
        }

        // Check for horizontal alignment patterns
        const alignmentScore = this.analyzeHorizontalAlignment(lines);

        return {
            detected: multiColumnScore > 3 || alignmentScore > 0.6,
            confidence: Math.min(1.0, (multiColumnScore / 10) + alignmentScore),
            columnBreaks: columnBreaks,
            alignmentScore: alignmentScore
        };
    }

    /**
     * Detect catalog structure (product blocks with descriptions)
     */
    detectCatalogStructure(lines) {
        let catalogScore = 0;
        let productBlocks = 0;

        for (let i = 0; i < lines.length - 2; i++) {
            const currentLine = lines[i];
            const nextLine = lines[i + 1];
            const thirdLine = lines[i + 2];

            // Look for product header patterns
            if (this.isProductHeader(currentLine)) {
                // Check if followed by description and price
                if (nextLine.length > currentLine.length * 1.5) { // Description line
                    if (thirdLine.match(/R\s*\d+[.,]\d{2}/) || thirdLine.match(/\$\s*\d+[.,]\d{2}/)) {
                        productBlocks++;
                        catalogScore += 3;
                    }
                }
            }

            // Look for image placeholders or references
            if (currentLine.match(/\[image\]|\[photo\]|fig\s*\d+/i)) {
                catalogScore += 1;
            }
        }

        return {
            detected: productBlocks > 3,
            confidence: Math.min(1.0, productBlocks / 10),
            productBlocks: productBlocks,
            score: catalogScore
        };
    }

    /**
     * Detect price patterns and formats
     */
    detectPricePatterns(lines) {
        const patterns = {
            'R_format': 0,      // R 1,234.56
            'dollar_format': 0,  // $1,234.56
            'euro_format': 0,    // €1,234.56
            'plain_decimal': 0,  // 1234.56
            'new_rrp': 0,       // New RRP
            'old_rrp': 0,       // Old RRP
            'cost_price': 0,    // Cost
            'retail_price': 0   // Retail
        };

        const priceRegexes = {
            'R_format': /R\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,
            'dollar_format': /\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,
            'euro_format': /€\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,
            'plain_decimal': /\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g,
            'new_rrp': /new\s+rrp/gi,
            'old_rrp': /old\s+rrp/gi,
            'cost_price': /\bcost\b/gi,
            'retail_price': /\bretail\b/gi
        };

        for (const line of lines) {
            for (const [pattern, regex] of Object.entries(priceRegexes)) {
                const matches = line.match(regex);
                if (matches) {
                    patterns[pattern] += matches.length;
                }
            }
        }

        // Determine primary price format
        const primaryFormat = Object.entries(patterns)
            .filter(([key]) => ['R_format', 'dollar_format', 'euro_format', 'plain_decimal'].includes(key))
            .sort(([,a], [,b]) => b - a)[0];

        return {
            patterns: patterns,
            primaryFormat: primaryFormat ? primaryFormat[0] : 'unknown',
            hasNewRRP: patterns.new_rrp > 0,
            hasOldRRP: patterns.old_rrp > 0,
            hasCostPrice: patterns.cost_price > 0,
            hasRetailPrice: patterns.retail_price > 0,
            totalPriceReferences: Object.values(patterns).reduce((a, b) => a + b, 0)
        };
    }

    /**
     * Classify PDF layout type
     */
    classifyPDFLayout(analysis) {
        let type = 'unknown';
        let subtype = 'generic';

        // Decision tree for layout classification
        if (analysis.hasTabularData.detected && analysis.hasTabularData.confidence > 0.7) {
            type = 'table';
            if (analysis.pricePatterns.hasNewRRP && analysis.pricePatterns.hasOldRRP) {
                subtype = 'price_comparison_table';
            } else if (analysis.consistentFormatting > 0.8) {
                subtype = 'structured_table';
            } else {
                subtype = 'loose_table';
            }
        } else if (analysis.hasMultiColumn.detected) {
            type = 'multi-column';
            if (analysis.hasCatalogStructure.detected) {
                subtype = 'catalog_columns';
            } else {
                subtype = 'text_columns';
            }
        } else if (analysis.hasCatalogStructure.detected) {
            type = 'catalog';
            if (analysis.pricePatterns.totalPriceReferences > 20) {
                subtype = 'detailed_catalog';
            } else {
                subtype = 'simple_catalog';
            }
        } else if (analysis.pricePatterns.totalPriceReferences > 10) {
            type = 'list';
            subtype = 'price_list';
        } else {
            type = 'document';
            subtype = 'unstructured';
        }

        return { type, subtype };
    }

    /**
     * Classify Excel layout type
     */
    classifyExcelLayout(analysis) {
        let type = 'unknown';
        let subtype = 'generic';

        const primarySheet = analysis.sheets.find(sheet => 
            sheet.dataStructure.hasProductData && sheet.priceColumns.length > 0
        ) || analysis.sheets[0];

        if (!primarySheet) {
            return { type: 'empty', subtype: 'no_data' };
        }

        // Classify based on structure
        if (analysis.sheetCount === 1) {
            type = 'single-sheet';
            if (primarySheet.priceColumns.length > 2) {
                subtype = 'multi_price_columns';
            } else if (primarySheet.hasHeaders.detected) {
                subtype = 'structured_single';
            } else {
                subtype = 'unstructured_single';
            }
        } else {
            type = 'multi-sheet';
            const dataSheets = analysis.sheets.filter(sheet => 
                sheet.dataStructure.hasProductData
            ).length;

            if (dataSheets > 1) {
                subtype = 'multi_data_sheets';
            } else {
                subtype = 'single_data_multi_info';
            }
        }

        return { type, subtype };
    }

    /**
     * Detect Excel headers
     */
    detectExcelHeaders(data) {
        if (data.length === 0) return { detected: false, confidence: 0, row: -1 };

        const headerKeywords = [
            'product', 'name', 'description', 'price', 'rrp', 'cost',
            'model', 'code', 'sku', 'brand', 'category', 'qty', 'quantity',
            'new', 'old', 'current', 'retail', 'wholesale'
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

            // Bonus for having multiple relevant keywords
            if (score >= 3) score *= 1.5;

            if (score > bestScore) {
                bestScore = score;
                bestRow = i;
            }
        }

        return {
            detected: bestScore >= 2,
            confidence: Math.min(1.0, bestScore / 5),
            row: bestRow,
            score: bestScore
        };
    }

    /**
     * Detect Excel price columns
     */
    detectExcelPriceColumns(data) {
        if (data.length === 0) return [];

        const priceColumns = [];
        const maxCols = Math.max(...data.map(row => row.length));

        for (let col = 0; col < maxCols; col++) {
            let priceScore = 0;
            let numericCount = 0;
            let totalCells = 0;

            // Check column header
            const headerCell = data[0] && data[0][col] ? String(data[0][col]).toLowerCase() : '';
            if (headerCell.includes('price') || headerCell.includes('rrp') || headerCell.includes('cost')) {
                priceScore += 10;
            }

            // Check data cells
            for (let row = 1; row < Math.min(20, data.length); row++) {
                const cell = data[row] && data[row][col];
                if (cell !== undefined && cell !== '') {
                    totalCells++;

                    const cellStr = String(cell);

                    // Check if numeric
                    if (!isNaN(parseFloat(cellStr)) && isFinite(cellStr)) {
                        numericCount++;

                        // Check if looks like price
                        const numValue = parseFloat(cellStr);
                        if (numValue > 1 && numValue < 1000000) {
                            priceScore += 1;
                        }
                    }

                    // Check for currency symbols
                    if (cellStr.match(/[R$€£]/)) {
                        priceScore += 2;
                    }
                }
            }

            // Calculate confidence
            const numericRatio = totalCells > 0 ? numericCount / totalCells : 0;
            const confidence = numericRatio * 0.7 + (priceScore / 20) * 0.3;

            if (confidence > 0.5) {
                priceColumns.push({
                    column: col,
                    confidence: confidence,
                    header: headerCell,
                    numericRatio: numericRatio,
                    score: priceScore
                });
            }
        }

        return priceColumns.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Generate processing hints based on layout analysis
     */
    generateProcessingHints(layoutType, analysis) {
        const hints = {
            strategy: 'default',
            preprocessing: [],
            extraction: [],
            validation: []
        };

        switch (layoutType.type) {
            case 'table':
                hints.strategy = 'tabular';
                hints.preprocessing.push('normalize_spacing', 'detect_columns');
                hints.extraction.push('column_based_extraction');
                if (analysis.pricePatterns.hasNewRRP) {
                    hints.extraction.push('prioritize_new_rrp');
                }
                break;

            case 'multi-column':
                hints.strategy = 'column_reconstruction';
                hints.preprocessing.push('reconstruct_columns', 'merge_fragments');
                hints.extraction.push('sequential_processing');
                break;

            case 'catalog':
                hints.strategy = 'block_processing';
                hints.preprocessing.push('identify_product_blocks');
                hints.extraction.push('block_based_extraction');
                hints.validation.push('verify_product_completeness');
                break;

            default:
                hints.strategy = 'generic';
                hints.preprocessing.push('clean_text');
                hints.extraction.push('pattern_matching');
        }

        return hints;
    }

    /**
     * Generate Excel processing hints
     */
    generateExcelProcessingHints(layoutType, analysis) {
        const hints = {
            strategy: 'excel_structured',
            sheets: [],
            columns: [],
            processing: []
        };

        // Identify primary data sheet
        const primarySheet = this.identifyPrimarySheet(analysis.sheets);
        if (primarySheet) {
            hints.sheets.push({
                name: primarySheet.name,
                role: 'primary',
                headerRow: primarySheet.hasHeaders.row,
                priceColumns: primarySheet.priceColumns
            });
        }

        // Add processing strategies
        if (layoutType.type === 'multi-sheet') {
            hints.processing.push('multi_sheet_consolidation');
        }

        if (analysis.sheets.some(sheet => sheet.priceColumns.length > 2)) {
            hints.processing.push('multi_price_handling');
        }

        return hints;
    }

    /**
     * Identify primary data sheet in Excel
     */
    identifyPrimarySheet(sheets) {
        if (sheets.length === 0) return null;
        if (sheets.length === 1) return sheets[0];

        // Score sheets based on data quality
        let bestSheet = null;
        let bestScore = 0;

        for (const sheet of sheets) {
            let score = 0;

            // Prefer sheets with product data
            if (sheet.dataStructure.hasProductData) score += 10;

            // Prefer sheets with price columns
            score += sheet.priceColumns.length * 5;

            // Prefer sheets with headers
            if (sheet.hasHeaders.detected) score += 5;

            // Prefer sheets with more data
            score += Math.min(sheet.rowCount / 100, 5);

            // Penalize sheets with high empty ratio
            score -= sheet.emptyRatio * 5;

            // Prefer sheets with 'price' or 'product' in name
            const lowerName = sheet.name.toLowerCase();
            if (lowerName.includes('price') || lowerName.includes('product')) {
                score += 8;
            }

            if (score > bestScore) {
                bestScore = score;
                bestSheet = sheet;
            }
        }

        return bestSheet;
    }

    /**
     * Calculate layout confidence score
     */
    calculateLayoutConfidence(analysis, layoutType) {
        let confidence = 0.5; // Base confidence

        // Boost confidence based on detected patterns
        if (analysis.hasTabularData.detected) {
            confidence += analysis.hasTabularData.confidence * 0.3;
        }

        if (analysis.pricePatterns.totalPriceReferences > 5) {
            confidence += Math.min(0.2, analysis.pricePatterns.totalPriceReferences / 50);
        }

        if (analysis.consistentFormatting > 0.7) {
            confidence += 0.2;
        }

        // Penalize if no clear structure detected
        if (layoutType.type === 'unknown') {
            confidence *= 0.5;
        }

        return Math.min(1.0, confidence);
    }

    /**
     * Helper methods
     */
    getFileType(filename) {
        const ext = path.extname(filename).toLowerCase();
        if (ext === '.pdf') return 'pdf';
        if (ext === '.xlsx' || ext === '.xls') return 'excel';
        return 'unknown';
    }

    isProductHeader(line) {
        const productPatterns = [
            /^[A-Z0-9-]{3,}\s+/,  // Model number at start
            /^\d+\.\s+/,         // Numbered list
            /^[A-Z][a-z]+\s+[A-Z]/ // Brand Model pattern
        ];

        return productPatterns.some(pattern => pattern.test(line));
    }

    analyzeHorizontalAlignment(lines) {
        // Simplified alignment analysis
        const positions = [];

        for (const line of lines) {
            const words = line.split(/\s+/);
            let pos = 0;
            for (const word of words) {
                positions.push(pos);
                pos += word.length + 1;
            }
        }

        // Calculate alignment score based on position clustering
        // This is a simplified version
        return positions.length > 0 ? 0.5 : 0;
    }

    calculateHeaderFooterRatio(lines) {
        let headerFooterLines = 0;

        for (const line of lines) {
            if (this.isHeaderFooterLine(line)) {
                headerFooterLines++;
            }
        }

        return lines.length > 0 ? headerFooterLines / lines.length : 0;
    }

    isHeaderFooterLine(line) {
        const patterns = [
            /page \d+ of \d+/i,
            /^\s*\d+\s*$/,
            /copyright|©/i,
            /confidential|proprietary/i,
            /www\.|http/i
        ];

        return patterns.some(pattern => pattern.test(line));
    }

    analyzeFormattingConsistency(lines) {
        // Analyze consistency of line formatting
        const patterns = [];

        for (const line of lines) {
            const pattern = {
                length: line.length,
                hasNumbers: /\d/.test(line),
                hasCurrency: /[R$€£]/.test(line),
                wordCount: line.split(/\s+/).length,
                startsWithCaps: /^[A-Z]/.test(line)
            };
            patterns.push(pattern);
        }

        // Calculate consistency score (simplified)
        return patterns.length > 0 ? 0.7 : 0;
    }

    analyzeExcelDataStructure(data) {
        if (data.length === 0) {
            return { hasProductData: false, dataQuality: 0 };
        }

        let productIndicators = 0;
        let totalCells = 0;
        let filledCells = 0;

        // Sample first 20 rows
        for (let i = 0; i < Math.min(20, data.length); i++) {
            const row = data[i];
            if (!row) continue;

            for (const cell of row) {
                totalCells++;
                if (cell !== undefined && cell !== '') {
                    filledCells++;

                    const cellStr = String(cell).toLowerCase();

                    // Look for product-related keywords
                    if (cellStr.match(/speaker|amplifier|audio|sound|music|stereo|subwoofer|tweeter/)) {
                        productIndicators++;
                    }
                }
            }
        }

        const fillRatio = totalCells > 0 ? filledCells / totalCells : 0;
        const productRatio = filledCells > 0 ? productIndicators / filledCells : 0;

        return {
            hasProductData: productIndicators > 2,
            dataQuality: fillRatio,
            productIndicators: productIndicators,
            fillRatio: fillRatio,
            productRatio: productRatio
        };
    }

    detectExcelProductColumns(data) {
        const productColumns = [];
        const maxCols = Math.max(...data.map(row => row.length));

        for (let col = 0; col < maxCols; col++) {
            let productScore = 0;
            let textCount = 0;
            let totalCells = 0;

            // Check column header
            const headerCell = data[0] && data[0][col] ? String(data[0][col]).toLowerCase() : '';
            if (headerCell.includes('product') || headerCell.includes('name') || headerCell.includes('description')) {
                productScore += 10;
            }

            // Check data cells
            for (let row = 1; row < Math.min(20, data.length); row++) {
                const cell = data[row] && data[row][col];
                if (cell !== undefined && cell !== '') {
                    totalCells++;

                    const cellStr = String(cell);

                    // Check if text (not just numbers)
                    if (isNaN(parseFloat(cellStr)) && cellStr.length > 3) {
                        textCount++;

                        // Check for product-related terms
                        if (cellStr.toLowerCase().match(/speaker|amplifier|audio|sound|music/)) {
                            productScore += 2;
                        }
                    }
                }
            }

            const textRatio = totalCells > 0 ? textCount / totalCells : 0;
            const confidence = textRatio * 0.6 + (productScore / 20) * 0.4;

            if (confidence > 0.4) {
                productColumns.push({
                    column: col,
                    confidence: confidence,
                    header: headerCell,
                    textRatio: textRatio,
                    score: productScore
                });
            }
        }

        return productColumns.sort((a, b) => b.confidence - a.confidence);
    }

    calculateEmptyRatio(data) {
        let totalCells = 0;
        let emptyCells = 0;

        for (const row of data) {
            if (!row) continue;
            for (const cell of row) {
                totalCells++;
                if (cell === undefined || cell === '' || cell === null) {
                    emptyCells++;
                }
            }
        }

        return totalCells > 0 ? emptyCells / totalCells : 1;
    }

    calculateExcelConsistency(data) {
        // Simplified consistency calculation
        if (data.length < 2) return 0;

        const rowLengths = data.map(row => row ? row.length : 0);
        const avgLength = rowLengths.reduce((a, b) => a + b, 0) / rowLengths.length;

        let consistentRows = 0;
        for (const length of rowLengths) {
            if (Math.abs(length - avgLength) <= 2) {
                consistentRows++;
            }
        }

        return consistentRows / rowLengths.length;
    }

    calculateExcelConfidence(analysis, layoutType) {
        let confidence = 0.5;

        const primarySheet = this.identifyPrimarySheet(analysis.sheets);
        if (primarySheet) {
            // Boost confidence based on data quality
            confidence += primarySheet.dataStructure.dataQuality * 0.2;

            // Boost for detected headers
            if (primarySheet.hasHeaders.detected) {
                confidence += 0.2;
            }

            // Boost for price columns
            confidence += Math.min(0.2, primarySheet.priceColumns.length * 0.1);

            // Penalize high empty ratio
            confidence -= primarySheet.emptyRatio * 0.3;
        }

        return Math.min(1.0, Math.max(0.1, confidence));
    }

    /**
     * Enhance layout analysis with AI
     */
    async enhanceWithAI(layoutInfo, fileBuffer, filename) {
        try {
            // This would integrate with Claude/Anthropic API
            // For now, return the original analysis with slight confidence boost
            console.log('🤖 AI enhancement would be applied here');

            return {
                ...layoutInfo,
                confidence: Math.min(1.0, layoutInfo.confidence + 0.1),
                aiEnhanced: true
            };

        } catch (error) {
            console.warn('AI enhancement failed:', error);
            return layoutInfo;
        }
    }

    /**
     * Store successful pattern for learning
     */
    async storePattern(filename, layoutInfo) {
        try {
            const pattern = {
                filename: path.basename(filename),
                layoutType: layoutInfo.type,
                subtype: layoutInfo.subtype,
                confidence: layoutInfo.confidence,
                characteristics: layoutInfo.characteristics,
                timestamp: new Date().toISOString()
            };

            this.knownPatterns.set(filename, pattern);

            // In a real implementation, this would save to database
            console.log(`📚 Stored pattern for ${filename}: ${layoutInfo.type}/${layoutInfo.subtype}`);

        } catch (error) {
            console.warn('Failed to store pattern:', error);
        }
    }

    /**
     * Load known patterns from storage
     */
    async loadKnownPatterns() {
        try {
            // In a real implementation, this would load from database
            console.log('📖 Loading known layout patterns...');

        } catch (error) {
            console.warn('Failed to load patterns:', error);
        }
    }

    /**
     * Initialize layout classification rules
     */
    initializeLayoutRules() {
        return {
            pdf: {
                table: {
                    minTabularScore: 0.3,
                    minConsistency: 0.5
                },
                catalog: {
                    minProductBlocks: 3,
                    minDescriptionRatio: 0.4
                },
                multiColumn: {
                    minColumnBreaks: 3,
                    minAlignmentScore: 0.6
                }
            },
            excel: {
                structured: {
                    minHeaderConfidence: 0.5,
                    minDataQuality: 0.3
                },
                multiPrice: {
                    minPriceColumns: 2
                }
            }
        };
    }

    /**
     * Get layout statistics
     */
    getStats() {
        return {
            knownPatterns: this.knownPatterns.size,
            patterns: Array.from(this.knownPatterns.values()).reduce((acc, pattern) => {
                const key = `${pattern.layoutType}/${pattern.subtype}`;
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {})
        };
    }
}

module.exports = LayoutDetector;
