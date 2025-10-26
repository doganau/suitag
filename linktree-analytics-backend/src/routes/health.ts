import express from 'express';
import { prisma } from '../config/database';
import { redisClient } from '../config/redis';
import { suiService } from '../services/suiService';
import { logger } from '../utils/logger';
import { config } from '../config/config';

const router = express.Router();

// Basic health check
router.get('/', async (req: express.Request, res: express.Response) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.nodeEnv,
      services: {
        database: 'unknown',
        redis: 'unknown',
        sui: 'unknown',
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };

    // Test database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      healthStatus.services.database = 'healthy';
    } catch (error) {
      healthStatus.services.database = 'unhealthy';
      healthStatus.status = 'degraded';
    }

    // Test Redis connection
    try {
      await redisClient.ping();
      healthStatus.services.redis = 'healthy';
    } catch (error) {
      healthStatus.services.redis = 'unhealthy';
      healthStatus.status = 'degraded';
    }

    // Test Sui connection
    try {
      await suiService.testConnection();
      healthStatus.services.sui = 'healthy';
    } catch (error) {
      healthStatus.services.sui = 'unhealthy';
      healthStatus.status = 'degraded';
    }

    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

// Detailed health check
router.get('/detailed', async (req: express.Request, res: express.Response) => {
  try {
    const detailedHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.nodeEnv,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version,
      },
      services: {
        database: {
          status: 'unknown',
          responseTime: 0,
          error: null,
        },
        redis: {
          status: 'unknown',
          responseTime: 0,
          error: null,
        },
        sui: {
          status: 'unknown',
          responseTime: 0,
          error: null,
        },
      },
      metrics: {
        totalProfiles: 0,
        totalViews: 0,
        totalClicks: 0,
        activeSessions: 0,
      },
    };

    // Test database connection with timing
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      detailedHealth.services.database.status = 'healthy';
      detailedHealth.services.database.responseTime = Date.now() - dbStart;

      // Get database metrics
      const [profileCount, viewCount, clickCount, sessionCount] = await Promise.all([
        prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM profile_views WHERE profile_id IS NOT NULL`,
        prisma.profileView.count(),
        prisma.linkClick.count(),
        prisma.session.count({
          where: {
            endTime: null,
            startTime: {
              gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
            },
          },
        }),
      ]);

      detailedHealth.metrics.totalProfiles = Number(profileCount[0]?.count || 0);
      detailedHealth.metrics.totalViews = viewCount;
      detailedHealth.metrics.totalClicks = clickCount;
      detailedHealth.metrics.activeSessions = sessionCount;
    } catch (error) {
      detailedHealth.services.database.status = 'unhealthy';
      detailedHealth.services.database.error = (error as Error).message;
      detailedHealth.status = 'degraded';
    }

    // Test Redis connection with timing
    try {
      const redisStart = Date.now();
      await redisClient.ping();
      detailedHealth.services.redis.status = 'healthy';
      detailedHealth.services.redis.responseTime = Date.now() - redisStart;
    } catch (error) {
      detailedHealth.services.redis.status = 'unhealthy';
      detailedHealth.services.redis.error = (error as Error).message;
      detailedHealth.status = 'degraded';
    }

    // Test Sui connection with timing
    try {
      const suiStart = Date.now();
      await suiService.testConnection();
      detailedHealth.services.sui.status = 'healthy';
      detailedHealth.services.sui.responseTime = Date.now() - suiStart;
    } catch (error) {
      detailedHealth.services.sui.status = 'unhealthy';
      detailedHealth.services.sui.error = (error as Error).message;
      detailedHealth.status = 'degraded';
    }

    const statusCode = detailedHealth.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(detailedHealth);
  } catch (error) {
    logger.error('Detailed health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Detailed health check failed',
    });
  }
});

// Database health check
router.get('/database', async (req: express.Request, res: express.Response) => {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - start;

    res.json({
      status: 'healthy',
      service: 'database',
      responseTime,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Database health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'database',
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Redis health check
router.get('/redis', async (req: express.Request, res: express.Response) => {
  try {
    const start = Date.now();
    await redisClient.ping();
    const responseTime = Date.now() - start;

    res.json({
      status: 'healthy',
      service: 'redis',
      responseTime,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Redis health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'redis',
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Sui network health check
router.get('/sui', async (req: express.Request, res: express.Response) => {
  try {
    const start = Date.now();
    const isHealthy = await suiService.testConnection();
    const responseTime = Date.now() - start;

    if (isHealthy) {
      res.json({
        status: 'healthy',
        service: 'sui',
        network: config.sui.network,
        responseTime,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        service: 'sui',
        network: config.sui.network,
        error: 'Connection test failed',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Sui health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'sui',
      network: config.sui.network,
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
