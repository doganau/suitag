import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import moment from 'moment';

// Aggregate daily statistics
const aggregateDailyStats = async () => {
  try {
    logger.info('Starting daily stats aggregation...');
    
    const yesterday = moment().subtract(1, 'day').startOf('day').toDate();
    const today = moment().startOf('day').toDate();

    // Get all profiles that had activity yesterday
    const activeProfiles = await prisma.profileView.findMany({
      where: {
        timestamp: {
          gte: yesterday,
          lt: today,
        },
      },
      select: {
        profileId: true,
      },
      distinct: ['profileId'],
    });

    logger.info(`Processing ${activeProfiles.length} active profiles for daily aggregation`);

    for (const { profileId } of activeProfiles) {
      try {
        // Calculate daily metrics
        const [
          totalViews,
          uniqueViews,
          totalClicks,
          uniqueClicks,
          totalSessions,
          avgDuration,
        ] = await Promise.all([
          // Total views
          prisma.profileView.count({
            where: {
              profileId,
              timestamp: {
                gte: yesterday,
                lt: today,
              },
            },
          }),
          
          // Unique views (by session)
          prisma.profileView.groupBy({
            by: ['sessionId'],
            where: {
              profileId,
              timestamp: {
                gte: yesterday,
                lt: today,
              },
              sessionId: {
                not: null,
              },
            },
          }).then(result => result.length),
          
          // Total clicks
          prisma.linkClick.count({
            where: {
              profileId,
              timestamp: {
                gte: yesterday,
                lt: today,
              },
            },
          }),
          
          // Unique clicks (by session)
          prisma.linkClick.groupBy({
            by: ['sessionId'],
            where: {
              profileId,
              timestamp: {
                gte: yesterday,
                lt: today,
              },
              sessionId: {
                not: null,
              },
            },
          }).then(result => result.length),
          
          // Total sessions
          prisma.session.count({
            where: {
              profileId,
              startTime: {
                gte: yesterday,
                lt: today,
              },
            },
          }),
          
          // Average session duration
          prisma.session.aggregate({
            where: {
              profileId,
              startTime: {
                gte: yesterday,
                lt: today,
              },
              duration: {
                not: null,
              },
            },
            _avg: {
              duration: true,
            },
          }).then(result => result._avg.duration),
        ]);

        // Calculate bounce rate (sessions with only 1 page view)
        const singlePageSessions = await prisma.session.count({
          where: {
            profileId,
            startTime: {
              gte: yesterday,
              lt: today,
            },
            pageViews: 1,
          },
        });

        const bounceRate = totalSessions > 0 ? (singlePageSessions / totalSessions) * 100 : 0;

        // Upsert daily stats
        await prisma.dailyStats.upsert({
          where: {
            profileId_date: {
              profileId,
              date: yesterday,
            },
          },
          update: {
            views: totalViews,
            uniqueViews,
            clicks: totalClicks,
            uniqueClicks,
            sessions: totalSessions,
            avgDuration,
            bounceRate,
          },
          create: {
            profileId,
            date: yesterday,
            views: totalViews,
            uniqueViews,
            clicks: totalClicks,
            uniqueClicks,
            sessions: totalSessions,
            avgDuration,
            bounceRate,
          },
        });

        logger.debug(`Aggregated daily stats for profile ${profileId}: ${totalViews} views, ${totalClicks} clicks`);
      } catch (error) {
        logger.error(`Error aggregating daily stats for profile ${profileId}:`, error);
      }
    }

    logger.info('Daily stats aggregation completed');
  } catch (error) {
    logger.error('Error in daily stats aggregation:', error);
  }
};

