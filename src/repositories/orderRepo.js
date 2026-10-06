import { v4 as uuidv4 } from 'uuid';
import { memoryStore } from './storeMemory.js';
import { generateOrderNumber } from '../utils/crypto.js';
import { ORDER_STATUS } from '../constants/states.js';
import { dbPool } from '../config/db.js';
import { logger } from '../config/logger.js';

export const orderRepo = {
  async createOrder({
    userId,
    subtotal,
    discountAmount = 0.0,
    couponId = null,
    totalAmount,
    currency = 'USD',
    paymentMethod = 'aba_payway',
    customerNotes = null,
    items = []
  }) {
    const orderId = uuidv4();
    const orderNumber = generateOrderNumber();
    const now = new Date().toISOString();

    const order = {
      id: orderId,
      order_number: orderNumber,
      user_id: userId,
      subtotal: Number(subtotal),
      discount_amount: Number(discountAmount),
      coupon_id: couponId,
      total_amount: Number(totalAmount),
      currency,
      status: ORDER_STATUS.PENDING_PAYMENT,
      payment_method: paymentMethod,
      customer_notes: customerNotes,
      admin_notes: null,
      created_at: now,
      updated_at: now
    };

    const orderItems = items.map((item) => ({
      id: uuidv4(),
      order_id: orderId,
      product_id: item.product_id,
      product_name: item.product_name,
      stock_type: item.stock_type,
      unit_price: Number(item.unit_price),
      quantity: Number(item.quantity),
      total_price: Number(item.total_price),
      created_at: now
    }));

    if (dbPool) {
      try {
        await dbPool.query(
          `INSERT INTO orders (id, order_number, user_id, subtotal, discount_amount, coupon_id, total_amount, currency, status, payment_method, customer_notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [order.id, order.order_number, order.user_id, order.subtotal, order.discount_amount, order.coupon_id, order.total_amount, order.currency, order.status, order.payment_method, order.customer_notes]
        );

        for (const item of orderItems) {
          await dbPool.query(
            `INSERT INTO order_items (id, order_id, product_id, product_name, stock_type, unit_price, quantity, total_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [item.id, item.order_id, item.product_id, item.product_name, item.stock_type, item.unit_price, item.quantity, item.total_price]
          );
        }
      } catch (err) {
        logger.error('dbPool createOrder error:', err.message);
      }
    }

    memoryStore.orders.unshift(order);
    memoryStore.order_items.push(...orderItems);

    return {
      ...order,
      items: orderItems
    };
  },

  async findById(orderId) {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        if (rows.length > 0) {
          const order = rows[0];
          const itemsRes = await dbPool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
          const delivRes = await dbPool.query('SELECT * FROM digital_deliveries WHERE order_id = $1', [orderId]).catch(() => ({ rows: [] }));
          const userRes = await dbPool.query('SELECT id, telegram_id, first_name, username FROM users WHERE id = $1', [order.user_id]).catch(() => ({ rows: [] }));

          return {
            ...order,
            items: itemsRes.rows || [],
            deliveries: delivRes.rows || [],
            payment: null,
            user: userRes.rows[0] || null
          };
        }
      } catch (err) {
        logger.debug('dbPool findById fallback:', err.message);
      }
    }

    const order = memoryStore.orders.find((o) => o.id === orderId);
    if (!order) return null;

    const items = memoryStore.order_items.filter((item) => item.order_id === order.id);
    const deliveries = memoryStore.deliveries.filter((d) => d.order_id === order.id);
    const payment = memoryStore.payments.find((p) => p.order_id === order.id);
    const user = memoryStore.users.find((u) => u.id === order.user_id);

    return {
      ...order,
      items,
      deliveries,
      payment: payment || null,
      user: user ? { id: user.id, telegram_id: user.telegram_id, first_name: user.first_name, username: user.username } : null
    };
  },

  async findByOrderNumber(orderNumber) {
    const order = memoryStore.orders.find((o) => o.order_number === orderNumber);
    if (!order) return null;
    return this.findById(order.id);
  },

  async getOrdersByUser(userId, { page = 1, limit = 20 } = {}) {
    const list = memoryStore.orders
      .filter((o) => o.user_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = list.length;
    const paginated = list.slice((page - 1) * limit, page * limit);

    const populated = paginated.map((o) => {
      const items = memoryStore.order_items.filter((item) => item.order_id === o.id);
      return { ...o, items };
    });

    return { items: populated, total, page, limit };
  },

  async getAllOrders({ status, search, page = 1, limit = 20 } = {}) {
    let list = [...memoryStore.orders];

    if (status) {
      list = list.filter((o) => o.status === status);
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((o) => o.order_number.toLowerCase().includes(q));
    }

    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = list.length;
    const paginated = list.slice((page - 1) * limit, page * limit);

    const populated = paginated.map((o) => {
      const items = memoryStore.order_items.filter((item) => item.order_id === o.id);
      const user = memoryStore.users.find((u) => u.id === o.user_id);
      return {
        ...o,
        items,
        user: user ? { id: user.id, first_name: user.first_name, username: user.username, telegram_id: user.telegram_id } : null
      };
    });

    return { items: populated, total, page, limit };
  },

  async updateOrderStatus(orderId, newStatus, adminNotes = null) {
    if (dbPool) {
      try {
        await dbPool.query(
          `UPDATE orders
           SET status = $1, admin_notes = COALESCE($2, admin_notes), updated_at = NOW()
           WHERE id = $3`,
          [newStatus, adminNotes, orderId]
        );
      } catch (err) {
        logger.debug('dbPool updateOrderStatus error:', err.message);
      }
    }

    const order = memoryStore.orders.find((o) => o.id === orderId);
    if (!order) return null;

    order.status = newStatus;
    if (adminNotes !== null) {
      order.admin_notes = adminNotes;
    }
    order.updated_at = new Date().toISOString();
    return order;
  }
};
