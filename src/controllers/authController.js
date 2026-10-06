import { authService } from '../services/authService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export const authController = {
  /**
   * Telegram WebApp Authentication
   */
  async telegramAuth(req, res) {
    try {
      const { initData } = req.body;
      if (!initData) {
        return errorResponse(res, ERROR_CODES.BAD_REQUEST, 'initData is required for Telegram login.', 400);
      }

      const result = await authService.authenticateTelegram(initData);
      return successResponse(res, result, 'Telegram authentication successful');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.TELEGRAM_AUTH_FAILED, err.message, 401);
    }
  },

  /**
   * Direct Mock Login (For browser dev testing)
   */
  async mockLogin(req, res) {
    try {
      const { telegramId, username, firstName } = req.body;
      const result = await authService.mockLogin({ telegramId, username, firstName });
      return successResponse(res, result, 'Logged in with test credentials');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.UNAUTHORIZED, err.message, 401);
    }
  },

  /**
   * Google OAuth Sign-in for Admin Portal
   */
  async googleAuth(req, res) {
    try {
      const { credential, email, name, picture, sub, accessToken } = req.body;
      const result = await authService.authenticateGoogle({
        credential,
        email,
        name,
        picture,
        sub,
        accessToken
      });
      return successResponse(res, result, 'Google Admin authentication successful');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.UNAUTHORIZED, err.message, 401);
    }
  }
};
