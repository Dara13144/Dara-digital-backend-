import request from 'supertest';
import { app } from '../src/app.js';
import { generateAbaPurchaseHash, generateAbaCheckStatusHash } from '../src/integrations/aba/hashHelper.js';
import { paymentService } from '../src/services/paymentService.js';
import { PAYMENT_STATUS, ORDER_STATUS } from '../src/constants/states.js';

describe('ABA PayWay Integration & Payment State Machine Tests', () => {
  let authToken;
  let userId;
  let testOrderId;
  let paymentData;

  beforeAll(async () => {
    // 1. Authenticate test customer
    const loginRes = await request(app)
      .post('/api/auth/mock-login')
      .send({
        telegramId: 77777777,
        username: 'aba_tester',
        firstName: 'ABA Tester'
      });

    authToken = loginRes.body.data.token;
    userId = loginRes.body.data.user.id;

    // 2. Create Order
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        items: [
          {
            productId: '20000000-0000-0000-0000-000000000003', // Windows 11 Key
            quantity: 1
          }
        ],
        paymentMethod: 'aba_payway'
      });

    testOrderId = orderRes.body.data.id;
  });

  it('should generate official ABA PayWay purchase hash and check-status hash', () => {
    const purchaseHash = generateAbaPurchaseHash({
      req_time: '20261005120000',
      tran_id: 'TX-TEST-001',
      amount: '10.00'
    });
    expect(typeof purchaseHash).toBe('string');
    expect(purchaseHash.length).toBeGreaterThan(10);

    const checkStatusHash = generateAbaCheckStatusHash('20261005120000', 'TX-TEST-001', 'ec000000');
    expect(typeof checkStatusHash).toBe('string');
    expect(checkStatusHash.length).toBeGreaterThan(10);
  });

  it('should initiate ABA payment request with signed form parameters', async () => {
    const res = await request(app)
      .post('/api/payments/aba/create')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        orderId: testOrderId,
        paymentOption: 'abapay_khqr'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transactionId).toBeDefined();
    expect(res.body.data.formData.hash).toBeDefined();
    expect(res.body.data.formData.merchant_id).toBeDefined();

    paymentData = res.body.data;
  });

  it('should process ABA webhook callback and fulfill digital order', async () => {
    const callbackPayload = {
      tran_id: paymentData.transactionId,
      status: 0, // 0 = Approved in PayWay
      req_time: '20261005120000',
      hash: 'mock_signature'
    };

    const res = await request(app)
      .post('/api/payments/aba/callback')
      .send(callbackPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.order.status).toBe(ORDER_STATUS.COMPLETED);
    expect(res.body.data.deliveries.length).toBe(1);
    expect(res.body.data.deliveries[0].delivery_payload).toBeDefined();
  });

  it('should be IDEMPOTENT: duplicate callback must NOT duplicate stock delivery', async () => {
    const duplicatePayload = {
      tran_id: paymentData.transactionId,
      status: 0,
      req_time: '20261005120000',
      hash: 'mock_signature'
    };

    const res = await request(app)
      .post('/api/payments/aba/callback')
      .send(duplicatePayload);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('Already processed');
  });

  it('should allow customer to access purchased digital secret after completion', async () => {
    const res = await request(app)
      .get(`/api/delivery/order/${testOrderId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].delivery_payload).toBeDefined();
  });
});
