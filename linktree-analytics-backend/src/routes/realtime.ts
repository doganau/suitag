import express from 'express';
import { param, validationResult } from 'express-validator';
import { analyticsService } from '../services/analyticsService';
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

// Get real-time analytics for a profile
router.get(
  '/:profileId',
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

// Server-Sent Events endpoint for real-time updates
router.get(
  '/stream/:profileId',
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

      // Set headers for Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      // Send initial data
      const initialData = await analyticsService.getRealTimeAnalytics(profileId);
      res.write(`data: ${JSON.stringify(initialData)}\n\n`);

      // Set up interval to send updates
      const intervalId = setInterval(async () => {
        try {
          const realtimeData = await analyticsService.getRealTimeAnalytics(profileId);
          res.write(`data: ${JSON.stringify(realtimeData)}\n\n`);
        } catch (error) {
          logger.error('Error sending real-time update:', error);
          clearInterval(intervalId);
          res.end();
        }
      }, 5000); // Update every 5 seconds

      // Handle client disconnect
      req.on('close', () => {
        clearInterval(intervalId);
        res.end();
      });

      req.on('end', () => {
        clearInterval(intervalId);
        res.end();
      });

    } catch (error) {
      logger.error('Error setting up real-time stream:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to set up real-time stream',
      });
    }
  }
);

export default router;
