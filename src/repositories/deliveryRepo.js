import { memoryStore } from './storeMemory.js';
import { dbPool } from '../config/db.js';
import { logger } from '../config/logger.js';

export const deliveryRepo = {
  async getDeliveriesByOrder(orderId) {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          'SELECT * FROM deliveries WHERE order_id = $1 ORDER BY delivered_at ASC',
          [orderId]
        );
        if (rows.length > 0) return rows;
      } catch (err) {
        logger.debug('dbPool getDeliveriesByOrder fallback:', err.message);
      }
    }
    return memoryStore.deliveries.filter((d) => d.order_id === orderId);
  },

  async getDeliveriesByUser(userId) {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          `SELECT d.*, p.name as product_name, o.order_number
           FROM deliveries d
           JOIN orders o ON d.order_id = o.id
           LEFT JOIN products p ON d.product_id = p.id
           WHERE o.user_id = $1
           ORDER BY d.delivered_at DESC`,
          [userId]
        );
        if (rows.length > 0) return rows;
      } catch (err) {
        logger.debug('dbPool getDeliveriesByUser fallback:', err.message);
      }
    }

    // Fallback to memory
    const userOrderIds = new Set(
      memoryStore.orders.filter((o) => o.user_id === userId).map((o) => o.id)
    );

    return memoryStore.deliveries
      .filter((d) => userOrderIds.has(d.order_id))
      .sort((a, b) => new Date(b.delivered_at) - new Date(a.delivered_at));
  },

  async markAsViewed(deliveryId) {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          'UPDATE deliveries SET is_viewed = true, viewed_at = NOW() WHERE id = $1 RETURNING *',
          [deliveryId]
        );
        if (rows.length > 0) return rows[0];
      } catch (err) {
        logger.debug('dbPool markAsViewed fallback:', err.message);
      }
    }

    const delivery = memoryStore.deliveries.find((d) => d.id === deliveryId);
    if (!delivery) return null;
    delivery.is_viewed = true;
    delivery.viewed_at = new Date().toISOString();
    return delivery;
  }
};

