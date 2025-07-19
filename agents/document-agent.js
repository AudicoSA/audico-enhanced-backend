const winston = require('winston');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const tesseract = require('tesseract.js');

class DocumentAgent {
    constructor(config) {
        this.config = config;
        this.logger = config.logger;
        this.healthy = false;
        this.version = '1.0.0';

        this.stats = {
            documentsProcessed: 0,
            successfulExtractions: 0,
            failedExtractions: 0,
            averageProcessingTime: 0
        };
    }

    async initialize() {
        try {
            this.logger.info('📄 Initializing Document Agent...');

            // Initialize OCR engines if configured
            if (this.config.enableOCR) {
                await this.initializeOCR();
            }

            this.healthy = true;
            this.logger.info('✅ Document Agent initialized');
        } catch (error) {
            this.logger.error('❌ Document Agent initialization failed:', error);
            this.healthy = false;
        }
    }

    async initializeOCR() {
        // Initialize Tesseract.js for fallback OCR
        this.logger.info('🔍 Initializing OCR engines...');
        // OCR initialization code would go here
    }

    async processDocument(jobData) {
        const startTime = Date.now();

        try {
            this.logger.info(`📄 Processing document: ${jobData.filename}`);

            let result;
            const fileExtension = jobData.filename.toLowerCase().split('.').pop();

            if (fileExtension === 'pdf') {
                result = await this.processPDF(jobData.fileBuffer);
            } else if (['xlsx', 'xls'].includes(fileExtension)) {
                result = await this.processExcel(jobData.fileBuffer);
            } else {
                throw new Error(`Unsupported file type: ${fileExtension}`);
            }

            const processingTime = Date.now() - startTime;
            this.updateStats(true, processingTime);

            return {
                success: true,
                documentType: fileExtension,
                content: result.content,
                documentStructure: result.structure,
                extractionMethod: result.method,
                processingTime: processingTime
            };

        } catch (error) {
            this.logger.error(`❌ Document processing failed: ${error.message}`);
            this.updateStats(false, Date.now() - startTime);

            return {
                success: false,
                error: error.message
            };
        }
    }

    async processPDF(fileBuffer) {
        try {
            const pdfData = await pdfParse(fileBuffer);

            return {
                content: pdfData.text,
                structure: {
                    pages: pdfData.numpages,
                    textLength: pdfData.text.length,
                    hasImages: false // Would be detected in full implementation
                },
                method: 'pdf-parse'
            };
        } catch (error) {
            this.logger.error('PDF processing failed:', error);
            throw error;
        }
    }

    async processExcel(fileBuffer) {
        try {
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const sheets = {};

            for (const sheetName of workbook.SheetNames) {
                const worksheet = workbook.Sheets[sheetName];
                sheets[sheetName] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            }

            return {
                content: sheets,
                structure: {
                    sheetCount: workbook.SheetNames.length,
                    sheetNames: workbook.SheetNames,
                    totalRows: Object.values(sheets).reduce((sum, sheet) => sum + sheet.length, 0)
                },
                method: 'xlsx'
            };
        } catch (error) {
            this.logger.error('Excel processing failed:', error);
            throw error;
        }
    }

    updateStats(success, processingTime) {
        this.stats.documentsProcessed++;

        if (success) {
            this.stats.successfulExtractions++;
        } else {
            this.stats.failedExtractions++;
        }

        this.stats.averageProcessingTime = 
            (this.stats.averageProcessingTime * (this.stats.documentsProcessed - 1) + processingTime) / 
            this.stats.documentsProcessed;
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
                pdf: true,
                excel: true,
                ocr: this.config.enableOCR || false
            }
        };
    }

    async getMetrics() {
        return this.stats;
    }

    async shutdown() {
        this.logger.info('🛑 Shutting down Document Agent...');
        this.healthy = false;
    }
}

module.exports = DocumentAgent;
