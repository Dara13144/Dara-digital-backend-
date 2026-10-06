import { orderService } from '../services/orderService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export const orderController = {
  /**
   * Recalculate cart totals (source of truth)
   */
  async calculateCart(req, res) {
    try {
      const { items, couponCode } = req.body;
      const userId = req.user?.userId || null;
      const calculated = await orderService.calculateCart(items, couponCode, userId);
      return successResponse(res, calculated, 'Cart calculated');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  /**
   * Create Checkout Order
   */
  async checkout(req, res) {
    try {
      const { items, couponCode, paymentMethod, customerNotes } = req.body;
      const userId = req.user.userId;

      const order = await orderService.checkoutOrder({
        userId,
        items,
        couponCode,
        paymentMethod,
        customerNotes
      });

      return successResponse(res, order, 'Order created successfully', 201);
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  /**
   * Get Single Order Details
   */
  async getOrder(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const isAdmin = req.user.roles?.some((r) => ['ADMIN', 'SUPER_ADMIN', 'STAFF'].includes(r));

      const order = await orderService.getOrder(id, userId, isAdmin);
      return successResponse(res, order, 'Order retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.ORDER_NOT_FOUND, err.message, 404);
    }
  },

  /**
   * Get User Orders List
   */
  async getUserOrders(req, res) {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 20 } = req.query;

      const result = await orderService.getUserOrders(userId, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      });

      return successResponse(res, result, 'User orders retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  }
};
