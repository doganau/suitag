import express from 'express';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Request logging middleware
export const requestLogger = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Generate unique request ID
  const requestId = uuidv4();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Log request start
  const startTime = Date.now();
  const { method, url, ip } = req;
  const userAgent = req.get('User-Agent') || '';

  logger.http(`Request started: ${method} ${url}`, {
    requestId,
    method,
    url,
    ip,
    userAgent,
    timestamp: new Date().toISOString(),
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const duration = Date.now() - startTime;
    const { statusCode } = res;
    
    logger.http(`Request completed: ${method} ${url} - ${statusCode} (${duration}ms)`, {
      requestId,
      method,
      url,
      statusCode,
      duration,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    });

    originalEnd.call(this, chunk, encoding);
  };

  next();
};
