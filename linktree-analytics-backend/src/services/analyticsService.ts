import { prisma } from '../config/database';
import { cacheService } from '../config/redis';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import moment from 'moment';

export interface AnalyticsData {
  profileViews: number;
  uniqueViews: number;
  totalClicks: number;
  uniqueClicks: number;
  totalLinks: number;
  averageClicksPerLink: number;
  topLink: {
    title: string;
    url: string;
    clicks: number;
  } | null;
  timeSeriesData: {
    date: string;
    views: number;
    clicks: number;
  }[];
  geographicData: {
    country: string;
    views: number;
    clicks: number;
  }[];
  deviceData: {
    deviceType: string;
    views: number;
    clicks: number;
  }[];
  referrerData: {
    referrer: string;
    views: number;
    clicks: number;
  }[];
  linkPerformance: {
    title: string;
    url: string;
    clicks: number;
    uniqueClicks: number;
    ctr: number;
  }[];
}

export interface TimeRange {
  start: Date;
  end: Date;
  period: 'hour' | 'day' | 'week' | 'month';
}

export class AnalyticsService {
  private static instance: AnalyticsService;

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  // Get comprehensive analytics for a profile
  async getProfileAnalytics(profileId: string, timeRange: TimeRange): Promise<AnalyticsData> {
    const cacheKey = `analytics:${profileId}:${timeRange.start.getTime()}:${timeRange.end.getTime()}`;
    
    try {
      // Try to get from cache first
      const cached = await cacheService.get<AnalyticsData>(cacheKey);
      if (cached) {
        logger.debug(`Analytics cache hit for profile ${profileId}`);
        return cached;
      }

      logger.debug(`Analytics cache miss for profile ${profileId}, generating...`);

      // Generate analytics data
      const [
        viewStats,
        clickStats,
        timeSeriesData,
        geographicData,
        deviceData,
        referrerData,
        linkPerformance,
      ] = await Promise.all([
        this.getViewStats(profileId, timeRange),
        this.getClickStats(profileId, timeRange),
        this.getTimeSeriesData(profileId, timeRange),
        this.getGeographicData(profileId, timeRange),
        this.getDeviceData(profileId, timeRange),
        this.getReferrerData(profileId, timeRange),
        this.getLinkPerformance(profileId, timeRange),
      ]);

      const totalClicks = clickStats.totalClicks;
      const totalLinks = linkPerformance.length;
      const averageClicksPerLink = totalLinks > 0 ? totalClicks / totalLinks : 0;
      const topLink = linkPerformance.length > 0 
        ? linkPerformance.reduce((max, link) => link.clicks > max.clicks ? link : max)
        : null;

      const analyticsData: AnalyticsData = {
        profileViews: viewStats.totalViews,
        uniqueViews: viewStats.uniqueViews,
        totalClicks: totalClicks,
        uniqueClicks: clickStats.uniqueClicks,
        totalLinks,
        averageClicksPerLink,
        topLink: topLink ? {
          title: topLink.title,
          url: topLink.url,
          clicks: topLink.clicks,
        } : null,
        timeSeriesData,
        geographicData,
        deviceData,
        referrerData,
        linkPerformance,
      };

      // Cache the result
      await cacheService.set(cacheKey, analyticsData, config.analytics.cacheTtl);

      return analyticsData;
    } catch (error) {
      logger.error(`Error getting analytics for profile ${profileId}:`, error);
      throw error;
    }
  }

  // Get view statistics
  private async getViewStats(profileId: string, timeRange: TimeRange): Promise<{
    totalViews: number;
    uniqueViews: number;
  }> {
    const [totalViews, uniqueViews] = await Promise.all([
      prisma.profileView.count({
        where: {
          profileId,
          timestamp: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
        },
      }),
      prisma.profileView.groupBy({
        by: ['sessionId'],
        where: {
          profileId,
          timestamp: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
          sessionId: {
            not: null,
          },
        },
      }).then(result => result.length),
    ]);

    return { totalViews, uniqueViews };
  }

