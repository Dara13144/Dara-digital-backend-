import { adminRepo } from '../repositories/adminRepo.js';
import { productRepo } from '../repositories/productRepo.js';
import { categoryRepo } from '../repositories/categoryRepo.js';
import { stockRepo } from '../repositories/stockRepo.js';
import { orderRepo } from '../repositories/orderRepo.js';
import { paymentRepo } from '../repositories/paymentRepo.js';
import { userRepo } from '../repositories/userRepo.js';
import { couponRepo } from '../repositories/couponRepo.js';
import { walletRepo } from '../repositories/walletRepo.js';
import { paymentService } from '../services/paymentService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export const adminController = {
  // --------------------------------------------------------------------------
  // Dashboard & Metrics
  // --------------------------------------------------------------------------
  async getDashboard(req, res) {
    try {
      const stats = await adminRepo.getDashboardStats();
      return successResponse(res, stats, 'Admin dashboard metrics retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  // --------------------------------------------------------------------------
  // Products Management
  // --------------------------------------------------------------------------
  async getProducts(req, res) {
    try {
      const { search, categoryId, page = 1, limit = 50 } = req.query;
      const result = await productRepo.getProducts({
        search,
        categoryId,
        publishedOnly: false,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      });
      return successResponse(res, result, 'Admin products retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async createProduct(req, res) {
    try {
      const product = await productRepo.create(req.body);
      await adminRepo.logAdminAction({
        adminId: req.user.userId,
        action: 'CREATE_PRODUCT',
        targetType: 'PRODUCT',
        targetId: product.id,
        metadata: { name: product.name, price: product.price },
        req
      });
      return successResponse(res, product, 'Product created successfully', 201);
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  async updateProduct(req, res) {
    try {
      const { id } = req.params;
      let updated = await productRepo.update(id, req.body);
      if (!updated) {
        updated = await productRepo.create({ ...req.body, id });
      }
      if (!updated) {
        return errorResponse(res, ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found', 404);
      }
      await adminRepo.logAdminAction({
        adminId: req.user.userId,
        action: 'UPDATE_PRODUCT',
        targetType: 'PRODUCT',
        targetId: id,
        metadata: req.body,
        req
      });
      return successResponse(res, updated, 'Product updated successfully');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  async deleteProduct(req, res) {
    try {
      const { id } = req.params;
      const deleted = await productRepo.delete(id);
      if (!deleted) {
        return errorResponse(res, ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found', 404);
      }
      await adminRepo.logAdminAction({
        adminId: req.user?.userId || req.user?.id || 'admin',
        action: 'DELETE_PRODUCT',
        targetType: 'PRODUCT',
        targetId: id,
        req
      });
      return successResponse(res, { deleted: true }, 'Product deleted');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  // --------------------------------------------------------------------------
  // Stock Inventory Management
  // --------------------------------------------------------------------------
  async getProductStock(req, res) {
    try {
      const { productId } = req.params;
      const { status, page = 1, limit = 50 } = req.query;
      const result = await stockRepo.getStockItemsByProduct(productId, {
        status,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      });
      return successResponse(res, result, 'Stock items retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async addStockItem(req, res) {
    try {
      const { productId, stockType, payload } = req.body;
      const item = await stockRepo.addStockItem({ productId, stockType, payload });
      await adminRepo.logAdminAction({
        adminId: req.user.userId,
        action: 'ADD_STOCK',
        targetType: 'STOCK_ITEM',
        targetId: item.id,
        metadata: { productId, stockType },
        req
      });
      return successResponse(res, item, 'Stock item added successfully', 201);
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  async bulkAddStock(req, res) {
    try {
      const { productId, stockType, lines } = req.body;
      const result = await stockRepo.bulkAddStock(productId, stockType, lines);
      await adminRepo.logAdminAction({
        adminId: req.user.userId,
        action: 'BULK_ADD_STOCK',
        targetType: 'PRODUCT',
        targetId: productId,
        metadata: { inserted: result.inserted, duplicates: result.duplicates },
        req
      });
      return successResponse(res, result, `Successfully added ${result.inserted} stock items.`);
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  async deleteStockItem(req, res) {
    try {
      const { id } = req.params;
      await stockRepo.deleteStockItem(id);
      await adminRepo.logAdminAction({
        adminId: req.user.userId,
        action: 'DELETE_STOCK',
        targetType: 'STOCK_ITEM',
        targetId: id,
        req
      });
      return successResponse(res, { deleted: true }, 'Stock item removed');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  // --------------------------------------------------------------------------
  // Orders Management & Stock Error Recovery
  // --------------------------------------------------------------------------
  async getOrders(req, res) {
    try {
      const { status, search, page = 1, limit = 20 } = req.query;
      const result = await orderRepo.getAllOrders({
        status,
        search,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      });
      return successResponse(res, result, 'Orders retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async getOrderDetail(req, res) {
    try {
      const { id } = req.params;
      const order = await orderRepo.findById(id);
      if (!order) {
        return errorResponse(res, ERROR_CODES.RESOURCE_NOT_FOUND, 'Order not found', 404);
      }
      return successResponse(res, order, 'Order detail retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async retryOrderDelivery(req, res) {
    try {
      const { id } = req.params;
      const payment = await paymentRepo.findByOrderId(id);
      const result = await paymentService.fulfillPaidOrder(id, payment?.id);
      await adminRepo.logAdminAction({
        adminId: req.user.userId,
        action: 'RETRY_ORDER_DELIVERY',
        targetType: 'ORDER',
        targetId: id,
        metadata: { success: result.success },
        req
      });
      return successResponse(res, result, 'Delivery retry attempted');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  async updateOrderStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, adminNotes } = req.body;
      const updated = await orderRepo.updateOrderStatus(id, status, adminNotes);
      await adminRepo.logAdminAction({
        adminId: req.user.userId,
        action: 'UPDATE_ORDER_STATUS',
        targetType: 'ORDER',
        targetId: id,
        metadata: { newStatus: status, adminNotes },
        req
      });
      return successResponse(res, updated, 'Order status updated');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  // --------------------------------------------------------------------------
  // Payments
  // --------------------------------------------------------------------------
  async getPayments(req, res) {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const result = await paymentRepo.getAllPayments({
        status,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      });
      return successResponse(res, result, 'Payments retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  // --------------------------------------------------------------------------
  // Users & Wallets
  // --------------------------------------------------------------------------
  async getUsers(req, res) {
    try {
      const { search, status, page = 1, limit = 20 } = req.query;
      const result = await userRepo.getAllUsers({
        search,
        status,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      });
      return successResponse(res, result, 'Users retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const user = await userRepo.updateUserStatus(id, status);
      await adminRepo.logAdminAction({
        adminId: req.user.userId,
        action: 'UPDATE_USER_STATUS',
        targetType: 'USER',
        targetId: id,
        metadata: { newStatus: status },
        req
      });
      return successResponse(res, user, 'User status updated');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  async adjustUserBalance(req, res) {
    try {
      const { userId, amount, type, description } = req.body;
      const tx = await walletRepo.adjustBalance({
        userId,
        amount: type === 'ADMIN_DEBIT' ? -Math.abs(amount) : Math.abs(amount),
        type,
        description: description || 'Admin balance adjustment',
        createdBy: req.user.userId
      });

      await adminRepo.logAdminAction({
        adminId: req.user.userId,
        action: 'ADJUST_USER_BALANCE',
        targetType: 'WALLET',
        targetId: userId,
        metadata: { amount, type, description },
        req
      });

      return successResponse(res, tx, 'Balance adjusted successfully');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  // --------------------------------------------------------------------------
  // Categories
  // --------------------------------------------------------------------------
  async createCategory(req, res) {
    try {
      const category = await categoryRepo.create(req.body);
      return successResponse(res, category, 'Category created', 201);
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  async updateCategory(req, res) {
    try {
      const { id } = req.params;
      const updated = await categoryRepo.update(id, req.body);
      return successResponse(res, updated, 'Category updated');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  async deleteCategory(req, res) {
    try {
      const { id } = req.params;
      await categoryRepo.delete(id);
      return successResponse(res, { deleted: true }, 'Category deleted');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  // --------------------------------------------------------------------------
  // Coupons
  // --------------------------------------------------------------------------
  async getCoupons(req, res) {
    try {
      const coupons = await couponRepo.getAllCoupons();
      return successResponse(res, coupons, 'Coupons retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async createCoupon(req, res) {
    try {
      const coupon = await couponRepo.create(req.body);
      return successResponse(res, coupon, 'Coupon created', 201);
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  async updateCoupon(req, res) {
    try {
      const { id } = req.params;
      const updated = await couponRepo.update(id, req.body);
      return successResponse(res, updated, 'Coupon updated');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  async deleteCoupon(req, res) {
    try {
      const { id } = req.params;
      await couponRepo.delete(id);
      return successResponse(res, { deleted: true }, 'Coupon deleted');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  // --------------------------------------------------------------------------
  // Settings & Logs
  // --------------------------------------------------------------------------
  async getSettings(req, res) {
    try {
      const settings = await adminRepo.getSettings();
      return successResponse(res, settings, 'Settings retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async updateSettings(req, res) {
    try {
      const settings = await adminRepo.updateSettings(req.body, req.user.userId, req);
      return successResponse(res, settings, 'Settings updated');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  async getLogs(req, res) {
    try {
      const { page = 1, limit = 50 } = req.query;
      const logs = await adminRepo.getAdminLogs({
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      });
      return successResponse(res, logs, 'Admin audit logs retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  }
};
