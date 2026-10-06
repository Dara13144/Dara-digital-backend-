import { v4 as uuidv4 } from 'uuid';
import { memoryStore } from './storeMemory.js';
import { PAYMENT_STATUS } from '../constants/states.js';
import { generateTransactionId } from '../utils/crypto.js';
import { dbPool } from '../config/db.js';
import { logger } from '../config/logger.js';

export const paymentRepo = {
  async createPayment({
    orderId = null,
    userId,
    amount,
    currency = 'USD',
    gateway = 'cutluy_khqr',
    paymentUrl = null,
    rawRequest = null,
    purpose = 'order_payment'
  }) {
    const paymentId = uuidv4();
    const transactionId = generateTransactionId('ABA');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const payment = {
      id: paymentId,
      order_id: orderId,
      user_id: userId,
      transaction_id: transactionId,
      cutluy_payment_id: null,
      gateway,
      purpose,
      amount: Number(amount),
      currency,
      status: PAYMENT_STATUS.PENDING,
      payment_url: paymentUrl,
      qr_string: null,
      checkout_url: null,
      raw_request: rawRequest,
      raw_response: null,
      callback_payload: null,
      paid_at: null,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now
    };

    if (dbPool) {
      try {
        await dbPool.query(
          `INSERT INTO payments (
            id, order_id, user_id, transaction_id, gateway, amount, currency,
            status, payment_url, raw_request, purpose, expires_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, NOW(), NOW())`,
          [
            paymentId, orderId, userId, transactionId, gateway, payment.amount, currency,
            payment.status, paymentUrl, rawRequest ? JSON.stringify(rawRequest) : null,
            purpose, expiresAt
          ]
        );

        await dbPool.query(
          `INSERT INTO payment_events (id, payment_id, event_type, previous_status, new_status, payload, created_at)
           VALUES ($1, $2, 'PAYMENT_CREATED', null, $3, $4::jsonb, NOW())`,
          [uuidv4(), paymentId, PAYMENT_STATUS.PENDING, JSON.stringify({ transactionId, amount: payment.amount, gateway })]
        );
      } catch (err) {
        logger.warn('dbPool createPayment error, falling back:', err.message);
      }
    }

    memoryStore.payments.push(payment);

    memoryStore.payment_events.push({
      id: uuidv4(),
      payment_id: paymentId,
      event_type: 'PAYMENT_CREATED',
      previous_status: null,
      new_status: PAYMENT_STATUS.PENDING,
      payload: { transactionId, amount, gateway },
      created_at: now
    });

    return payment;
  },

  async findById(id) {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query('SELECT * FROM payments WHERE id = $1 LIMIT 1', [id]);
        if (rows.length > 0) return rows[0];
      } catch (err) {
        logger.debug('dbPool payment findById error:', err.message);
      }
    }

    return memoryStore.payments.find((p) => p.id === id) || null;
  },

  async findByTransactionId(transactionId) {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query('SELECT * FROM payments WHERE transaction_id = $1 LIMIT 1', [transactionId]);
        if (rows.length > 0) return rows[0];
      } catch (err) {
        logger.debug('dbPool findByTransactionId error:', err.message);
      }
    }

    return memoryStore.payments.find((p) => p.transaction_id === transactionId) || null;
  },

  async findByCutLuyId(cutluyId) {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          `SELECT * FROM payments 
           WHERE cutluy_payment_id = $1 
              OR raw_response->>'id' = $1 
              OR callback_payload->>'id' = $1
              OR callback_payload->'data'->'payment'->>'id' = $1
           LIMIT 1`,
          [cutluyId]
        );
        if (rows.length > 0) return rows[0];
      } catch (err) {
        logger.debug('dbPool findByCutLuyId error:', err.message);
      }
    }

    return memoryStore.payments.find((p) => p.cutluy_payment_id === cutluyId) || null;
  },

  async findByOrderId(orderId) {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
          [orderId]
        );
        if (rows.length > 0) return rows[0];
      } catch (err) {
        logger.debug('dbPool findByOrderId error:', err.message);
      }
    }

    return memoryStore.payments.find((p) => p.order_id === orderId) || null;
  },

  async attachCutLuyDetails(paymentId, { cutluyPaymentId, qrString, checkoutUrl, expiresAt }) {
    if (dbPool) {
      try {
        await dbPool.query(
          `UPDATE payments 
           SET cutluy_payment_id = $1, 
               qr_string = $2, 
               checkout_url = $3, 
               expires_at = COALESCE($4, expires_at),
               updated_at = NOW() 
           WHERE id = $5`,
          [cutluyPaymentId, qrString, checkoutUrl, expiresAt, paymentId]
        );
      } catch (err) {
        logger.warn('dbPool attachCutLuyDetails error:', err.message);
      }
    }
    const payment = memoryStore.payments.find((p) => p.id === paymentId);
    if (payment) {
      payment.cutluy_payment_id = cutluyPaymentId;
      payment.qr_string = qrString;
      payment.checkout_url = checkoutUrl;
      if (expiresAt) payment.expires_at = expiresAt;
      payment.updated_at = new Date().toISOString();
    }
    return payment;
  },

  async findPendingCutluyPayments() {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          `SELECT * FROM payments 
           WHERE status = 'PENDING' 
             AND (gateway = 'cutluy_khqr' OR cutluy_payment_id IS NOT NULL)
             AND cutluy_payment_id IS NOT NULL
             AND created_at > NOW() - INTERVAL '30 minutes'
           ORDER BY created_at DESC 
           LIMIT 20`
        );
        return rows;
      } catch (err) {
        logger.debug('dbPool findPendingCutluyPayments error:', err.message);
      }
    }
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    return memoryStore.payments.filter(
      (p) => p.status === PAYMENT_STATUS.PENDING && 
             p.cutluy_payment_id && 
             new Date(p.created_at) > thirtyMinAgo
    );
  },

  async updatePaymentStatus(paymentId, newStatus, { callbackPayload = null, rawResponse = null } = {}) {
    const statusUpper = String(newStatus).toUpperCase();
    if (dbPool) {
      try {
        const cutluyId = callbackPayload?.data?.payment?.id || callbackPayload?.id || rawResponse?.id || null;
        const qrString = rawResponse?.qr_string || null;
        const checkoutUrl = rawResponse?.checkout_url || null;

        const { rows } = await dbPool.query(
          `UPDATE payments
           SET status = $1::text::payment_status_enum,
               callback_payload = COALESCE($2::jsonb, callback_payload),
               raw_response = COALESCE($3::jsonb, raw_response),
               cutluy_payment_id = COALESCE($4, cutluy_payment_id),
               qr_string = COALESCE($5, qr_string),
               checkout_url = COALESCE($6, checkout_url),
               paid_at = (CASE WHEN $1::text = 'PAID' AND paid_at IS NULL THEN NOW() ELSE paid_at END),
               updated_at = NOW()
           WHERE id = $7
           RETURNING *`,
          [
            statusUpper,
            callbackPayload ? JSON.stringify(callbackPayload) : null,
            rawResponse ? JSON.stringify(rawResponse) : null,
            cutluyId, qrString, checkoutUrl, paymentId
          ]
        );

        try {
          await dbPool.query(
            `INSERT INTO payment_events (id, payment_id, event_type, new_status, payload, created_at)
             VALUES ($1, $2, $3, $4::text::payment_status_enum, $5::jsonb, NOW())`,
            [
              uuidv4(), paymentId, `STATUS_${statusUpper}`, statusUpper,
              JSON.stringify(callbackPayload || rawResponse || {})
            ]
          );
        } catch (evtErr) {
          logger.debug('payment_events insertion skipped/failed:', evtErr.message);
        }

        if (rows.length > 0) {
          const updated = rows[0];
          const idx = memoryStore.payments.findIndex((p) => p.id === paymentId);
          if (idx !== -1) memoryStore.payments[idx] = updated;
          return updated;
        }
      } catch (err) {
        logger.warn('dbPool updatePaymentStatus error, falling back:', err.message);
      }
    }

    const payment = memoryStore.payments.find((p) => p.id === paymentId);
    if (!payment) return null;

    const prevStatus = payment.status;
    payment.status = newStatus;

    if (callbackPayload) {
      payment.callback_payload = callbackPayload;
    }
    if (rawResponse) {
      payment.raw_response = rawResponse;
      if (rawResponse.qr_string) payment.qr_string = rawResponse.qr_string;
      if (rawResponse.checkout_url) payment.checkout_url = rawResponse.checkout_url;
      if (rawResponse.id) payment.cutluy_payment_id = rawResponse.id;
    }
    if (newStatus === PAYMENT_STATUS.PAID && !payment.paid_at) {
      payment.paid_at = new Date().toISOString();
    }
    payment.updated_at = new Date().toISOString();

    memoryStore.payment_events.push({
      id: uuidv4(),
      payment_id: paymentId,
      event_type: `STATUS_${newStatus}`,
      previous_status: prevStatus,
      new_status: newStatus,
      payload: callbackPayload || rawResponse || {},
      created_at: new Date().toISOString()
    });

    return payment;
  },

  async getAllPayments({ status, page = 1, limit = 20 } = {}) {
    if (dbPool) {
      try {
        let query = `
          SELECT p.*,
                 o.order_number,
                 u.first_name,
                 u.last_name,
                 u.username,
                 u.telegram_id,
                 u.email
          FROM payments p
          LEFT JOIN orders o ON p.order_id = o.id
          LEFT JOIN users u ON p.user_id = u.id
          WHERE 1=1
        `;
        const params = [];

        if (status) {
          params.push(status);
          query += ` AND p.status = $${params.length}`;
        }

        const countQuery = `SELECT count(*)::int as count FROM (${query}) as count_tbl`;
        const countRes = await dbPool.query(countQuery, params);
        const total = countRes.rows[0]?.count || 0;

        const offset = (page - 1) * limit;
        params.push(limit, offset);
        query += ` ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

        const { rows } = await dbPool.query(query, params);
        return { items: rows, total, page, limit };
      } catch (err) {
        logger.warn('dbPool getAllPayments error, falling back:', err.message);
      }
    }

    let list = [...memoryStore.payments];
    if (status) {
      list = list.filter((p) => p.status === status);
    }
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = list.length;
    const items = list.slice((page - 1) * limit, page * limit);
    return { items, total, page, limit };
  }
};
