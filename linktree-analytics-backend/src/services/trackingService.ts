import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import geoip from 'geoip-lite';
import UAParser from 'ua-parser-js';
import { v4 as uuidv4 } from 'uuid';

export interface TrackingData {
  profileId: string;
  sessionId?: string;
  visitorIp?: string;
  userAgent?: string;
  referrer?: string;
  timestamp?: Date;
}

export interface LinkClickData extends TrackingData {
  linkIndex: number;
  linkTitle?: string;
  linkUrl?: string;
}

export interface GeoData {
  country?: string;
  city?: string;
  region?: string;
}

export interface DeviceData {
  deviceType?: string;
  browser?: string;
  os?: string;
}

export class TrackingService {
  private static instance: TrackingService;

  public static getInstance(): TrackingService {
    if (!TrackingService.instance) {
      TrackingService.instance = new TrackingService();
    }
    return TrackingService.instance;
  }

  // Track profile view
  async trackProfileView(data: TrackingData): Promise<string> {
    try {
      const geoData = this.getGeoData(data.visitorIp);
      const deviceData = this.getDeviceData(data.userAgent);
      const sessionId = data.sessionId || this.generateSessionId();

      // Create profile view record
      const profileView = await prisma.profileView.create({
        data: {
          profileId: data.profileId,
          sessionId,
          visitorIp: data.visitorIp,
          userAgent: data.userAgent,
          referrer: data.referrer,
          country: geoData.country,
          city: geoData.city,
          region: geoData.region,
          deviceType: deviceData.deviceType,
          browser: deviceData.browser,
          os: deviceData.os,
          timestamp: data.timestamp || new Date(),
        },
      });

      // Update or create session
      await this.updateSession(sessionId, data, geoData, deviceData);

      // Update daily stats
      await this.updateDailyStats(data.profileId, 'view');

      logger.debug(`Profile view tracked: ${data.profileId} by session ${sessionId}`);
      return profileView.id;
    } catch (error) {
      logger.error('Error tracking profile view:', error);
      throw error;
    }
  }

  // Track link click
  async trackLinkClick(data: LinkClickData): Promise<string> {
    try {
      const geoData = this.getGeoData(data.visitorIp);
      const deviceData = this.getDeviceData(data.userAgent);
      const sessionId = data.sessionId || this.generateSessionId();

      // Create link click record
      const linkClick = await prisma.linkClick.create({
        data: {
          profileId: data.profileId,
          linkIndex: data.linkIndex,
          linkTitle: data.linkTitle,
          linkUrl: data.linkUrl,
          sessionId,
          visitorIp: data.visitorIp,
          userAgent: data.userAgent,
          referrer: data.referrer,
          country: geoData.country,
          city: geoData.city,
          region: geoData.region,
          deviceType: deviceData.deviceType,
          browser: deviceData.browser,
          os: deviceData.os,
          timestamp: data.timestamp || new Date(),
        },
      });

      // Update session
      await this.updateSession(sessionId, data, geoData, deviceData, true);

      // Update daily stats
      await this.updateDailyStats(data.profileId, 'click');

      // Update link stats
      await this.updateLinkStats(data.profileId, data.linkIndex, data.linkTitle || '', data.linkUrl || '');

      logger.debug(`Link click tracked: ${data.profileId} link ${data.linkIndex} by session ${sessionId}`);
      return linkClick.id;
    } catch (error) {
      logger.error('Error tracking link click:', error);
      throw error;
    }
  }

  // Start or update session
  private async updateSession(
    sessionId: string,
    data: TrackingData,
    geoData: GeoData,
    deviceData: DeviceData,
    isClick: boolean = false
  ): Promise<void> {
    try {
      const existingSession = await prisma.session.findUnique({
        where: { sessionId },
      });

      if (existingSession) {
        // Update existing session
        await prisma.session.update({
          where: { sessionId },
          data: {
            endTime: new Date(),
            duration: Math.floor((new Date().getTime() - existingSession.startTime.getTime()) / 1000),
            pageViews: isClick ? existingSession.pageViews : existingSession.pageViews + 1,
            linkClicks: isClick ? existingSession.linkClicks + 1 : existingSession.linkClicks,
          },
        });
      } else {
        // Create new session
        await prisma.session.create({
          data: {
            sessionId,
            profileId: data.profileId,
            visitorIp: data.visitorIp,
            userAgent: data.userAgent,
            country: geoData.country,
            city: geoData.city,
            region: geoData.region,
            deviceType: deviceData.deviceType,
            browser: deviceData.browser,
            os: deviceData.os,
            startTime: new Date(),
            pageViews: isClick ? 0 : 1,
            linkClicks: isClick ? 1 : 0,
          },
        });
      }
    } catch (error) {
      logger.error('Error updating session:', error);
    }
  }

