import { paymentService } from '../services/paymentService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { logger } from '../config/logger.js';

export const paymentController = {
  /**
   * Create CutLuy KHQR Payment Request (Universal Bakong / All Banks)
   */
  async createCutLuyPayment(req, res) {
    try {
      const { orderId } = req.body;
      const userId = req.user.userId;

      if (!orderId) {
        return errorResponse(res, ERROR_CODES.BAD_REQUEST, 'orderId is required', 400);
      }

      const result = await paymentService.initiateCutLuyPayment(orderId, userId);
      return successResponse(res, result, 'CutLuy KHQR payment initiated');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.PAYMENT_CREATION_FAILED, err.message, 400);
    }
  },

  /**
   * CutLuy Webhook Callback (POST /webhooks/cutluy)
   */
  async handleCutLuyWebhook(req, res) {
    try {
      const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
      const signature = req.get('X-CutLuy-Signature') || req.headers['x-cutluy-signature'];
      const result = await paymentService.handleCutLuyWebhook(rawBody, signature, req.body);
      return res.status(200).json({ ok: true, data: result });
    } catch (err) {
      logger.error('CutLuy Webhook Error:', err.message);
      return res.status(400).json({ ok: false, error: err.message });
    }
  },

  /**
   * Create ABA PayWay Payment Request
   */
  async createAbaPayment(req, res) {
    try {
      const { orderId, paymentOption = 'abapay_khqr' } = req.body;
      const userId = req.user.userId;

      if (!orderId) {
        return errorResponse(res, ERROR_CODES.BAD_REQUEST, 'orderId is required', 400);
      }

      const result = await paymentService.initiateAbaPayment(orderId, userId, paymentOption);
      return successResponse(res, result, 'ABA PayWay payment initiated');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.PAYMENT_CREATION_FAILED, err.message, 400);
    }
  },

  /**
   * Pay with Internal Wallet Balance
   */
  async payWithWallet(req, res) {
    try {
      const { orderId } = req.body;
      const userId = req.user.userId;

      if (!orderId) {
        return errorResponse(res, ERROR_CODES.BAD_REQUEST, 'orderId is required', 400);
      }

      const result = await paymentService.payWithWallet(orderId, userId);
      return successResponse(res, result, 'Paid with wallet balance successfully');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  /**
   * ABA PayWay Webhook / Pushback Callback
   */
  async handleAbaCallback(req, res) {
    try {
      const payload = req.body;
      const result = await paymentService.handleAbaCallback(payload);
      return successResponse(res, result, 'Callback processed');
    } catch (err) {
      logger.error('ABA Callback Error:', err.message);
      return errorResponse(res, ERROR_CODES.PAYMENT_VERIFICATION_FAILED, err.message, 400);
    }
  },

  /**
   * Check / Verify Payment Status (Polled by frontend or triggered on return URL)
   */
  async checkPaymentStatus(req, res) {
    try {
      const { paymentId } = req.params;
      const result = await paymentService.verifyPaymentStatus(paymentId);
      return successResponse(res, result, 'Payment status checked');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  }
};
