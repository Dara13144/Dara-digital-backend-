import cron from 'node-cron';
import { memoryStore } from '../repositories/storeMemory.js';
import { PAYMENT_STATUS, ORDER_STATUS } from '../constants/states.js';
import { paymentRepo } from '../repositories/paymentRepo.js';
import { orderRepo } from '../repositories/orderRepo.js';
import { logger } from '../config/logger.js';

export function startBackgroundJobs() {
  logger.info('Initializing background cron workers...');

  // 1. Expire stale pending payments every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    try {
      const now = new Date();
      const pendingPayments = memoryStore.payments.filter(
        (p) => p.status === PAYMENT_STATUS.PENDING && p.expires_at && new Date(p.expires_at) < now
      );

      for (const payment of pendingPayments) {
        logger.info(`Expiring stale payment ${payment.transaction_id} (Order: ${payment.order_id})`);
        await paymentRepo.updatePaymentStatus(payment.id, PAYMENT_STATUS.EXPIRED);
        await orderRepo.updateOrderStatus(payment.order_id, ORDER_STATUS.CANCELLED, 'Payment window expired.');
      }
    } catch (err) {
      logger.error('Error in payment expiry cron:', err.message);
    }
  });

  logger.info('Background cron workers active.');
}
