import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './config/mongodb';
import { connectRedis } from './config/redis';
import { logger } from './config/logger';
import { startFirstLoopOrchestrator } from './orchestrator';

async function bootstrap() {
  logger.info('Starting rez-first-loop (worker-only)...');
  await connectMongo();
  await connectRedis();
  await startFirstLoopOrchestrator();
  logger.info('rez-first-loop bootstrapped successfully');
}

bootstrap().catch((err) => {
  logger.error('Failed to bootstrap', { error: err });
  process.exit(1);
});
