import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

// Load environment variables
dotenv.config();

// Import configurations and services
import { config } from './config/config';
import { logger } from './utils/logger';
import { prisma } from './config/database';
import { redisClient } from './config/redis';
import { suiService } from './services/suiService';
import SponsoredTransactionService from './services/sponsoredTransactionService';

// Import routes
import analyticsRoutes from './routes/analytics';
import trackingRoutes from './routes/tracking';
import realtimeRoutes from './routes/realtime';
import healthRoutes from './routes/health';
import sponsoredRoutes, { setSponsoredTransactionService } from './routes/sponsored';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { validateRequest } from './middleware/validation';

// Import WebSocket handlers
import { setupWebSocket } from './websocket/websocket';

// Import scheduled jobs
import './jobs/aggregation';
import './jobs/cleanup';

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  },
});

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.window * 60 * 1000, // Convert minutes to milliseconds
  max: config.rateLimit.max,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);
app.use(limiter);

// Health check endpoint (before rate limiting)
app.use('/health', healthRoutes);

// API Routes
app.use('/api/analytics', analyticsRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/sponsored', sponsoredRoutes);

// WebSocket setup
setupWebSocket(io);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      await prisma.$disconnect();
      logger.info('Database connection closed');
      
      await redisClient.quit();
      logger.info('Redis connection closed');
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');
    
    // Test Redis connection
    await redisClient.ping();
    logger.info('Redis connected successfully');
    
    // Test Sui connection
    await suiService.testConnection();
    logger.info('Sui network connected successfully');
    
    // Initialize Sponsored Transaction Service
    const sponsoredTxService = new SponsoredTransactionService({
      apiKey: process.env.ENOKI_API_KEY || '',
      network: (config.sui.network === 'mainnet' ? 'mainnet' : 'testnet') as 'testnet' | 'mainnet',
      suiClient: suiService.getClient(),
    });
    setSponsoredTransactionService(sponsoredTxService);
    
    if (sponsoredTxService.isEnabled()) {
      logger.info('✅ Sponsored Transaction Service enabled');
    } else {
      logger.warn('⚠️  Sponsored Transaction Service disabled (no API key)');
    }
    
    // Start server
    server.listen(config.port, config.host, () => {
      logger.info(`🚀 Analytics Backend Server running on http://${config.host}:${config.port}`);
      logger.info(`📊 Environment: ${config.nodeEnv}`);
      logger.info(`🔗 Sui Network: ${config.sui.network}`);
      logger.info(`📈 Real-time Analytics: ${config.realtime.enabled ? 'Enabled' : 'Disabled'}`);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export { app, io };
