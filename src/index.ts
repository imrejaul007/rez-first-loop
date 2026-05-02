import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './config/mongodb';
import { connectRedis } from './config/redis';
import { logger } from './config/logger';
import { startFirstLoopOrchestrator } from './orchestrator';
import express from 'express';

async function bootstrap() {
  logger.info('Starting rez-first-loop (worker-only)...');
  await connectMongo();
  await connectRedis();
  await startFirstLoopOrchestrator();
  logger.info('rez-first-loop bootstrapped successfully');

  // Health endpoint for Render
  const app = express();
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'rez-first-loop' });
  });

  const PORT = parseInt(process.env.PORT || '4019', 10);
  app.listen(PORT, () => {
    logger.info(`Health endpoint listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to bootstrap', { error: err });
  process.exit(1);
});
