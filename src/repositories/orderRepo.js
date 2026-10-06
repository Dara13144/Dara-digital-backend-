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
          // Use 'deliveries' table (matching Supabase schema migration)
          const delivRes = await dbPool.query('SELECT * FROM deliveries WHERE order_id = $1 ORDER BY delivered_at ASC', [orderId]).catch(() => ({ rows: [] }));
          const userRes = await dbPool.query('SELECT id, telegram_id, first_name, username, email FROM users WHERE id = $1', [order.user_id]).catch(() => ({ rows: [] }));
          const paymentRes = await dbPool.query('SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1', [orderId]).catch(() => ({ rows: [] }));

          return {
            ...order,
            items: itemsRes.rows || [],
            deliveries: delivRes.rows || [],
            payment: paymentRes.rows[0] || null,
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
      user: user ? { id: user.id, telegram_id: user.telegram_id, first_name: user.first_name, username: user.username, email: user.email } : null
    };
  },

  async findByOrderNumber(orderNumber) {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query('SELECT id FROM orders WHERE order_number = $1 LIMIT 1', [orderNumber]);
        if (rows.length > 0) {
          return await this.findById(rows[0].id);
        }
      } catch (err) {
        logger.debug('dbPool findByOrderNumber fallback:', err.message);
      }
    }

    const order = memoryStore.orders.find((o) => o.order_number === orderNumber);
    if (!order) return null;
    return this.findById(order.id);
  },

  async getOrdersByUser(userId, { page = 1, limit = 20 } = {}) {
    if (dbPool) {
      try {
        const offset = (page - 1) * limit;
        const countRes = await dbPool.query(
          'SELECT count(*)::int as count FROM orders WHERE user_id = $1',
          [userId]
        );
        const total = countRes.rows[0]?.count || 0;

        const { rows: orders } = await dbPool.query(
          `SELECT * FROM orders 
           WHERE user_id = $1 
           ORDER BY created_at DESC 
           LIMIT $2 OFFSET $3`,
          [userId, limit, offset]
        );

        if (orders.length > 0) {
          const orderIds = orders.map((o) => o.id);
          const { rows: items } = await dbPool.query(
            'SELECT * FROM order_items WHERE order_id = ANY($1::uuid[])',
            [orderIds]
          );

          const populated = orders.map((o) => ({
            ...o,
            items: items.filter((it) => it.order_id === o.id)
          }));

          return { items: populated, total, page, limit };
        }

        return { items: [], total: 0, page, limit };
      } catch (err) {
        logger.debug('dbPool getOrdersByUser error, falling back:', err.message);
      }
    }

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
    if (dbPool) {
      try {
        let query = `
          SELECT o.*, 
                 json_build_object(
                   'id', u.id, 
                   'first_name', u.first_name, 
                   'last_name', u.last_name, 
                   'username', u.username, 
                   'email', u.email, 
                   'telegram_id', u.telegram_id
                 ) as user
          FROM orders o
          LEFT JOIN users u ON o.user_id = u.id
          WHERE 1=1
        `;
        const params = [];

        if (status) {
          params.push(status);
          query += ` AND o.status = $${params.length}`;
        }

        if (search) {
          params.push(`%${search.trim().toLowerCase()}%`);
          query += ` AND (LOWER(o.order_number) LIKE $${params.length} OR LOWER(COALESCE(u.username, '')) LIKE $${params.length} OR CAST(u.telegram_id AS TEXT) LIKE $${params.length})`;
        }

        const countQuery = `SELECT count(*)::int as count FROM (${query}) as count_tbl`;
        const countRes = await dbPool.query(countQuery, params);
        const total = countRes.rows[0]?.count || 0;

        const offset = (page - 1) * limit;
        params.push(limit, offset);
        query += ` ORDER BY o.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

        const { rows: orders } = await dbPool.query(query, params);

        if (orders.length > 0) {
          const orderIds = orders.map((o) => o.id);
          const { rows: items } = await dbPool.query(
            'SELECT * FROM order_items WHERE order_id = ANY($1::uuid[])',
            [orderIds]
          );

          const populated = orders.map((o) => ({
            ...o,
            items: items.filter((it) => it.order_id === o.id)
          }));

          return { items: populated, total, page, limit };
        }

        return { items: [], total: 0, page, limit };
      } catch (err) {
        logger.warn('dbPool getAllOrders error, falling back:', err.message);
      }
    }

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