  // Get click statistics
  private async getClickStats(profileId: string, timeRange: TimeRange): Promise<{
    totalClicks: number;
    uniqueClicks: number;
  }> {
    const [totalClicks, uniqueClicks] = await Promise.all([
      prisma.linkClick.count({
        where: {
          profileId,
          timestamp: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
        },
      }),
      prisma.linkClick.groupBy({
        by: ['sessionId'],
        where: {
          profileId,
          timestamp: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
          sessionId: {
            not: null,
          },
        },
      }).then(result => result.length),
    ]);

    return { totalClicks, uniqueClicks };
  }

  // Get time series data
  private async getTimeSeriesData(profileId: string, timeRange: TimeRange): Promise<{
    date: string;
    views: number;
    clicks: number;
  }[]> {
    const format = this.getDateFormat(timeRange.period);
    
    const [viewData, clickData] = await Promise.all([
      prisma.$queryRaw<{ date: string; views: number }[]>`
        SELECT 
          DATE_TRUNC(${timeRange.period}, timestamp) as date,
          COUNT(*) as views
        FROM profile_views
        WHERE profile_id = ${profileId}
          AND timestamp >= ${timeRange.start}
          AND timestamp <= ${timeRange.end}
        GROUP BY DATE_TRUNC(${timeRange.period}, timestamp)
        ORDER BY date
      `,
      prisma.$queryRaw<{ date: string; clicks: number }[]>`
        SELECT 
          DATE_TRUNC(${timeRange.period}, timestamp) as date,
          COUNT(*) as clicks
        FROM link_clicks
        WHERE profile_id = ${profileId}
          AND timestamp >= ${timeRange.start}
          AND timestamp <= ${timeRange.end}
        GROUP BY DATE_TRUNC(${timeRange.period}, timestamp)
        ORDER BY date
      `,
    ]);

    // Merge view and click data
    const dataMap = new Map<string, { views: number; clicks: number }>();
    
    viewData.forEach(item => {
      const dateStr = moment(item.date).format(format);
      dataMap.set(dateStr, { views: Number(item.views), clicks: 0 });
    });

    clickData.forEach(item => {
      const dateStr = moment(item.date).format(format);
      const existing = dataMap.get(dateStr) || { views: 0, clicks: 0 };
      dataMap.set(dateStr, { ...existing, clicks: Number(item.clicks) });
    });

    return Array.from(dataMap.entries()).map(([date, data]) => ({
      date,
      views: data.views,
      clicks: data.clicks,
    }));
  }

