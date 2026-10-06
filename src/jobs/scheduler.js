import cron from 'node-cron';
import { memoryStore } from '../repositories/storeMemory.js';
import { PAYMENT_STATUS, ORDER_STATUS } from '../constants/states.js';
import { paymentRepo } from '../repositories/paymentRepo.js';
import { orderRepo } from '../repositories/orderRepo.js';
import { paymentService } from '../services/paymentService.js';
import { logger } from '../config/logger.js';

let isAutoPaymentWorkerRunning = false;

/**
 * Worker that actively polls CutLuy status for all pending payments in the last 30 minutes.
 * Ensures instant fulfillment even if customer closes browser or webhook is blocked by NAT/Firewall.
 */
async function syncPendingCutLuyPayments() {
  if (isAutoPaymentWorkerRunning) return;
  isAutoPaymentWorkerRunning = true;

  try {
    const pendingPayments = await paymentRepo.findPendingCutluyPayments();
    if (pendingPayments && pendingPayments.length > 0) {
      for (const payment of pendingPayments) {
        try {
          const result = await paymentService.verifyPaymentStatus(payment.id);
          if (result && result.status === PAYMENT_STATUS.PAID) {
            logger.info(`⚡ [AUTO-PAYMENT SUCCESS] Payment ${payment.id} (Ref: ${payment.transaction_id}) verified & fulfilled automatically!`);
          }
        } catch (singleErr) {
          logger.debug(`Auto-payment poll error for ${payment.id}: ${singleErr.message}`);
        }
      }
    }
  } catch (err) {
    logger.debug('Error in auto-payment background worker:', err.message);
  } finally {
    isAutoPaymentWorkerRunning = false;
  }
}

export function startBackgroundJobs() {
  logger.info('Initializing background cron workers...');

  // 1. Auto-Payment Real-Time Poller (Runs every 7 seconds for instant fulfillment)
  const autoPayInterval = setInterval(syncPendingCutLuyPayments, 7000);
  // Run once immediately on start
  syncPendingCutLuyPayments();

  // 2. Expire stale pending payments every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    try {
      const now = new Date();
      const pendingPayments = memoryStore.payments.filter(
        (p) => p.status === PAYMENT_STATUS.PENDING && p.expires_at && new Date(p.expires_at) < now
      );

      for (const payment of pendingPayments) {
        logger.info(`Expiring stale payment ${payment.transaction_id} (Order: ${payment.order_id})`);
        await paymentRepo.updatePaymentStatus(payment.id, PAYMENT_STATUS.EXPIRED);
        if (payment.order_id) {
          await orderRepo.updateOrderStatus(payment.order_id, ORDER_STATUS.CANCELLED, 'Payment window expired.');
        }
      }
    } catch (err) {
      logger.error('Error in payment expiry cron:', err.message);
    }
  });

  logger.info('Background cron workers & Auto-Payment poller active.');
}