// Aggregate link statistics
const aggregateLinkStats = async () => {
  try {
    logger.info('Starting link stats aggregation...');
    
    const yesterday = moment().subtract(1, 'day').startOf('day').toDate();
    const today = moment().startOf('day').toDate();

    // Get all link clicks from yesterday
    const linkClicks = await prisma.linkClick.groupBy({
      by: ['profileId', 'linkIndex', 'linkTitle', 'linkUrl'],
      where: {
        timestamp: {
          gte: yesterday,
          lt: today,
        },
      },
      _count: {
        id: true,
      },
    });

    logger.info(`Processing ${linkClicks.length} link groups for aggregation`);

    for (const linkGroup of linkClicks) {
      try {
        // Calculate unique clicks for this link
        const uniqueClicks = await prisma.linkClick.groupBy({
          by: ['sessionId'],
          where: {
            profileId: linkGroup.profileId,
            linkIndex: linkGroup.linkIndex,
            timestamp: {
              gte: yesterday,
              lt: today,
            },
            sessionId: {
              not: null,
            },
          },
        }).then(result => result.length);

        // Get total profile views for CTR calculation
        const totalViews = await prisma.profileView.count({
          where: {
            profileId: linkGroup.profileId,
            timestamp: {
              gte: yesterday,
              lt: today,
            },
          },
        });

        const ctr = totalViews > 0 ? (linkGroup._count.id / totalViews) * 100 : 0;

        // Upsert link stats
        await prisma.linkStats.upsert({
          where: {
            profileId_linkIndex_date: {
              profileId: linkGroup.profileId,
              linkIndex: linkGroup.linkIndex,
              date: yesterday,
            },
          },
          update: {
            linkTitle: linkGroup.linkTitle || 'Untitled',
            linkUrl: linkGroup.linkUrl || '',
            clicks: linkGroup._count.id,
            uniqueClicks,
            ctr,
          },
          create: {
            profileId: linkGroup.profileId,
            linkIndex: linkGroup.linkIndex,
            linkTitle: linkGroup.linkTitle || 'Untitled',
            linkUrl: linkGroup.linkUrl || '',
            date: yesterday,
            clicks: linkGroup._count.id,
            uniqueClicks,
            ctr,
          },
        });

        logger.debug(`Aggregated link stats for profile ${linkGroup.profileId} link ${linkGroup.linkIndex}: ${linkGroup._count.id} clicks`);
      } catch (error) {
        logger.error(`Error aggregating link stats for profile ${linkGroup.profileId} link ${linkGroup.linkIndex}:`, error);
      }
    }

    logger.info('Link stats aggregation completed');
  } catch (error) {
    logger.error('Error in link stats aggregation:', error);
  }
};

// Aggregate geographic statistics
const aggregateGeoStats = async () => {
  try {
    logger.info('Starting geo stats aggregation...');
    
    const yesterday = moment().subtract(1, 'day').startOf('day').toDate();
    const today = moment().startOf('day').toDate();

    // Aggregate view data by geography
    const geoViews = await prisma.profileView.groupBy({
      by: ['profileId', 'country', 'city', 'region'],
      where: {
        timestamp: {
          gte: yesterday,
          lt: today,
        },
        country: {
          not: null,
        },
      },
      _count: {
        id: true,
      },
    });

    // Aggregate click data by geography
    const geoClicks = await prisma.linkClick.groupBy({
      by: ['profileId', 'country', 'city', 'region'],
      where: {
        timestamp: {
          gte: yesterday,
          lt: today,
        },
        country: {
          not: null,
        },
      },
      _count: {
        id: true,
      },
    });

    // Create a map for clicks
    const clicksMap = new Map<string, number>();
    geoClicks.forEach(item => {
      const key = `${item.profileId}-${item.country}-${item.city || ''}-${item.region || ''}`;
      clicksMap.set(key, item._count.id);
    });

    logger.info(`Processing ${geoViews.length} geo groups for aggregation`);

    for (const geoView of geoViews) {
      try {
        const key = `${geoView.profileId}-${geoView.country}-${geoView.city || ''}-${geoView.region || ''}`;
        const clicks = clicksMap.get(key) || 0;

        await prisma.geoStats.upsert({
          where: {
            profileId_country_city_date: {
              profileId: geoView.profileId,
              country: geoView.country!,
              city: geoView.city || '',
              date: yesterday,
            },
          },
          update: {
            views: geoView._count.id,
            clicks,
          },
          create: {
            profileId: geoView.profileId,
            country: geoView.country!,
            city: geoView.city,
            region: geoView.region,
            date: yesterday,
            views: geoView._count.id,
            clicks,
          },
        });
      } catch (error) {
        logger.error(`Error aggregating geo stats for ${geoView.country}:`, error);
      }
    }

    logger.info('Geo stats aggregation completed');
  } catch (error) {
    logger.error('Error in geo stats aggregation:', error);
  }
};

// Aggregate device statistics
const aggregateDeviceStats = async () => {
  try {
    logger.info('Starting device stats aggregation...');
    
    const yesterday = moment().subtract(1, 'day').startOf('day').toDate();
    const today = moment().startOf('day').toDate();

    // Aggregate view data by device
    const deviceViews = await prisma.profileView.groupBy({
      by: ['profileId', 'deviceType', 'browser', 'os'],
      where: {
        timestamp: {
          gte: yesterday,
          lt: today,
        },
        deviceType: {
          not: null,
        },
      },
      _count: {
        id: true,
      },
    });

    // Aggregate click data by device
    const deviceClicks = await prisma.linkClick.groupBy({
      by: ['profileId', 'deviceType', 'browser', 'os'],
      where: {
        timestamp: {
          gte: yesterday,
          lt: today,
        },
        deviceType: {
          not: null,
        },
      },
      _count: {
        id: true,
      },
    });

    // Create a map for clicks
    const clicksMap = new Map<string, number>();
    deviceClicks.forEach(item => {
      const key = `${item.profileId}-${item.deviceType}-${item.browser || ''}-${item.os || ''}`;
      clicksMap.set(key, item._count.id);
    });

    logger.info(`Processing ${deviceViews.length} device groups for aggregation`);

    for (const deviceView of deviceViews) {
      try {
        const key = `${deviceView.profileId}-${deviceView.deviceType}-${deviceView.browser || ''}-${deviceView.os || ''}`;
        const clicks = clicksMap.get(key) || 0;

        await prisma.deviceStats.upsert({
          where: {
            profileId_deviceType_browser_os_date: {
              profileId: deviceView.profileId,
              deviceType: deviceView.deviceType!,
              browser: deviceView.browser || '',
              os: deviceView.os || '',
              date: yesterday,
            },
          },
          update: {
            views: deviceView._count.id,
            clicks,
          },
          create: {
            profileId: deviceView.profileId,
            deviceType: deviceView.deviceType!,
            browser: deviceView.browser,
            os: deviceView.os,
            date: yesterday,
            views: deviceView._count.id,
            clicks,
          },
        });
      } catch (error) {
        logger.error(`Error aggregating device stats for ${deviceView.deviceType}:`, error);
      }
    }

    logger.info('Device stats aggregation completed');
  } catch (error) {
    logger.error('Error in device stats aggregation:', error);
  }
};

