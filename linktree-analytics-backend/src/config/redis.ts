import Redis from 'ioredis';
import { config } from './config';
import { logger } from '../utils/logger';

// Create Redis client
export const redisClient = new Redis(config.redis.url, {
  password: config.redis.password || undefined,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  family: 4, // IPv4
});

// Redis event handlers
redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

redisClient.on('ready', () => {
  logger.info('Redis client ready');
});

redisClient.on('error', (error) => {
  logger.error('Redis client error:', error);
});

redisClient.on('close', () => {
  logger.info('Redis client connection closed');
});

redisClient.on('reconnecting', () => {
  logger.info('Redis client reconnecting...');
});

// Cache utility functions
export class CacheService {
  private static instance: CacheService;
  private client: Redis;

  constructor() {
    this.client = redisClient;
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  // Set cache with TTL
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      throw error;
    }
  }

  // Get cache
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  // Delete cache
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      throw error;
    }
  }

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  // Set TTL for existing key
  async expire(key: string, ttl: number): Promise<void> {
    try {
      await this.client.expire(key, ttl);
    } catch (error) {
      logger.error(`Cache expire error for key ${key}:`, error);
      throw error;
    }
  }

  // Get multiple keys
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.client.mget(...keys);
      return values.map(value => {
        if (value === null) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      });
    } catch (error) {
      logger.error(`Cache mget error for keys ${keys.join(', ')}:`, error);
      return keys.map(() => null);
    }
  }

  // Set multiple keys
  async mset(keyValuePairs: Record<string, any>): Promise<void> {
    try {
      const serializedPairs: string[] = [];
      Object.entries(keyValuePairs).forEach(([key, value]) => {
        serializedPairs.push(key, JSON.stringify(value));
      });
      await this.client.mset(...serializedPairs);
    } catch (error) {
      logger.error('Cache mset error:', error);
      throw error;
    }
  }

  // Increment counter
  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error(`Cache incr error for key ${key}:`, error);
      throw error;
    }
  }

  // Add to set
  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sadd(key, ...members);
    } catch (error) {
      logger.error(`Cache sadd error for key ${key}:`, error);
      throw error;
    }
  }

  // Get set members
  async smembers(key: string): Promise<string[]> {
    try {
      return await this.client.smembers(key);
    } catch (error) {
      logger.error(`Cache smembers error for key ${key}:`, error);
      return [];
    }
  }

  // Clear all cache (use with caution)
  async flushall(): Promise<void> {
    try {
      await this.client.flushall();
      logger.info('All cache cleared');
    } catch (error) {
      logger.error('Cache flushall error:', error);
      throw error;
    }
  }

  // Get cache info
  async info(): Promise<string> {
    try {
      return await this.client.info();
    } catch (error) {
      logger.error('Cache info error:', error);
      return '';
    }
  }
}

// Export singleton instance
export const cacheService = CacheService.getInstance();
