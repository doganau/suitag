import express from 'express';
import { body, validationResult } from 'express-validator';
import { trackingService } from '../services/trackingService';
import { suiService } from '../services/suiService';
import { logger } from '../utils/logger';

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

// Get client IP helper
const getClientIp = (req: express.Request): string => {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    ''
  );
};

// Track profile view
router.post(
  '/view',
  [
    body('profileId').isString().isLength({ min: 1 }).withMessage('Profile ID is required'),
    body('sessionId').optional().isString().withMessage('Session ID must be a string'),
    body('referrer').optional().isString().withMessage('Referrer must be a string'),
    body('timestamp').optional().isISO8601().withMessage('Invalid timestamp format'),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { profileId, sessionId, referrer, timestamp } = req.body;
      const visitorIp = getClientIp(req);
      const userAgent = req.headers['user-agent'];

      // Verify profile exists (optional - for performance, you might skip this)
      const profileExists = await suiService.profileExists(profileId);
      if (!profileExists) {
        return res.status(404).json({
          error: 'Profile not found',
          message: `Profile with ID ${profileId} does not exist`,
        });
      }

      const trackingData = {
        profileId,
        sessionId,
        visitorIp,
        userAgent,
        referrer,
        timestamp: timestamp ? new Date(timestamp) : undefined,
      };

      const viewId = await trackingService.trackProfileView(trackingData);

      res.json({
        success: true,
        data: {
          viewId,
          sessionId: trackingData.sessionId,
        },
        message: 'Profile view tracked successfully',
      });
    } catch (error) {
      logger.error('Error tracking profile view:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to track profile view',
      });
    }
  }
);

// Track link click
router.post(
  '/click',
  [
    body('profileId').isString().isLength({ min: 1 }).withMessage('Profile ID is required'),
    body('linkIndex').isInt({ min: 0 }).withMessage('Link index must be a non-negative integer'),
    body('linkTitle').optional().isString().withMessage('Link title must be a string'),
    body('linkUrl').optional().isURL().withMessage('Link URL must be a valid URL'),
    body('sessionId').optional().isString().withMessage('Session ID must be a string'),
    body('referrer').optional().isString().withMessage('Referrer must be a string'),
    body('timestamp').optional().isISO8601().withMessage('Invalid timestamp format'),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { profileId, linkIndex, linkTitle, linkUrl, sessionId, referrer, timestamp } = req.body;
      const visitorIp = getClientIp(req);
      const userAgent = req.headers['user-agent'];

      // Verify profile exists (optional - for performance, you might skip this)
      const profileExists = await suiService.profileExists(profileId);
      if (!profileExists) {
        return res.status(404).json({
          error: 'Profile not found',
          message: `Profile with ID ${profileId} does not exist`,
        });
      }

      const trackingData = {
        profileId,
        linkIndex,
        linkTitle,
        linkUrl,
        sessionId,
        visitorIp,
        userAgent,
        referrer,
        timestamp: timestamp ? new Date(timestamp) : undefined,
      };

      const clickId = await trackingService.trackLinkClick(trackingData);

      res.json({
        success: true,
        data: {
          clickId,
          sessionId: trackingData.sessionId,
        },
        message: 'Link click tracked successfully',
      });
    } catch (error) {
      logger.error('Error tracking link click:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to track link click',
      });
    }
  }
);

// Batch track views (for performance)
router.post(
  '/batch/views',
  [
    body('views').isArray({ min: 1 }).withMessage('Views array is required'),
    body('views.*.profileId').isString().isLength({ min: 1 }).withMessage('Profile ID is required for each view'),
    body('views.*.sessionId').optional().isString().withMessage('Session ID must be a string'),
    body('views.*.referrer').optional().isString().withMessage('Referrer must be a string'),
    body('views.*.timestamp').optional().isISO8601().withMessage('Invalid timestamp format'),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { views } = req.body;
      const visitorIp = getClientIp(req);
      const userAgent = req.headers['user-agent'];

      // Process views with IP and user agent
      const processedViews = views.map((view: any) => ({
        profileId: view.profileId,
        sessionId: view.sessionId,
        visitorIp,
        userAgent,
        referrer: view.referrer,
        timestamp: view.timestamp ? new Date(view.timestamp) : undefined,
      }));

      await trackingService.batchTrackViews(processedViews);

      res.json({
        success: true,
        data: {
          trackedCount: views.length,
        },
        message: 'Batch views tracked successfully',
      });
    } catch (error) {
      logger.error('Error batch tracking views:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to batch track views',
      });
    }
  }
);

// End session
router.post(
  '/session/end',
  [
    body('sessionId').isString().isLength({ min: 1 }).withMessage('Session ID is required'),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { sessionId } = req.body;

      await trackingService.endSession(sessionId);

      res.json({
        success: true,
        message: 'Session ended successfully',
      });
    } catch (error) {
      logger.error('Error ending session:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to end session',
      });
    }
  }
);

// Get session info
router.get(
  '/session/:sessionId',
  async (req: express.Request, res: express.Response) => {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Session ID is required',
        });
      }

      const sessionInfo = await trackingService.getSessionInfo(sessionId);

      if (!sessionInfo) {
        return res.status(404).json({
          error: 'Session not found',
          message: `Session with ID ${sessionId} does not exist`,
        });
      }

      res.json({
        success: true,
        data: sessionInfo,
      });
    } catch (error) {
      logger.error('Error getting session info:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get session info',
      });
    }
  }
);

// Health check for tracking
router.get('/health', (req: express.Request, res: express.Response) => {
  res.json({
    success: true,
    service: 'tracking',
    timestamp: new Date().toISOString(),
    message: 'Tracking service is healthy',
  });
});

export default router;