// Aggregate referrer statistics
const aggregateReferrerStats = async () => {
  try {
    logger.info('Starting referrer stats aggregation...');
    
    const yesterday = moment().subtract(1, 'day').startOf('day').toDate();
    const today = moment().startOf('day').toDate();

    // Aggregate view data by referrer
    const referrerViews = await prisma.profileView.groupBy({
      by: ['profileId', 'referrer'],
      where: {
        timestamp: {
          gte: yesterday,
          lt: today,
        },
        referrer: {
          not: null,
        },
      },
      _count: {
        id: true,
      },
    });

    // Aggregate click data by referrer
    const referrerClicks = await prisma.linkClick.groupBy({
      by: ['profileId', 'referrer'],
      where: {
        timestamp: {
          gte: yesterday,
          lt: today,
        },
        referrer: {
          not: null,
        },
      },
      _count: {
        id: true,
      },
    });

    // Create a map for clicks
    const clicksMap = new Map<string, number>();
    referrerClicks.forEach(item => {
      const key = `${item.profileId}-${item.referrer}`;
      clicksMap.set(key, item._count.id);
    });

    logger.info(`Processing ${referrerViews.length} referrer groups for aggregation`);

    for (const referrerView of referrerViews) {
      try {
        const key = `${referrerView.profileId}-${referrerView.referrer}`;
        const clicks = clicksMap.get(key) || 0;

        // Determine referrer type
        let referrerType = 'other';
        const referrer = referrerView.referrer!.toLowerCase();
        
        if (referrer.includes('google') || referrer.includes('bing') || referrer.includes('yahoo')) {
          referrerType = 'search';
        } else if (referrer.includes('facebook') || referrer.includes('twitter') || referrer.includes('instagram') || referrer.includes('linkedin')) {
          referrerType = 'social';
        } else if (referrer === '' || referrer === 'direct') {
          referrerType = 'direct';
        }

        await prisma.referrerStats.upsert({
          where: {
            profileId_referrer_date: {
              profileId: referrerView.profileId,
              referrer: referrerView.referrer!,
              date: yesterday,
            },
          },
          update: {
            referrerType,
            views: referrerView._count.id,
            clicks,
          },
          create: {
            profileId: referrerView.profileId,
            referrer: referrerView.referrer!,
            referrerType,
            date: yesterday,
            views: referrerView._count.id,
            clicks,
          },
        });
      } catch (error) {
        logger.error(`Error aggregating referrer stats for ${referrerView.referrer}:`, error);
      }
    }

    logger.info('Referrer stats aggregation completed');
  } catch (error) {
    logger.error('Error in referrer stats aggregation:', error);
  }
};

// Run all aggregation tasks
const runAllAggregations = async () => {
  logger.info('Starting all aggregation tasks...');
  
  try {
    await Promise.all([
      aggregateDailyStats(),
      aggregateLinkStats(),
      aggregateGeoStats(),
      aggregateDeviceStats(),
      aggregateReferrerStats(),
    ]);
    
    logger.info('All aggregation tasks completed successfully');
  } catch (error) {
    logger.error('Error running aggregation tasks:', error);
  }
};

// Schedule aggregation jobs
if (config.nodeEnv !== 'test') {
  // Run daily aggregation at 2 AM every day
  cron.schedule('0 2 * * *', runAllAggregations, {
    timezone: 'UTC',
  });

  // Run hourly aggregation for real-time stats (optional)
  cron.schedule('0 * * * *', async () => {
    logger.info('Running hourly aggregation...');
    // Add hourly aggregation logic here if needed
  });

  logger.info('Aggregation jobs scheduled');
}

export {
  aggregateDailyStats,
  aggregateLinkStats,
  aggregateGeoStats,
  aggregateDeviceStats,
  aggregateReferrerStats,
  runAllAggregations,
};
