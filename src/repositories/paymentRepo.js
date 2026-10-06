import { v4 as uuidv4 } from 'uuid';
import { memoryStore } from './storeMemory.js';
import { PAYMENT_STATUS } from '../constants/states.js';
import { generateTransactionId } from '../utils/crypto.js';

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
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins expiry

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

    memoryStore.payments.push(payment);

    // Record initial event
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
    return memoryStore.payments.find((p) => p.id === id) || null;
  },

  async findByTransactionId(transactionId) {
    return memoryStore.payments.find((p) => p.transaction_id === transactionId) || null;
  },

  async findByCutLuyId(cutluyId) {
    return memoryStore.payments.find((p) => p.cutluy_payment_id === cutluyId) || null;
  },

  async findByOrderId(orderId) {
    return memoryStore.payments.find((p) => p.order_id === orderId) || null;
  },

  async updatePaymentStatus(paymentId, newStatus, { callbackPayload = null, rawResponse = null } = {}) {
    const payment = memoryStore.payments.find((p) => p.id === paymentId);
    if (!payment) return null;

    const prevStatus = payment.status;
    payment.status = newStatus;

    if (callbackPayload) {
      payment.callback_payload = callbackPayload;
    }
    if (rawResponse) {
      payment.raw_response = rawResponse;
    }
    if (newStatus === PAYMENT_STATUS.PAID && !payment.paid_at) {
      payment.paid_at = new Date().toISOString();
    }
    payment.updated_at = new Date().toISOString();

    // Log payment state event
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
