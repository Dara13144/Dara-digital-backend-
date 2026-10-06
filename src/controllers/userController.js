import { userRepo } from '../repositories/userRepo.js';
import { walletRepo } from '../repositories/walletRepo.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export const userController = {
  async getProfile(req, res) {
    try {
      let user = await userRepo.findById(req.user.userId);
      if (!user) {
        return errorResponse(res, ERROR_CODES.RESOURCE_NOT_FOUND, 'User not found', 404);
      }

      // If avatar is missing but telegram_id is present, attempt background sync
      if (!user.avatar_url && user.telegram_id) {
        user = await userRepo.syncTelegramAvatar(user.id);
      }

      const wallet = await walletRepo.getOrCreateWallet(user.id);
      return successResponse(res, { ...user, balance: Number(wallet.balance), wallet_balance: Number(wallet.balance) }, 'Profile retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async updateLanguage(req, res) {
    try {
      const { language } = req.body;
      const user = await userRepo.findById(req.user.userId);
      if (!user) {
        return errorResponse(res, ERROR_CODES.RESOURCE_NOT_FOUND, 'User not found', 404);
      }
      user.language = language === 'km' ? 'km' : 'en';
      return successResponse(res, user, 'Language preference updated');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async syncAvatar(req, res) {
    try {
      const user = await userRepo.syncTelegramAvatar(req.user.userId);
      if (!user) {
        return errorResponse(res, ERROR_CODES.RESOURCE_NOT_FOUND, 'User not found', 404);
      }
      return successResponse(res, { avatar_url: user.avatar_url }, 'Telegram avatar synchronized');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async updateAvatar(req, res) {
    try {
      const { avatarUrl } = req.body;
      if (!avatarUrl) {
        return errorResponse(res, ERROR_CODES.BAD_REQUEST, 'avatarUrl is required', 400);
      }
      const user = await userRepo.updateUserAvatar(req.user.userId, avatarUrl);
      return successResponse(res, { avatar_url: user.avatar_url }, 'Avatar updated successfully');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  }
};
