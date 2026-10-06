import axios from 'axios';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { generateAbaPurchaseHash, generateAbaCheckStatusHash, verifyAbaPushbackHash } from './hashHelper.js';

export class AbaPayWayClient {
  constructor() {
    this.merchantId = ENV.ABA.MERCHANT_ID;
    this.apiKey = ENV.ABA.API_KEY;
    this.secret = ENV.ABA.SECRET;
    this.isSandbox = ENV.ABA.ENVIRONMENT === 'sandbox';

    this.purchaseUrl = this.isSandbox
      ? ENV.ABA.SANDBOX_BASE_URL
      : ENV.ABA.PRODUCTION_BASE_URL;

    this.checkStatusUrl = this.isSandbox
      ? ENV.ABA.SANDBOX_CHECK_TRAN_URL
      : ENV.ABA.PRODUCTION_CHECK_TRAN_URL;
  }

  /**
   * Format current date to YYYYMMDDHHmmss
   */
  getReqTime() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  /**
   * Create ABA PayWay Payment Request Payload & Form parameters
   */
  createPaymentPayload({
    tranId,
    amount,
    items,
    firstName = 'Customer',
    lastName = 'User',
    email = 'customer@daramini.store',
    phone = '012345678',
    paymentOption = 'abapay_khqr',
    returnParams = ''
  }) {
    const reqTime = this.getReqTime();
    const formattedAmount = Number(amount).toFixed(2);
    const base64Items = Buffer.from(JSON.stringify(items)).toString('base64');

    const params = {
      req_time: reqTime,
      merchant_id: this.merchantId,
      tran_id: tranId,
      amount: formattedAmount,
      items: base64Items,
      shipping: '0.00',
      first_name: firstName || 'Customer',
      last_name: lastName || 'User',
      email: email || 'customer@daramini.store',
      phone: phone || '012345678',
      type: 'purchase',
      payment_option: paymentOption,
      return_url: `${ENV.ABA.RETURN_URL}?order_id=${tranId}`,
      cancel_url: `${ENV.ABA.CANCEL_URL}?order_id=${tranId}`,
      continue_success_url: `${ENV.ABA.RETURN_URL}?order_id=${tranId}`,
      return_params: returnParams || JSON.stringify({ tran_id: tranId })
    };

    const hash = generateAbaPurchaseHash(params);

    return {
      paymentUrl: this.purchaseUrl,
      formData: {
        ...params,
        hash
      }
    };
  }

  /**
   * Query ABA PayWay API to check actual transaction status on ABA servers
   */
  async checkTransactionStatus(tranId) {
    const reqTime = this.getReqTime();
    const hash = generateAbaCheckStatusHash(reqTime, tranId, this.merchantId);

    try {
      // In sandbox/mock testing without live API keys
      if (this.apiKey.includes('mock') || !this.merchantId || this.merchantId === 'ec000000') {
        logger.info(`ABA Sandbox check transaction called for ${tranId}`);
        return {
          status: 0, // 0 = approved in ABA PayWay
          description: 'Approved (Sandbox / Mock mode)',
          raw: { status: 0, tran_id: tranId }
        };
      }

      const payload = {
        req_time: reqTime,
        merchant_id: this.merchantId,
        tran_id: tranId,
        hash
      };

      const response = await axios.post(this.checkStatusUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      logger.info(`ABA Check Transaction response for ${tranId}:`, response.data);
      return {
        status: response.data?.status,
        description: response.data?.description,
        amount: response.data?.amount,
        raw: response.data
      };
    } catch (err) {
      logger.error(`ABA checkTransactionStatus error for ${tranId}:`, err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Validate incoming webhook callback from ABA PayWay
   */
  verifyWebhook(reqBody) {
    const { tran_id, status, req_time, hash } = reqBody;
    if (!tran_id || status === undefined) return false;

    // In sandbox mock mode
    if (this.apiKey.includes('mock') || this.secret.includes('mock')) {
      return true;
    }

    return verifyAbaPushbackHash(req_time, tran_id, status, hash);
  }
}

export const abaClient = new AbaPayWayClient();
