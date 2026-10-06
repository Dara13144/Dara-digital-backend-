import { productRepo } from '../repositories/productRepo.js';
import { orderRepo } from '../repositories/orderRepo.js';
import { stockRepo } from '../repositories/stockRepo.js';
import { couponService } from './couponService.js';
import { adminRepo } from '../repositories/adminRepo.js';
import { ORDER_STATUS } from '../constants/states.js';
import { logger } from '../config/logger.js';

export const orderService = {
  /**
   * Recalculate and validate raw cart from client (Server Source of Truth)
   */
  async calculateCart(cartItems, couponCode = null, userId = null) {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      throw new Error('Cart is empty.');
    }

    const validatedItems = [];
    let subtotal = 0;

    for (const item of cartItems) {
      const product = await productRepo.findById(item.productId || item.product_id);
      if (!product) {
        throw new Error(`Product not found (ID: ${item.productId || item.product_id})`);
      }

      if (!product.published || product.status !== 'published') {
        throw new Error(`Product "${product.name}" is no longer available.`);
      }

      const qty = Math.max(1, parseInt(item.quantity || 1, 10));
      const availableStock = await stockRepo.getAvailableCount(product.id);

      if (['code', 'account', 'link', 'text', 'file'].includes(product.stock_type)) {
        if (availableStock < qty) {
          throw new Error(
            `INSUFFICIENT_STOCK: Only ${availableStock} item(s) available for "${product.name}". You requested ${qty}.`
          );
        }
      }

      const unitPrice = Number(product.price || 0);
      const itemTotal = Number((unitPrice * qty).toFixed(2));

      subtotal += itemTotal;

      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        stock_type: product.stock_type,
        unit_price: unitPrice,
        quantity: qty,
        total_price: itemTotal,
        image_url: product.images?.[0] || null,
        available_stock: availableStock
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    let discountAmount = 0;
    let coupon = null;

    if (couponCode) {
      try {
        const couponResult = await couponService.validateCoupon(couponCode, userId, subtotal);
        discountAmount = couponResult.discountAmount;
        coupon = couponResult.coupon;
      } catch (err) {
        logger.warn(`Coupon validation warning for code ${couponCode}:`, err.message);
        throw err;
      }
    }

    const totalAmount = Number(Math.max(0, subtotal - discountAmount).toFixed(2));

    return {
      items: validatedItems,
      subtotal,
      discountAmount,
      coupon,
      totalAmount,
      currency: 'USD'
    };
  },

  /**
   * Checkout: Create pending Order
   */
  async checkoutOrder({ userId, items, couponCode = null, paymentMethod = 'aba_payway', customerNotes = null }) {
    const settings = await adminRepo.getSettings();
    const minAmount = Number(settings.min_order_amount || 1.00);
    const maxAmount = Number(settings.max_order_amount || 2000.00);

    const calculated = await this.calculateCart(items, couponCode, userId);

    if (calculated.totalAmount < minAmount) {
      throw new Error(`MIN_ORDER_AMOUNT: Minimum checkout order amount is $${minAmount.toFixed(2)}.`);
    }

    if (calculated.totalAmount > maxAmount) {
      throw new Error(`MAX_ORDER_AMOUNT: Maximum checkout order amount is $${maxAmount.toFixed(2)}.`);
    }

    const order = await orderRepo.createOrder({
      userId,
      subtotal: calculated.subtotal,
      discountAmount: calculated.discountAmount,
      couponId: calculated.coupon?.id || null,
      totalAmount: calculated.totalAmount,
      currency: calculated.currency,
      paymentMethod,
      customerNotes,
      items: calculated.items
    });

    logger.info(`Order #${order.order_number} created for User ${userId}. Total: $${order.total_amount}`);
    return order;
  },

  async getOrder(orderId, userId, isAdmin = false) {
    const order = await orderRepo.findById(orderId);
    if (!order) {
      throw new Error('ORDER_NOT_FOUND: Order does not exist.');
    }

    if (!isAdmin && order.user_id !== userId) {
      throw new Error('FORBIDDEN: You do not have permission to view this order.');
    }

    return order;
  },

  async getUserOrders(userId, query) {
    return orderRepo.getOrdersByUser(userId, query);
  }
};
