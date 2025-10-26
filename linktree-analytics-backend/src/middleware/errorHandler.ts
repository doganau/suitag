import express from 'express';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

// Custom error class
export class AppError extends Error implements ApiError {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Error handler middleware
export const errorHandler = (
  error: ApiError,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  let { statusCode = 500, message } = error;

  // Log error
  logger.error('Error occurred:', {
    error: message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (error.name === 'PrismaClientKnownRequestError') {
    statusCode = 400;
    message = 'Database operation failed';
  } else if (error.name === 'PrismaClientUnknownRequestError') {
    statusCode = 500;
    message = 'Database error occurred';
  }

  // Prepare error response
  const errorResponse: any = {
    error: true,
    message,
    statusCode,
    timestamp: new Date().toISOString(),
    path: req.url,
    method: req.method,
  };

  // Include stack trace in development
  if (config.isDevelopment) {
    errorResponse.stack = error.stack;
  }

  // Include error details for operational errors
  if (error.isOperational && config.isDevelopment) {
    errorResponse.details = error;
  }

  res.status(statusCode).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Not found handler
export const notFoundHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};
