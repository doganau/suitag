import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { analyticsService } from '../services/analyticsService';
import { suiService } from '../services/suiService';
import { logger } from '../utils/logger';
import moment from 'moment';

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      details: errors.array(),
    });
  }
  next();
};

// Get comprehensive analytics for a profile
router.get(
  '/profile/:profileId',
  [
    param('profileId').isString().isLength({ min: 1 }).withMessage('Profile ID is required'),
    query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid period'),
    query('start').optional().isISO8601().withMessage('Invalid start date'),
    query('end').optional().isISO8601().withMessage('Invalid end date'),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { profileId } = req.params;
      const { period = '30d', start, end } = req.query;

      // Verify profile exists
      const profileExists = await suiService.profileExists(profileId);
      if (!profileExists) {
        return res.status(404).json({
          error: 'Profile not found',
          message: `Profile with ID ${profileId} does not exist`,
        });
      }

      // Calculate time range
      let timeRange;
      if (start && end) {
        timeRange = {
          start: new Date(start as string),
          end: new Date(end as string),
          period: 'day' as const,
        };
      } else {
        const endDate = new Date();
        let startDate: Date;
        let periodType: 'hour' | 'day' | 'week' | 'month' = 'day';

        switch (period) {
          case '7d':
            startDate = moment().subtract(7, 'days').toDate();
            periodType = 'day';
            break;
          case '30d':
            startDate = moment().subtract(30, 'days').toDate();
            periodType = 'day';
            break;
          case '90d':
            startDate = moment().subtract(90, 'days').toDate();
            periodType = 'week';
            break;
          case '1y':
            startDate = moment().subtract(1, 'year').toDate();
            periodType = 'month';
            break;
          default:
            startDate = moment().subtract(30, 'days').toDate();
            periodType = 'day';
        }

        timeRange = {
          start: startDate,
          end: endDate,
          period: periodType,
        };
      }

      const analytics = await analyticsService.getProfileAnalytics(profileId, timeRange);

      res.json({
        success: true,
        data: analytics,
        timeRange: {
          start: timeRange.start.toISOString(),
          end: timeRange.end.toISOString(),
          period: timeRange.period,
        },
      });
    } catch (error) {
      logger.error('Error getting profile analytics:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get analytics data',
      });
    }
  }
);

// Get analytics summary for a profile
router.get(
  '/profile/:profileId/summary',
  [
    param('profileId').isString().isLength({ min: 1 }).withMessage('Profile ID is required'),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { profileId } = req.params;

      // Verify profile exists
      const profileExists = await suiService.profileExists(profileId);
      if (!profileExists) {
        return res.status(404).json({
          error: 'Profile not found',
          message: `Profile with ID ${profileId} does not exist`,
        });
      }

      // Get last 30 days summary
      const timeRange = {
        start: moment().subtract(30, 'days').toDate(),
        end: new Date(),
        period: 'day' as const,
      };

      const analytics = await analyticsService.getProfileAnalytics(profileId, timeRange);

      // Calculate summary metrics
      const summary = {
        totalViews: analytics.profileViews,
        totalClicks: analytics.totalClicks,
        totalLinks: analytics.totalLinks,
        averageClicksPerLink: analytics.averageClicksPerLink,
        topCountry: analytics.geographicData[0]?.country || null,
        topDevice: analytics.deviceData[0]?.deviceType || null,
        topReferrer: analytics.referrerData[0]?.referrer || null,
        conversionRate: analytics.profileViews > 0 ? (analytics.totalClicks / analytics.profileViews) * 100 : 0,
      };

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error('Error getting profile analytics summary:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get analytics summary',
      });
    }
  }
);

// Get real-time analytics
router.get(
  '/profile/:profileId/realtime',
  [
    param('profileId').isString().isLength({ min: 1 }).withMessage('Profile ID is required'),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { profileId } = req.params;

      // Verify profile exists
      const profileExists = await suiService.profileExists(profileId);
      if (!profileExists) {
        return res.status(404).json({
          error: 'Profile not found',
          message: `Profile with ID ${profileId} does not exist`,
        });
      }

      const realtimeData = await analyticsService.getRealTimeAnalytics(profileId);

      res.json({
        success: true,
        data: realtimeData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error getting real-time analytics:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get real-time analytics',
      });
    }
  }
);

// Get link performance analytics
router.get(
  '/links/:profileId',
  [
    param('profileId').isString().isLength({ min: 1 }).withMessage('Profile ID is required'),
    query('period').optional().isIn(['7d', '30d', '90d']).withMessage('Invalid period'),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { profileId } = req.params;
      const { period = '30d' } = req.query;

      // Verify profile exists
      const profileExists = await suiService.profileExists(profileId);
      if (!profileExists) {
        return res.status(404).json({
          error: 'Profile not found',
          message: `Profile with ID ${profileId} does not exist`,
        });
      }

      // Calculate time range
      const endDate = new Date();
      let startDate: Date;

      switch (period) {
        case '7d':
          startDate = moment().subtract(7, 'days').toDate();
          break;
        case '30d':
          startDate = moment().subtract(30, 'days').toDate();
          break;
        case '90d':
          startDate = moment().subtract(90, 'days').toDate();
          break;
        default:
          startDate = moment().subtract(30, 'days').toDate();
      }

      const timeRange = {
        start: startDate,
        end: endDate,
        period: 'day' as const,
      };

      const analytics = await analyticsService.getProfileAnalytics(profileId, timeRange);

      res.json({
        success: true,
        data: {
          links: analytics.linkPerformance,
          topLink: analytics.topLink,
          totalClicks: analytics.totalClicks,
          averageClicksPerLink: analytics.averageClicksPerLink,
        },
        timeRange: {
          start: timeRange.start.toISOString(),
          end: timeRange.end.toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error getting link analytics:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get link analytics',
      });
    }
  }
);

// Get geographic analytics
router.get(
  '/geo/:profileId',
  [
    param('profileId').isString().isLength({ min: 1 }).withMessage('Profile ID is required'),
    query('period').optional().isIn(['7d', '30d', '90d']).withMessage('Invalid period'),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { profileId } = req.params;
      const { period = '30d' } = req.query;

      // Verify profile exists
      const profileExists = await suiService.profileExists(profileId);
      if (!profileExists) {
        return res.status(404).json({
          error: 'Profile not found',
          message: `Profile with ID ${profileId} does not exist`,
        });
      }

      // Calculate time range
      const endDate = new Date();
      let startDate: Date;

      switch (period) {
        case '7d':
          startDate = moment().subtract(7, 'days').toDate();
          break;
        case '30d':
          startDate = moment().subtract(30, 'days').toDate();
          break;
        case '90d':
          startDate = moment().subtract(90, 'days').toDate();
          break;
        default:
          startDate = moment().subtract(30, 'days').toDate();
      }

      const timeRange = {
        start: startDate,
        end: endDate,
        period: 'day' as const,
      };

      const analytics = await analyticsService.getProfileAnalytics(profileId, timeRange);

      res.json({
        success: true,
        data: {
          countries: analytics.geographicData,
          topCountry: analytics.geographicData[0] || null,
        },
        timeRange: {
          start: timeRange.start.toISOString(),
          end: timeRange.end.toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error getting geographic analytics:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get geographic analytics',
      });
    }
  }
);

export default router;
