import { Worker } from 'bullmq';
import { getRedis } from './config/redis';
import { logger } from './config/logger';
import axios from 'axios';

const REDIS = getRedis();

/**
 * First Closed Loop Orchestrator
 *
 * Flow (from SOURCE-OF-TRUTH README.md):
 * 1. Stock drops below threshold → emit inventory.low
 * 2. Event Platform validates & routes
 * 3. Action Engine decides action level
 * 4. Draft PO created in NextaBiZ
 * 5. Merchant approves/rejects
 * 6. Feedback recorded
 * 7. AdaptiveScoringAgent learns
 */
export async function startFirstLoopOrchestrator(): Promise<Worker> {
  const worker = new Worker(
    'first-loop',
    async (job) => {
      const { eventType, data, correlationId } = job.data;

      logger.info('First loop processing', { eventType, correlationId });

      if (eventType === 'inventory.low') {
        await handleInventoryLow(data, correlationId);
      } else if (eventType === 'feedback.recorded') {
        await handleFeedbackRecorded(data, correlationId);
      } else {
        logger.debug('Unhandled event type in first loop', { eventType });
      }

      return { processed: true, eventType };
    },
    {
      connection: REDIS as never,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('First loop job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('First loop orchestrator worker started');
  return worker;
}

async function handleInventoryLow(
  data: Record<string, unknown>,
  correlationId: string
): Promise<void> {
  const { merchant_id, store_id, item_id, item_name, current_stock, threshold, supplier_id } = data as {
    merchant_id: string;
    store_id: string;
    item_id: string;
    item_name: string;
    current_stock: number;
    threshold: number;
    supplier_id?: string;
  };

  logger.info('Processing inventory.low event', {
    item_id,
    item_name,
    current_stock,
    threshold,
    merchant_id,
  });

  // Step 1: Call Action Engine to decide action level
  const actionEngineUrl = process.env.REZ_ACTION_ENGINE_URL;
  if (!actionEngineUrl) {
    logger.warn('REZ_ACTION_ENGINE_URL not set, skipping action decision');
    return;
  }

  let actionLevel = 'notify';
  try {
    const response = await axios.post(
      `${actionEngineUrl}/actions`,
      { eventType: 'inventory.low', data, correlationId },
      { timeout: 5000 }
    );
    actionLevel = response.data.action || 'notify';
    logger.info('Action engine response', { actionLevel, correlationId });
  } catch (err) {
    logger.error('Action engine call failed', { error: String(err), correlationId });
  }

  // Step 2: If actionLevel === 'draft_po', call NextaBiZ to create draft PO
  if (actionLevel === 'draft_po' && supplier_id) {
    await createDraftPO(data, correlationId);
  }

  // Step 3: Emit feedback (pending) for the action taken
  await recordPendingFeedback(data, actionLevel, correlationId);
}

async function createDraftPO(
  data: Record<string, unknown>,
  correlationId: string
): Promise<void> {
  const nextabizUrl = process.env.NEXTABIZ_URL;
  if (!nextabizUrl) {
    logger.warn('NEXTABIZ_URL not set, skipping draft PO creation');
    return;
  }

  try {
    await axios.post(
      `${nextabizUrl}/api/procurement/draft-po`,
      {
        item_id: data.item_id,
        item_name: data.item_name,
        current_stock: data.current_stock,
        threshold: data.threshold,
        supplier_id: data.supplier_id,
        merchant_id: data.merchant_id,
        store_id: data.store_id,
        correlation_id: correlationId,
      },
      { timeout: 10000 }
    );
    logger.info('Draft PO created', { item_id: data.item_id, correlationId });
  } catch (err) {
    logger.error('Failed to create draft PO', { error: String(err), correlationId });
  }
}

async function recordPendingFeedback(
  data: Record<string, unknown>,
  actionLevel: string,
  correlationId: string
): Promise<void> {
  const feedbackServiceUrl = process.env.REZ_FEEDBACK_SERVICE_URL;
  if (!feedbackServiceUrl) {
    logger.warn('REZ_FEEDBACK_SERVICE_URL not set, skipping feedback');
    return;
  }

  try {
    await axios.post(
      `${feedbackServiceUrl}/feedback`,
      {
        eventType: 'inventory.low',
        correlationId,
        actionTaken: actionLevel,
        outcome: 'pending',
        feedbackType: 'implicit',
        data: { inventory_data: data },
        merchantId: data.merchant_id,
        storeId: data.store_id,
      },
      { timeout: 5000 }
    );
    logger.info('Pending feedback recorded', { correlationId, actionLevel });
  } catch (err) {
    logger.error('Failed to record feedback', { error: String(err), correlationId });
  }
}

async function handleFeedbackRecorded(
  data: Record<string, unknown>,
  correlationId: string
): Promise<void> {
  // When explicit feedback arrives (merchant approved/rejected),
  // update the AdaptiveScoringAgent score
  const { outcome, actionTaken, merchant_id, store_id } = data as {
    outcome: string;
    actionTaken: string;
    merchant_id?: string;
    store_id?: string;
  };

  logger.info('Feedback received', { outcome, actionTaken, correlationId });

  // Store in Redis for quick lookup by AdaptiveScoringAgent
  await REDIS.hset(
    `feedback:${correlationId}`,
    'outcome',
    outcome,
    'actionTaken',
    actionTaken,
    'updatedAt',
    String(Date.now())
  );

  // Expire after 30 days
  await REDIS.expire(`feedback:${correlationId}`, 30 * 24 * 60 * 60);
}
