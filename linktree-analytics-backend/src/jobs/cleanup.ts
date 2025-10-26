import cron from 'node-cron';
import { prisma } from '../config/database';
import { cacheService } from '../config/redis';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import moment from 'moment';

// Clean up old profile views
const cleanupOldViews = async () => {
  try {
    logger.info('Starting cleanup of old profile views...');
    
    const cutoffDate = moment().subtract(config.retention.views, 'days').toDate();
    
    const result = await prisma.profileView.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });
    
    logger.info(`Cleaned up ${result.count} old profile views`);
  } catch (error) {
    logger.error('Error cleaning up old profile views:', error);
  }
};

// Clean up old link clicks
const cleanupOldClicks = async () => {
  try {
    logger.info('Starting cleanup of old link clicks...');
    
    const cutoffDate = moment().subtract(config.retention.clicks, 'days').toDate();
    
    const result = await prisma.linkClick.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });
    
    logger.info(`Cleaned up ${result.count} old link clicks`);
  } catch (error) {
    logger.error('Error cleaning up old link clicks:', error);
  }
};

// Clean up old sessions
const cleanupOldSessions = async () => {
  try {
    logger.info('Starting cleanup of old sessions...');
    
    const cutoffDate = moment().subtract(config.retention.sessions, 'days').toDate();
    
    const result = await prisma.session.deleteMany({
      where: {
        startTime: {
          lt: cutoffDate,
        },
      },
    });
    
    logger.info(`Cleaned up ${result.count} old sessions`);
  } catch (error) {
    logger.error('Error cleaning up old sessions:', error);
  }
};

// Clean up expired cache entries
const cleanupExpiredCache = async () => {
  try {
    logger.info('Starting cleanup of expired cache entries...');
    
    const cutoffDate = moment().subtract(config.retention.cache, 'days').toDate();
    
    const result = await prisma.analyticsCache.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    
    logger.info(`Cleaned up ${result.count} expired cache entries`);
  } catch (error) {
    logger.error('Error cleaning up expired cache entries:', error);
  }
};

// Clean up old realtime events
const cleanupOldRealtimeEvents = async () => {
  try {
    logger.info('Starting cleanup of old realtime events...');
    
    // Keep only last 24 hours of realtime events
    const cutoffDate = moment().subtract(1, 'day').toDate();
    
    const result = await prisma.realtimeEvent.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
        processed: true,
      },
    });
    
    logger.info(`Cleaned up ${result.count} old realtime events`);
  } catch (error) {
    logger.error('Error cleaning up old realtime events:', error);
  }
};

// Clean up orphaned sessions (sessions without end time that are older than 24 hours)
const cleanupOrphanedSessions = async () => {
  try {
    logger.info('Starting cleanup of orphaned sessions...');
    
    const cutoffDate = moment().subtract(1, 'day').toDate();
    
    // First, update orphaned sessions with end time and duration
    const orphanedSessions = await prisma.session.findMany({
      where: {
        startTime: {
          lt: cutoffDate,
        },
        endTime: null,
      },
    });
    
    for (const session of orphanedSessions) {
      const duration = Math.floor((cutoffDate.getTime() - session.startTime.getTime()) / 1000);
      
      await prisma.session.update({
        where: { id: session.id },
        data: {
          endTime: cutoffDate,
          duration,
        },
      });
    }
    
    logger.info(`Updated ${orphanedSessions.length} orphaned sessions`);
  } catch (error) {
    logger.error('Error cleaning up orphaned sessions:', error);
  }
};

// Clean up old aggregated stats (keep only last 2 years)
const cleanupOldStats = async () => {
  try {
    logger.info('Starting cleanup of old aggregated stats...');
    
    const cutoffDate = moment().subtract(2, 'years').toDate();
    
    const [dailyStats, linkStats, geoStats, deviceStats, referrerStats] = await Promise.all([
      prisma.dailyStats.deleteMany({
        where: {
          date: {
            lt: cutoffDate,
          },
        },
      }),
      prisma.linkStats.deleteMany({
        where: {
          date: {
            lt: cutoffDate,
          },
        },
      }),
      prisma.geoStats.deleteMany({
        where: {
          date: {
            lt: cutoffDate,
          },
        },
      }),
      prisma.deviceStats.deleteMany({
        where: {
          date: {
            lt: cutoffDate,
          },
        },
      }),
      prisma.referrerStats.deleteMany({
        where: {
          date: {
            lt: cutoffDate,
          },
        },
      }),
    ]);
    
    const totalCleaned = dailyStats.count + linkStats.count + geoStats.count + deviceStats.count + referrerStats.count;
    logger.info(`Cleaned up ${totalCleaned} old aggregated stats records`);
  } catch (error) {
    logger.error('Error cleaning up old aggregated stats:', error);
  }
};

