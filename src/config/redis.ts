import Redis from 'ioredis';
import { logger } from './logger';
let redis: Redis;
export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) { logger.error('REDIS_URL required'); process.exit(1); }
    redis = new Redis(url, { maxRetriesPerRequest: null });
    redis.on('error', (err) => logger.error('Redis error', { error: err }));
  }
  return redis;
}
export async function connectRedis(): Promise<void> {
  getRedis();
  logger.info('Redis connection initialized');
}
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    logger.info('Redis disconnected');
  }
}
