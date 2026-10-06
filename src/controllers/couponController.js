import { couponService } from '../services/couponService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export const couponController = {
  async validateCoupon(req, res) {
    try {
      const { code, subtotal } = req.body;
      const userId = req.user?.userId || null;

      if (!code) {
        return errorResponse(res, ERROR_CODES.BAD_REQUEST, 'Coupon code is required', 400);
      }

      const result = await couponService.validateCoupon(code, userId, subtotal || 0);
      return successResponse(res, result, 'Coupon applied successfully');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.COUPON_INVALID, err.message, 400);
    }
  }
};
