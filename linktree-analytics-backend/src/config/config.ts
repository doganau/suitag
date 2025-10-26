import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server Configuration
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || 'localhost',
  
  // Database Configuration
  database: {
    url: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/linktree_analytics',
  },
  
  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || '',
  },
  
  // Sui Network Configuration
  sui: {
    network: process.env.SUI_NETWORK || 'testnet',
    rpcUrl: process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443',
    packageId: process.env.PACKAGE_ID || '0xc5439e27cc0f5d4e63f410c8d3972bab712fdd2fd235540f9eb0148566dfc6fb',
    registryId: process.env.REGISTRY_ID || '0xa619412963d391576358f631a35c7724c8614fd6ca596023f5c8461853f313e9',
  },
  
  // Analytics Configuration
  analytics: {
    cacheTtl: parseInt(process.env.ANALYTICS_CACHE_TTL || '3600', 10),
    batchSize: parseInt(process.env.BATCH_SIZE || '1000', 10),
    cleanupIntervalHours: parseInt(process.env.CLEANUP_INTERVAL_HOURS || '24', 10),
  },
  
  // Security Configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
  },
  
  // Rate Limiting
  rateLimit: {
    max: parseInt(process.env.API_RATE_LIMIT || '100', 10),
    window: parseInt(process.env.API_RATE_WINDOW || '15', 10), // minutes
  },
  
  // External Services
  services: {
    geoipEnabled: process.env.GEOIP_ENABLED === 'true',
    userAgentParsing: process.env.USER_AGENT_PARSING === 'true',
  },
  
  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },
  
  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'https://outlierchain.trwal.app'],
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },
  
  // WebSocket Configuration
  websocket: {
    enabled: process.env.WS_ENABLED === 'true',
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
  },
  
  // Real-time Analytics
  realtime: {
    enabled: process.env.REALTIME_ENABLED === 'true',
  },
  
  // Data Retention (in days)
  retention: {
    views: parseInt(process.env.RETENTION_VIEWS || '365', 10),
    clicks: parseInt(process.env.RETENTION_CLICKS || '365', 10),
    sessions: parseInt(process.env.RETENTION_SESSIONS || '90', 10),
    cache: parseInt(process.env.RETENTION_CACHE || '7', 10),
  },
  
  // Development flags
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
};
