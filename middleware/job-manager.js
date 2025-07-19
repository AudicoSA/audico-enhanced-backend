const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const EventEmitter = require('events');

class JobManager extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            maxConcurrentJobs: config.maxConcurrentJobs || 5,
            jobTimeout: config.jobTimeout || 300000, // 5 minutes
            retryAttempts: config.retryAttempts || 3,
            cleanupInterval: config.cleanupInterval || 3600000, // 1 hour
            ...config
        };

        // In-memory job storage (in production, use Redis or database)
        this.jobs = new Map();
        this.activeJobs = new Set();
        this.jobQueue = [];

        // Initialize logging
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ filename: 'logs/job-manager.log' }),
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });

        this.healthy = true;
        this.stats = {
            totalJobs: 0,
            completedJobs: 0,
            failedJobs: 0,
            activeJobs: 0,
            queuedJobs: 0
        };

        // Start cleanup interval
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldJobs();
        }, this.config.cleanupInterval);

        this.logger.info('📋 Job Manager initialized');
    }

    async createJob(jobData) {
        const jobId = uuidv4();
        const job = {
            id: jobId,
            type: jobData.type || 'file_processing',
            status: 'queued',
            data: jobData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            attempts: 0,
            maxAttempts: this.config.retryAttempts,
            progress: 0,
            result: null,
            error: null,
            estimatedDuration: this.estimateJobDuration(jobData),
            priority: jobData.priority || 'normal'
        };

        this.jobs.set(jobId, job);
        this.jobQueue.push(jobId);
        this.stats.totalJobs++;
        this.stats.queuedJobs++;

        this.logger.info(`📝 Job created: ${jobId}`, {
            type: job.type,
            priority: job.priority,
            queuePosition: this.jobQueue.length
        });

        this.emit('jobCreated', job);

        // Try to process immediately if capacity allows
        this.processQueue();

        return jobId;
    }

    async getJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) {
            return null;
        }

        return {
            ...job,
            queuePosition: this.jobQueue.indexOf(jobId) + 1,
            estimatedWaitTime: this.estimateWaitTime(jobId)
        };
    }

    async getAllJobs(filters = {}) {
        let jobs = Array.from(this.jobs.values());

        // Apply filters
        if (filters.status) {
            jobs = jobs.filter(job => job.status === filters.status);
        }

        if (filters.type) {
            jobs = jobs.filter(job => job.type === filters.type);
        }

        if (filters.limit) {
            jobs = jobs.slice(0, filters.limit);
        }

        // Sort by creation date (newest first)
        jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return jobs;
    }

    async updateJobProgress(jobId, progress, message = null) {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new Error(`Job ${jobId} not found`);
        }

        job.progress = Math.min(100, Math.max(0, progress));
        job.updatedAt = new Date().toISOString();

        if (message) {
            job.statusMessage = message;
        }

        this.logger.debug(`📊 Job progress updated: ${jobId} - ${progress}%`);
        this.emit('jobProgress', { jobId, progress, message });

        return job;
    }

    async startJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new Error(`Job ${jobId} not found`);
        }

        if (job.status !== 'queued') {
            throw new Error(`Job ${jobId} is not in queued status`);
        }

        job.status = 'processing';
        job.startedAt = new Date().toISOString();
        job.updatedAt = new Date().toISOString();
        job.attempts++;

        this.activeJobs.add(jobId);
        this.stats.activeJobs++;
        this.stats.queuedJobs--;

        // Remove from queue
        const queueIndex = this.jobQueue.indexOf(jobId);
        if (queueIndex > -1) {
            this.jobQueue.splice(queueIndex, 1);
        }

        this.logger.info(`🚀 Job started: ${jobId}`, {
            attempt: job.attempts,
            maxAttempts: job.maxAttempts
        });

        this.emit('jobStarted', job);

        // Set timeout for job
        setTimeout(() => {
            this.timeoutJob(jobId);
        }, this.config.jobTimeout);

        return job;
    }

    async completeJob(jobId, result) {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new Error(`Job ${jobId} not found`);
        }

        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        job.updatedAt = new Date().toISOString();
        job.progress = 100;
        job.result = result;
        job.processingTime = new Date(job.completedAt) - new Date(job.startedAt);

        this.activeJobs.delete(jobId);
        this.stats.activeJobs--;
        this.stats.completedJobs++;

        this.logger.info(`✅ Job completed: ${jobId}`, {
            processingTime: job.processingTime,
            productsProcessed: result?.products?.length || 0
        });

        this.emit('jobCompleted', job);

        // Process next job in queue
        this.processQueue();

        return job;
    }

    async failJob(jobId, error) {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new Error(`Job ${jobId} not found`);
        }

        job.error = error.message || error;
        job.updatedAt = new Date().toISOString();

        // Check if we should retry
        if (job.attempts < job.maxAttempts) {
            job.status = 'queued';
            this.jobQueue.push(jobId); // Add back to queue for retry
            this.stats.queuedJobs++;

            this.logger.warn(`⚠️ Job failed, retrying: ${jobId}`, {
                attempt: job.attempts,
                maxAttempts: job.maxAttempts,
                error: job.error
            });

            this.emit('jobRetry', job);
        } else {
            job.status = 'failed';
            job.failedAt = new Date().toISOString();
            this.stats.failedJobs++;

            this.logger.error(`❌ Job failed permanently: ${jobId}`, {
                attempts: job.attempts,
                error: job.error
            });

            this.emit('jobFailed', job);
        }

        this.activeJobs.delete(jobId);
        this.stats.activeJobs--;

        // Process next job in queue
        this.processQueue();

        return job;
    }

    async cancelJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new Error(`Job ${jobId} not found`);
        }

        if (job.status === 'completed' || job.status === 'failed') {
            throw new Error(`Cannot cancel job ${jobId} - already ${job.status}`);
        }

        job.status = 'cancelled';
        job.cancelledAt = new Date().toISOString();
        job.updatedAt = new Date().toISOString();

        // Remove from active jobs and queue
        this.activeJobs.delete(jobId);
        const queueIndex = this.jobQueue.indexOf(jobId);
        if (queueIndex > -1) {
            this.jobQueue.splice(queueIndex, 1);
            this.stats.queuedJobs--;
        } else {
            this.stats.activeJobs--;
        }

        this.logger.info(`🚫 Job cancelled: ${jobId}`);
        this.emit('jobCancelled', job);

        return job;
    }

    processQueue() {
        // Process jobs if we have capacity
        while (this.activeJobs.size < this.config.maxConcurrentJobs && this.jobQueue.length > 0) {
            const nextJobId = this.jobQueue[0];
            const job = this.jobs.get(nextJobId);

            if (job && job.status === 'queued') {
                // This would typically trigger the actual processing
                // For now, we just mark it as ready to be picked up
                this.emit('jobReady', job);
                break; // Let the orchestrator handle the actual processing
            } else {
                // Remove invalid job from queue
                this.jobQueue.shift();
                this.stats.queuedJobs--;
            }
        }
    }

    timeoutJob(jobId) {
        const job = this.jobs.get(jobId);
        if (job && job.status === 'processing') {
            this.logger.warn(`⏰ Job timed out: ${jobId}`);
            this.failJob(jobId, new Error('Job timed out'));
        }
    }

    estimateJobDuration(jobData) {
        // Simple estimation based on file size and type
        const baseTime = 30000; // 30 seconds base

        if (jobData.fileBuffer) {
            const sizeInMB = jobData.fileBuffer.length / (1024 * 1024);
            return baseTime + (sizeInMB * 10000); // Add 10 seconds per MB
        }

        return baseTime;
    }

    estimateWaitTime(jobId) {
        const queuePosition = this.jobQueue.indexOf(jobId);
        if (queuePosition === -1) return 0;

        // Estimate based on average processing time and queue position
        const avgProcessingTime = 60000; // 1 minute average
        const availableSlots = this.config.maxConcurrentJobs - this.activeJobs.size;

        if (queuePosition < availableSlots) {
            return 0; // Will start immediately
        }

        return (queuePosition - availableSlots + 1) * avgProcessingTime;
    }

    cleanupOldJobs() {
        const cutoffTime = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours ago
        let cleanedCount = 0;

        for (const [jobId, job] of this.jobs.entries()) {
            if (job.status === 'completed' || job.status === 'failed') {
                const jobTime = new Date(job.updatedAt);
                if (jobTime < cutoffTime) {
                    this.jobs.delete(jobId);
                    cleanedCount++;
                }
            }
        }

        if (cleanedCount > 0) {
            this.logger.info(`🧹 Cleaned up ${cleanedCount} old jobs`);
        }
    }

    getStats() {
        return {
            ...this.stats,
            queueLength: this.jobQueue.length,
            activeJobsCount: this.activeJobs.size,
            totalJobsInMemory: this.jobs.size,
            healthy: this.healthy
        };
    }

    isHealthy() {
        return this.healthy && this.activeJobs.size <= this.config.maxConcurrentJobs;
    }

    async shutdown() {
        this.logger.info('🛑 Shutting down Job Manager...');

        // Clear cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // Cancel all queued jobs
        for (const jobId of this.jobQueue) {
            await this.cancelJob(jobId);
        }

        // Wait for active jobs to complete (with timeout)
        const shutdownTimeout = 30000; // 30 seconds
        const startTime = Date.now();

        while (this.activeJobs.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        this.healthy = false;
        this.logger.info('✅ Job Manager shutdown complete');
    }
}

module.exports = JobManager;
