const winston = require('winston');
const EventEmitter = require('events');
const os = require('os');

class AgentHealthMonitor extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            checkInterval: config.checkInterval || 30000, // 30 seconds
            alertThreshold: config.alertThreshold || 3, // 3 consecutive failures
            memoryThreshold: config.memoryThreshold || 0.9, // 90% memory usage
            responseTimeThreshold: config.responseTimeThreshold || 5000, // 5 seconds
            ...config
        };

        // Health status tracking
        this.agentHealth = new Map();
        this.systemHealth = {
            status: 'healthy',
            uptime: 0,
            memory: { used: 0, total: 0, percentage: 0 },
            cpu: { usage: 0 },
            lastCheck: new Date().toISOString()
        };

        this.alerts = [];
        this.consecutiveFailures = new Map();

        // Initialize logging
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ filename: 'logs/health-monitor.log' }),
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });

        this.healthy = true;
        this.monitoringActive = false;

        this.logger.info('🏥 Health Monitor initialized');
    }

    startMonitoring() {
        if (this.monitoringActive) {
            this.logger.warn('Health monitoring already active');
            return;
        }

        this.monitoringActive = true;

        // Start periodic health checks
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, this.config.checkInterval);

        // Start system monitoring
        this.systemMonitorInterval = setInterval(() => {
            this.monitorSystemHealth();
        }, this.config.checkInterval);

        this.logger.info('🔍 Health monitoring started');
    }

    stopMonitoring() {
        this.monitoringActive = false;

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        if (this.systemMonitorInterval) {
            clearInterval(this.systemMonitorInterval);
        }

        this.logger.info('⏹️ Health monitoring stopped');
    }

    registerAgent(agentName, agent) {
        this.agentHealth.set(agentName, {
            agent: agent,
            status: 'unknown',
            lastCheck: null,
            responseTime: 0,
            consecutiveFailures: 0,
            totalChecks: 0,
            successfulChecks: 0,
            lastError: null,
            metrics: {}
        });

        this.consecutiveFailures.set(agentName, 0);

        this.logger.info(`📋 Registered agent for monitoring: ${agentName}`);
    }

    async performHealthCheck() {
        const checkStartTime = Date.now();

        for (const [agentName, healthInfo] of this.agentHealth.entries()) {
            try {
                const agentCheckStart = Date.now();

                // Perform health check on agent
                let isHealthy = false;
                let metrics = {};

                if (healthInfo.agent && typeof healthInfo.agent.isHealthy === 'function') {
                    isHealthy = await healthInfo.agent.isHealthy();
                }

                if (healthInfo.agent && typeof healthInfo.agent.getMetrics === 'function') {
                    metrics = await healthInfo.agent.getMetrics();
                }

                const responseTime = Date.now() - agentCheckStart;

                // Update health info
                healthInfo.status = isHealthy ? 'healthy' : 'unhealthy';
                healthInfo.lastCheck = new Date().toISOString();
                healthInfo.responseTime = responseTime;
                healthInfo.totalChecks++;
                healthInfo.metrics = metrics;

                if (isHealthy) {
                    healthInfo.successfulChecks++;
                    healthInfo.consecutiveFailures = 0;
                    this.consecutiveFailures.set(agentName, 0);
                    healthInfo.lastError = null;
                } else {
                    healthInfo.consecutiveFailures++;
                    this.consecutiveFailures.set(agentName, healthInfo.consecutiveFailures);
                }

                // Check for alerts
                this.checkForAlerts(agentName, healthInfo, responseTime);

            } catch (error) {
                this.handleAgentCheckError(agentName, error);
            }
        }

        const totalCheckTime = Date.now() - checkStartTime;
        this.logger.debug(`🔍 Health check completed in ${totalCheckTime}ms`);
    }

    handleAgentCheckError(agentName, error) {
        const healthInfo = this.agentHealth.get(agentName);
        if (healthInfo) {
            healthInfo.status = 'error';
            healthInfo.lastCheck = new Date().toISOString();
            healthInfo.lastError = error.message;
            healthInfo.consecutiveFailures++;
            healthInfo.totalChecks++;

            const failures = this.consecutiveFailures.get(agentName) + 1;
            this.consecutiveFailures.set(agentName, failures);

            this.logger.error(`❌ Health check failed for ${agentName}:`, error);

            // Check for alerts
            this.checkForAlerts(agentName, healthInfo, null);
        }
    }

    checkForAlerts(agentName, healthInfo, responseTime) {
        const failures = this.consecutiveFailures.get(agentName);

        // Alert for consecutive failures
        if (failures >= this.config.alertThreshold) {
            this.createAlert('agent_failure', {
                agent: agentName,
                consecutiveFailures: failures,
                lastError: healthInfo.lastError,
                severity: 'high'
            });
        }

        // Alert for slow response time
        if (responseTime && responseTime > this.config.responseTimeThreshold) {
            this.createAlert('slow_response', {
                agent: agentName,
                responseTime: responseTime,
                threshold: this.config.responseTimeThreshold,
                severity: 'medium'
            });
        }

        // Alert for low success rate
        if (healthInfo.totalChecks > 10) {
            const successRate = healthInfo.successfulChecks / healthInfo.totalChecks;
            if (successRate < 0.8) { // Less than 80% success rate
                this.createAlert('low_success_rate', {
                    agent: agentName,
                    successRate: Math.round(successRate * 100),
                    totalChecks: healthInfo.totalChecks,
                    severity: 'medium'
                });
            }
        }
    }

    monitorSystemHealth() {
        try {
            const memUsage = process.memoryUsage();
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const memPercentage = usedMem / totalMem;

            this.systemHealth = {
                status: memPercentage > this.config.memoryThreshold ? 'warning' : 'healthy',
                uptime: process.uptime(),
                memory: {
                    used: Math.round(usedMem / 1024 / 1024), // MB
                    total: Math.round(totalMem / 1024 / 1024), // MB
                    percentage: Math.round(memPercentage * 100),
                    heap: {
                        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
                        total: Math.round(memUsage.heapTotal / 1024 / 1024) // MB
                    }
                },
                cpu: {
                    loadAverage: os.loadavg(),
                    cores: os.cpus().length
                },
                lastCheck: new Date().toISOString()
            };

            // Alert for high memory usage
            if (memPercentage > this.config.memoryThreshold) {
                this.createAlert('high_memory_usage', {
                    memoryPercentage: Math.round(memPercentage * 100),
                    threshold: Math.round(this.config.memoryThreshold * 100),
                    severity: 'high'
                });
            }

        } catch (error) {
            this.logger.error('❌ System health monitoring error:', error);
        }
    }

    createAlert(type, details) {
        const alert = {
            id: require('uuid').v4(),
            type: type,
            details: details,
            timestamp: new Date().toISOString(),
            acknowledged: false
        };

        // Check if similar alert already exists (avoid spam)
        const existingAlert = this.alerts.find(a => 
            a.type === type && 
            a.details.agent === details.agent && 
            !a.acknowledged &&
            (Date.now() - new Date(a.timestamp).getTime()) < 300000 // 5 minutes
        );

        if (!existingAlert) {
            this.alerts.push(alert);

            // Keep only last 100 alerts
            if (this.alerts.length > 100) {
                this.alerts = this.alerts.slice(-100);
            }

            this.logger.warn(`🚨 Alert created: ${type}`, details);
            this.emit('alert', alert);
        }
    }

    acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            alert.acknowledgedAt = new Date().toISOString();
            this.logger.info(`✅ Alert acknowledged: ${alertId}`);
            return true;
        }
        return false;
    }

    getStatus() {
        const agentStatuses = {};
        for (const [agentName, healthInfo] of this.agentHealth.entries()) {
            agentStatuses[agentName] = {
                status: healthInfo.status,
                lastCheck: healthInfo.lastCheck,
                responseTime: healthInfo.responseTime,
                successRate: healthInfo.totalChecks > 0 ? 
                    Math.round((healthInfo.successfulChecks / healthInfo.totalChecks) * 100) : 0,
                consecutiveFailures: healthInfo.consecutiveFailures
            };
        }

        return {
            overall: this.getOverallStatus(),
            system: this.systemHealth,
            agents: agentStatuses,
            monitoring: this.monitoringActive,
            alerts: this.getActiveAlerts()
        };
    }

    async getDetailedStatus() {
        const status = this.getStatus();

        // Add detailed metrics for each agent
        for (const [agentName, healthInfo] of this.agentHealth.entries()) {
            if (status.agents[agentName]) {
                status.agents[agentName].metrics = healthInfo.metrics;
                status.agents[agentName].lastError = healthInfo.lastError;
                status.agents[agentName].totalChecks = healthInfo.totalChecks;
            }
        }

        return status;
    }

    getOverallStatus() {
        let healthyAgents = 0;
        let totalAgents = this.agentHealth.size;

        for (const [, healthInfo] of this.agentHealth.entries()) {
            if (healthInfo.status === 'healthy') {
                healthyAgents++;
            }
        }

        if (totalAgents === 0) return 'unknown';
        if (healthyAgents === totalAgents) return 'healthy';
        if (healthyAgents === 0) return 'critical';
        return 'degraded';
    }

    getActiveAlerts() {
        return this.alerts
            .filter(alert => !alert.acknowledged)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 10); // Return last 10 active alerts
    }

    getAllAlerts(limit = 50) {
        return this.alerts
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    clearOldAlerts() {
        const cutoffTime = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago
        const initialCount = this.alerts.length;

        this.alerts = this.alerts.filter(alert => 
            new Date(alert.timestamp) > cutoffTime
        );

        const clearedCount = initialCount - this.alerts.length;
        if (clearedCount > 0) {
            this.logger.info(`🧹 Cleared ${clearedCount} old alerts`);
        }
    }

    isHealthy() {
        return this.healthy && this.getOverallStatus() !== 'critical';
    }

    async shutdown() {
        this.logger.info('🛑 Shutting down Health Monitor...');

        this.stopMonitoring();
        this.healthy = false;

        // Clear old alerts
        this.clearOldAlerts();

        this.logger.info('✅ Health Monitor shutdown complete');
    }
}

module.exports = AgentHealthMonitor;