  // Update daily stats
  private async updateDailyStats(profileId: string, type: 'view' | 'click'): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existingStats = await prisma.dailyStats.findUnique({
        where: {
          profileId_date: {
            profileId,
            date: today,
          },
        },
      });

      if (existingStats) {
        // Update existing stats
        await prisma.dailyStats.update({
          where: {
            profileId_date: {
              profileId,
              date: today,
            },
          },
          data: {
            views: type === 'view' ? existingStats.views + 1 : existingStats.views,
            clicks: type === 'click' ? existingStats.clicks + 1 : existingStats.clicks,
          },
        });
      } else {
        // Create new stats
        await prisma.dailyStats.create({
          data: {
            profileId,
            date: today,
            views: type === 'view' ? 1 : 0,
            clicks: type === 'click' ? 1 : 0,
            uniqueViews: 0, // Will be calculated by aggregation job
            uniqueClicks: 0, // Will be calculated by aggregation job
            sessions: 0, // Will be calculated by aggregation job
          },
        });
      }
    } catch (error) {
      logger.error('Error updating daily stats:', error);
    }
  }

  // Update link stats
  private async updateLinkStats(
    profileId: string,
    linkIndex: number,
    linkTitle: string,
    linkUrl: string
  ): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existingStats = await prisma.linkStats.findUnique({
        where: {
          profileId_linkIndex_date: {
            profileId,
            linkIndex,
            date: today,
          },
        },
      });

      if (existingStats) {
        // Update existing stats
        await prisma.linkStats.update({
          where: {
            profileId_linkIndex_date: {
              profileId,
              linkIndex,
              date: today,
            },
          },
          data: {
            clicks: existingStats.clicks + 1,
          },
        });
      } else {
        // Create new stats
        await prisma.linkStats.create({
          data: {
            profileId,
            linkIndex,
            linkTitle,
            linkUrl,
            date: today,
            clicks: 1,
            uniqueClicks: 0, // Will be calculated by aggregation job
          },
        });
      }
    } catch (error) {
      logger.error('Error updating link stats:', error);
    }
  }

  // Get geographic data from IP
  private getGeoData(ip?: string): GeoData {
    if (!ip) return {};

    try {
      const geo = geoip.lookup(ip);
      if (!geo) return {};

      return {
        country: geo.country,
        city: geo.city,
        region: geo.region,
      };
    } catch (error) {
      logger.debug('Error getting geo data:', error);
      return {};
    }
  }

  // Get device data from user agent
  private getDeviceData(userAgent?: string): DeviceData {
    if (!userAgent) return {};

    try {
      const parser = new UAParser(userAgent);
      const result = parser.getResult();

      let deviceType = 'desktop';
      if (result.device.type === 'mobile') {
        deviceType = 'mobile';
      } else if (result.device.type === 'tablet') {
        deviceType = 'tablet';
      }

      return {
        deviceType,
        browser: result.browser.name,
        os: result.os.name,
      };
    } catch (error) {
      logger.debug('Error parsing user agent:', error);
      return {};
    }
  }

  // Generate session ID
  private generateSessionId(): string {
    return uuidv4();
  }

  // Get session info
  async getSessionInfo(sessionId: string): Promise<any> {
    try {
      return await prisma.session.findUnique({
        where: { sessionId },
      });
    } catch (error) {
      logger.error('Error getting session info:', error);
      return null;
    }
  }

  // End session
  async endSession(sessionId: string): Promise<void> {
    try {
      const session = await prisma.session.findUnique({
        where: { sessionId },
      });

      if (session && !session.endTime) {
        const duration = Math.floor((new Date().getTime() - session.startTime.getTime()) / 1000);
        
        await prisma.session.update({
          where: { sessionId },
          data: {
            endTime: new Date(),
            duration,
          },
        });
      }
    } catch (error) {
      logger.error('Error ending session:', error);
    }
  }

  // Batch tracking for performance
  async batchTrackViews(views: TrackingData[]): Promise<void> {
    try {
      const processedViews = views.map(view => {
        const geoData = this.getGeoData(view.visitorIp);
        const deviceData = this.getDeviceData(view.userAgent);
        
        return {
          profileId: view.profileId,
          sessionId: view.sessionId || this.generateSessionId(),
          visitorIp: view.visitorIp,
          userAgent: view.userAgent,
          referrer: view.referrer,
          country: geoData.country,
          city: geoData.city,
          region: geoData.region,
          deviceType: deviceData.deviceType,
          browser: deviceData.browser,
          os: deviceData.os,
          timestamp: view.timestamp || new Date(),
        };
      });

      await prisma.profileView.createMany({
        data: processedViews,
      });

      logger.debug(`Batch tracked ${views.length} profile views`);
    } catch (error) {
      logger.error('Error batch tracking views:', error);
      throw error;
    }
  }
}

export const trackingService = TrackingService.getInstance();
