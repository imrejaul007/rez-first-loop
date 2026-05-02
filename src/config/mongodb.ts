import mongoose from 'mongoose';
import { logger } from './logger';
export async function connectMongo(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) { logger.error('MONGODB_URI required'); process.exit(1); }
  await mongoose.connect(uri);
  logger.info('MongoDB connected');
}
