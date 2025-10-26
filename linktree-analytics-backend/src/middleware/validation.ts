import express from 'express';
import { validationResult } from 'express-validator';
import { AppError } from './errorHandler';

// Validation result handler
export const validateRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value,
    }));

    throw new AppError('Validation failed', 400);
  }

  next();
};

// Common validation patterns
export const validationPatterns = {
  profileId: {
    isString: true,
    isLength: { options: { min: 1 }, errorMessage: 'Profile ID is required' },
  },
  sessionId: {
    optional: true,
    isString: true,
    isLength: { options: { min: 1 }, errorMessage: 'Session ID must be valid' },
  },
  timestamp: {
    optional: true,
    isISO8601: { errorMessage: 'Invalid timestamp format' },
  },
  period: {
    optional: true,
    isIn: { options: [['7d', '30d', '90d', '1y']], errorMessage: 'Invalid period' },
  },
  linkIndex: {
    isInt: { options: { min: 0 }, errorMessage: 'Link index must be a non-negative integer' },
  },
  url: {
    optional: true,
    isURL: { errorMessage: 'Must be a valid URL' },
  },
};
