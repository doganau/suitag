import express, { Request, Response } from 'express';
import SponsoredTransactionService from '../services/sponsoredTransactionService';
import { body, validationResult } from 'express-validator';
import logger from '../utils/logger';

const router = express.Router();

// This will be initialized in server.ts
let sponsoredTxService: SponsoredTransactionService;

export const setSponsoredTransactionService = (service: SponsoredTransactionService) => {
  sponsoredTxService = service;
};

/**
 * POST /api/sponsored/create
 * Create a sponsored transaction (Step 1)
 * Returns sponsored transaction bytes and digest
 */
router.post(
  '/create',
  [
    body('transactionKindBytes').isString().notEmpty(),
    body('sender').isString().notEmpty(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { transactionKindBytes, sender } = req.body;

      // Check if service is enabled
      if (!sponsoredTxService || !sponsoredTxService.isEnabled()) {
        return res.status(503).json({
          success: false,
          error: 'Sponsored transactions not available',
        });
      }

      logger.info('Creating sponsored transaction', { sender });

      // Create sponsored transaction
      const result = await sponsoredTxService.createSponsoredTransaction(
        transactionKindBytes,
        sender
      );

      if (result.success) {
        logger.info('Sponsored transaction created', {
          digest: result.digest,
        });

        return res.json({
          success: true,
          bytes: result.bytes,
          digest: result.digest,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: result.error || 'Failed to create sponsored transaction',
        });
      }
    } catch (error: any) {
      logger.error('Error creating sponsored transaction:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/sponsored/execute
 * Execute a sponsored transaction with user signature (Step 2)
 */
router.post(
  '/execute',
  [
    body('digest').isString().notEmpty(),
    body('signature').isString().notEmpty(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { digest, signature } = req.body;

      // Check if service is enabled
      if (!sponsoredTxService || !sponsoredTxService.isEnabled()) {
        return res.status(503).json({
          success: false,
          error: 'Sponsored transactions not available',
        });
      }

      logger.info('Executing sponsored transaction', { digest });

      // Execute sponsored transaction with signature
      const result = await sponsoredTxService.executeSponsoredTransaction(
        digest,
        signature
      );

      if (result.success) {
        logger.info('Sponsored transaction executed successfully', {
          digest: result.digest,
        });

        return res.json({
          success: true,
          digest: result.digest,
          effects: result.effects,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: result.error || 'Failed to execute transaction',
        });
      }
    } catch (error: any) {
      logger.error('Error executing sponsored transaction:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/sponsored/status
 * Get sponsored transaction service status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    if (!sponsoredTxService) {
      return res.json({
        enabled: false,
        message: 'Service not initialized',
      });
    }

    const limits = sponsoredTxService.getTransactionLimits();
    const balance = await sponsoredTxService.getSponsorBalance();

    return res.json({
      enabled: sponsoredTxService.isEnabled(),
      limits,
      sponsorBalance: balance,
    });
  } catch (error: any) {
    logger.error('Error getting sponsored transaction status:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * POST /api/sponsored/estimate
 * Estimate gas cost for a transaction
 */
router.post(
  '/estimate',
  [body('transaction').isString().notEmpty()],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { transaction } = req.body;

      if (!sponsoredTxService) {
        return res.status(503).json({
          success: false,
          error: 'Service not available',
        });
      }

      const estimate = await sponsoredTxService.estimateGasCost(transaction);

      if (estimate) {
        return res.json({
          success: true,
          gasCost: estimate.gasCost,
          gasPrice: estimate.gasPrice,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Failed to estimate gas cost',
        });
      }
    } catch (error: any) {
      logger.error('Error estimating gas cost:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }
);

export default router;

