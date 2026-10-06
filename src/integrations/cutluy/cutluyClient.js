import axios from 'axios';
import crypto from 'node:crypto';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export const cutluyClient = {
  /**
   * Create a new CutLuy KHQR Payment Request
   * @param {object} params
   * @param {number} params.amount - Payment amount (minimum 0.01)
   * @param {string} params.referenceId - Order ID / Reference Number
   * @param {string} [params.currency='USD'] - Currency (USD or KHR)
   * @returns {Promise<object>} CutLuy Payment response object
   */
  async createPayment({ amount, referenceId, currency = 'USD' }) {
    if (!ENV.CUTLUY.API_KEY) {
      throw new Error('CUTLUY_API_KEY is not configured in backend environment.');
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount < 0.01) {
      throw new Error('INVALID_AMOUNT: Minimum payment amount is 0.01.');
    }

    const payload = {
      amount: Number(numericAmount.toFixed(2)),
      reference_id: String(referenceId),
      currency: currency || 'USD'
    };

    logger.info(`Creating CutLuy payment for Ref: ${referenceId}, Amount: ${payload.amount} ${payload.currency}`);

    const response = await axios.post(`${ENV.CUTLUY.BASE_URL}/payments`, payload, {
      headers: {
        Authorization: `Bearer ${ENV.CUTLUY.API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    return response.data;
  },

  /**
   * Fetch Live Payment Status from CutLuy
   * @param {string} cutluyPaymentId - CutLuy payment ID
   * @returns {Promise<object>} Live payment status object
   */
  async getPaymentStatus(cutluyPaymentId) {
    if (!cutluyPaymentId) {
      throw new Error('CutLuy payment ID is required.');
    }

    const response = await axios.get(`${ENV.CUTLUY.BASE_URL}/payments/${cutluyPaymentId}`, {
      headers: {
        Authorization: `Bearer ${ENV.CUTLUY.API_KEY}`
      },
      timeout: 10000
    });

    return response.data;
  },

  /**
   * Verify CutLuy Webhook Signature
   * @param {string|Buffer} rawBody - Raw unparsed request body string
   * @param {string} signatureHeader - Value of X-CutLuy-Signature header
   * @returns {boolean} True if signature is valid and timestamp is fresh (< 5 min)
   */
  verifyWebhookSignature(rawBody, signatureHeader) {
    if (!signatureHeader || !rawBody) return false;

    try {
      const parts = Object.fromEntries(
        signatureHeader.split(',').map((p) => p.trim().split('='))
      );

      if (!parts.t || !parts.v1) return false;

      const secret = ENV.CUTLUY.WEBHOOK_SECRET;
      const expected = crypto
        .createHmac('sha256', secret)
        .update(`${parts.t}.${rawBody}`)
        .digest('hex');

      const isTimestampFresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300; // 5 min
      if (!isTimestampFresh) {
        logger.warn('CutLuy webhook timestamp is expired.');
        return false;
      }

      return (
        expected.length === parts.v1.length &&
        crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected))
      );
    } catch (err) {
      logger.error('Error verifying CutLuy webhook signature:', err.message);
      return false;
    }
  },

  /**
   * Get SVG QR Render URL
   * @param {string} qrString - The raw KHQR string
   * @returns {string} CutLuy SVG Render URL
   */
  getQrRenderUrl(qrString) {
    if (!qrString) return '';
    return `https://cutluy.com/api/render/khqr/${encodeURIComponent(qrString)}.svg`;
  }
};
