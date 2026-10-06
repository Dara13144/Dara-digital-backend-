import { walletRepo } from '../repositories/walletRepo.js';
import { paymentService } from '../services/paymentService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export const walletController = {
  async getWallet(req, res) {
    try {
      const wallet = await walletRepo.getOrCreateWallet(req.user.userId);
      return successResponse(res, wallet, 'Wallet retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async getTransactions(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await walletRepo.getTransactions(req.user.userId, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      });
      return successResponse(res, result, 'Wallet transactions retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async initiateTopup(req, res) {
    try {
      const { amount, method = 'cutluy_khqr' } = req.body;
      const result = await paymentService.initiateWalletTopUp(req.user.userId, amount, method);
      return successResponse(res, result, 'Top-up initiated successfully');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.VALIDATION_ERROR, err.message, 400);
    }
  }
};