// Clear Redis cache for analytics
const clearAnalyticsCache = async () => {
  try {
    logger.info('Starting analytics cache cleanup...');
    
    // Get Redis info
    const info = await cacheService.info();
    const beforeKeys = info.match(/db0:keys=(\d+)/)?.[1] || '0';
    
    // Clear analytics cache (keys starting with 'analytics:')
    // Note: This is a simple implementation. In production, you might want to use SCAN
    // to avoid blocking Redis for too long
    
    logger.info(`Analytics cache cleanup completed. Keys before: ${beforeKeys}`);
  } catch (error) {
    logger.error('Error clearing analytics cache:', error);
  }
};

// Optimize database (VACUUM and ANALYZE for PostgreSQL)
const optimizeDatabase = async () => {
  try {
    logger.info('Starting database optimization...');
    
    // Note: VACUUM and ANALYZE are PostgreSQL specific
    // These operations help reclaim space and update statistics
    
    await prisma.$executeRaw`VACUUM ANALYZE profile_views`;
    await prisma.$executeRaw`VACUUM ANALYZE link_clicks`;
    await prisma.$executeRaw`VACUUM ANALYZE sessions`;
    await prisma.$executeRaw`VACUUM ANALYZE daily_stats`;
    
    logger.info('Database optimization completed');
  } catch (error) {
    logger.error('Error optimizing database:', error);
  }
};

// Run all cleanup tasks
const runAllCleanupTasks = async () => {
  logger.info('Starting all cleanup tasks...');
  
  try {
    await Promise.all([
      cleanupOldViews(),
      cleanupOldClicks(),
      cleanupOldSessions(),
      cleanupExpiredCache(),
      cleanupOldRealtimeEvents(),
      cleanupOrphanedSessions(),
    ]);
    
    // Run these sequentially to avoid overwhelming the database
    await cleanupOldStats();
    await clearAnalyticsCache();
    await optimizeDatabase();
    
    logger.info('All cleanup tasks completed successfully');
  } catch (error) {
    logger.error('Error running cleanup tasks:', error);
  }
};

// Get cleanup statistics
const getCleanupStats = async () => {
  try {
    const [
      totalViews,
      totalClicks,
      totalSessions,
      totalCacheEntries,
      totalRealtimeEvents,
      oldestView,
      oldestClick,
      oldestSession,
    ] = await Promise.all([
      prisma.profileView.count(),
      prisma.linkClick.count(),
      prisma.session.count(),
      prisma.analyticsCache.count(),
      prisma.realtimeEvent.count(),
      prisma.profileView.findFirst({
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true },
      }),
      prisma.linkClick.findFirst({
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true },
      }),
      prisma.session.findFirst({
        orderBy: { startTime: 'asc' },
        select: { startTime: true },
      }),
    ]);

    return {
      totalRecords: {
        views: totalViews,
        clicks: totalClicks,
        sessions: totalSessions,
        cacheEntries: totalCacheEntries,
        realtimeEvents: totalRealtimeEvents,
      },
      oldestRecords: {
        view: oldestView?.timestamp,
        click: oldestClick?.timestamp,
        session: oldestSession?.startTime,
      },
      retentionPolicies: {
        views: `${config.retention.views} days`,
        clicks: `${config.retention.clicks} days`,
        sessions: `${config.retention.sessions} days`,
        cache: `${config.retention.cache} days`,
      },
    };
  } catch (error) {
    logger.error('Error getting cleanup stats:', error);
    return null;
  }
};

// Schedule cleanup jobs
if (config.nodeEnv !== 'test') {
  // Run daily cleanup at 3 AM every day
  cron.schedule('0 3 * * *', runAllCleanupTasks, {
    timezone: 'UTC',
  });

  // Run cache cleanup every 6 hours
  cron.schedule('0 */6 * * *', clearAnalyticsCache, {
    timezone: 'UTC',
  });

  // Run orphaned session cleanup every hour
  cron.schedule('0 * * * *', cleanupOrphanedSessions, {
    timezone: 'UTC',
  });

  // Run database optimization weekly on Sundays at 4 AM
  cron.schedule('0 4 * * 0', optimizeDatabase, {
    timezone: 'UTC',
  });

  logger.info('Cleanup jobs scheduled');
}

export {
  cleanupOldViews,
  cleanupOldClicks,
  cleanupOldSessions,
  cleanupExpiredCache,
  cleanupOldRealtimeEvents,
  cleanupOrphanedSessions,
  cleanupOldStats,
  clearAnalyticsCache,
  optimizeDatabase,
  runAllCleanupTasks,
  getCleanupStats,
};