  // Get geographic data
  private async getGeographicData(profileId: string, timeRange: TimeRange): Promise<{
    country: string;
    views: number;
    clicks: number;
  }[]> {
    const [viewData, clickData] = await Promise.all([
      prisma.profileView.groupBy({
        by: ['country'],
        where: {
          profileId,
          timestamp: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
          country: {
            not: null,
          },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 10,
      }),
      prisma.linkClick.groupBy({
        by: ['country'],
        where: {
          profileId,
          timestamp: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
          country: {
            not: null,
          },
        },
        _count: {
          id: true,
        },
      }),
    ]);

    const clickMap = new Map(clickData.map(item => [item.country!, item._count.id]));

    return viewData.map(item => ({
      country: item.country!,
      views: item._count.id,
      clicks: clickMap.get(item.country!) || 0,
    }));
  }

  // Get device data
  private async getDeviceData(profileId: string, timeRange: TimeRange): Promise<{
    deviceType: string;
    views: number;
    clicks: number;
  }[]> {
    const [viewData, clickData] = await Promise.all([
      prisma.profileView.groupBy({
        by: ['deviceType'],
        where: {
          profileId,
          timestamp: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
          deviceType: {
            not: null,
          },
        },
        _count: {
          id: true,
        },
      }),
      prisma.linkClick.groupBy({
        by: ['deviceType'],
        where: {
          profileId,
          timestamp: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
          deviceType: {
            not: null,
          },
        },
        _count: {
          id: true,
        },
      }),
    ]);

    const clickMap = new Map(clickData.map(item => [item.deviceType!, item._count.id]));

    return viewData.map(item => ({
      deviceType: item.deviceType!,
      views: item._count.id,
      clicks: clickMap.get(item.deviceType!) || 0,
    }));
  }

  // Get referrer data
  private async getReferrerData(profileId: string, timeRange: TimeRange): Promise<{
    referrer: string;
    views: number;
    clicks: number;
  }[]> {
    const [viewData, clickData] = await Promise.all([
      prisma.profileView.groupBy({
        by: ['referrer'],
        where: {
          profileId,
          timestamp: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
          referrer: {
            not: null,
          },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 10,
      }),
      prisma.linkClick.groupBy({
        by: ['referrer'],
        where: {
          profileId,
          timestamp: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
          referrer: {
            not: null,
          },
        },
        _count: {
          id: true,
        },
      }),
    ]);

    const clickMap = new Map(clickData.map(item => [item.referrer!, item._count.id]));

    return viewData.map(item => ({
      referrer: this.cleanReferrer(item.referrer!),
      views: item._count.id,
      clicks: clickMap.get(item.referrer!) || 0,
    }));
  }

  // Get link performance data
  private async getLinkPerformance(profileId: string, timeRange: TimeRange): Promise<{
    title: string;
    url: string;
    clicks: number;
    uniqueClicks: number;
    ctr: number;
  }[]> {
    const linkData = await prisma.linkClick.groupBy({
      by: ['linkIndex', 'linkTitle', 'linkUrl'],
      where: {
        profileId,
        timestamp: {
          gte: timeRange.start,
          lte: timeRange.end,
        },
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });

    // Get unique clicks for each link
    const uniqueClicksData = await Promise.all(
      linkData.map(async (link) => {
        const uniqueClicks = await prisma.linkClick.groupBy({
          by: ['sessionId'],
          where: {
            profileId,
            linkIndex: link.linkIndex,
            timestamp: {
              gte: timeRange.start,
              lte: timeRange.end,
            },
            sessionId: {
              not: null,
            },
          },
        });
        return uniqueClicks.length;
      })
    );

    // Get total views for CTR calculation
    const totalViews = await prisma.profileView.count({
      where: {
        profileId,
        timestamp: {
          gte: timeRange.start,
          lte: timeRange.end,
        },
      },
    });

    return linkData.map((link, index) => ({
      title: link.linkTitle || 'Untitled',
      url: link.linkUrl || '',
      clicks: link._count.id,
      uniqueClicks: uniqueClicksData[index] || 0,
      ctr: totalViews > 0 ? (link._count.id / totalViews) * 100 : 0,
    }));
  }

  // Helper methods
  private getDateFormat(period: string): string {
    switch (period) {
      case 'hour':
        return 'YYYY-MM-DD HH:00';
      case 'day':
        return 'YYYY-MM-DD';
      case 'week':
        return 'YYYY-[W]WW';
      case 'month':
        return 'YYYY-MM';
      default:
        return 'YYYY-MM-DD';
    }
  }

  private cleanReferrer(referrer: string): string {
    try {
      const url = new URL(referrer);
      return url.hostname;
    } catch {
      return referrer;
    }
  }

  // Real-time analytics
  async getRealTimeAnalytics(profileId: string): Promise<{
    activeUsers: number;
    recentViews: number;
    recentClicks: number;
  }> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);

    const [activeUsers, recentViews, recentClicks] = await Promise.all([
      prisma.session.count({
        where: {
          profileId,
          endTime: null,
          startTime: {
            gte: fiveMinutesAgo,
          },
        },
      }),
      prisma.profileView.count({
        where: {
          profileId,
          timestamp: {
            gte: oneMinuteAgo,
          },
        },
      }),
      prisma.linkClick.count({
        where: {
          profileId,
          timestamp: {
            gte: oneMinuteAgo,
          },
        },
      }),
    ]);

    return {
      activeUsers,
      recentViews,
      recentClicks,
    };
  }
}

export const analyticsService = AnalyticsService.getInstance();
