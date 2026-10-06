import { deliveryRepo } from '../repositories/deliveryRepo.js';
import { orderRepo } from '../repositories/orderRepo.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export const deliveryController = {
  /**
   * Get digital deliveries for an order (Security: only owner or admin can view)
   */
  async getOrderDeliveries(req, res) {
    try {
      const { orderId } = req.params;
      const userId = req.user.userId;
      const isAdmin = req.user.roles?.some((r) => ['ADMIN', 'SUPER_ADMIN', 'STAFF'].includes(r));

      const order = await orderRepo.findById(orderId);
      if (!order) {
        return errorResponse(res, ERROR_CODES.RESOURCE_NOT_FOUND, 'Order not found', 404);
      }

      if (!isAdmin && order.user_id !== userId) {
        return errorResponse(res, ERROR_CODES.FORBIDDEN, 'Access denied', 403);
      }

      if (order.status !== 'COMPLETED' && !isAdmin) {
        return errorResponse(
          res,
          ERROR_CODES.INVALID_ORDER_STATE,
          'Deliveries are available only after successful payment completion.',
          400
        );
      }

      const deliveries = await deliveryRepo.getDeliveriesByOrder(orderId);
      return successResponse(res, deliveries, 'Deliveries retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  /**
   * Get all digital items purchased by user
   */
  async getMyPurchasedProducts(req, res) {
    try {
      const userId = req.user.userId;
      const deliveries = await deliveryRepo.getDeliveriesByUser(userId);
      return successResponse(res, deliveries, 'Purchased items retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  }
};
