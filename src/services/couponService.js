import { couponRepo } from '../repositories/couponRepo.js';

export const couponService = {
  /**
   * Validate Coupon applicability for a user and cart subtotal
   */
  async validateCoupon(code, userId, subtotal) {
    if (!code) {
      throw new Error('Coupon code is required.');
    }

    const coupon = await couponRepo.findByCode(code);
    if (!coupon) {
      throw new Error('COUPON_INVALID: Invalid coupon code.');
    }

    if (!coupon.active) {
      throw new Error('COUPON_INACTIVE: This coupon is currently inactive.');
    }

    // Check expiration
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      throw new Error('COUPON_EXPIRED: This coupon has expired.');
    }

    // Check total usage limit
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      throw new Error('COUPON_LIMIT_REACHED: This coupon usage limit has been reached.');
    }

    // Check per-user limit
    if (userId && coupon.per_user_limit) {
      const userUsage = await couponRepo.getUserUsageCount(coupon.id, userId);
      if (userUsage >= coupon.per_user_limit) {
        throw new Error(`COUPON_USER_LIMIT: You have already used this coupon ${userUsage} time(s).`);
      }
    }

    // Check minimum cart amount
    const cartAmount = Number(subtotal);
    if (coupon.minimum_amount && cartAmount < Number(coupon.minimum_amount)) {
      throw new Error(`COUPON_MIN_AMOUNT: Minimum order amount of $${coupon.minimum_amount} required for this coupon.`);
    }

    // Calculate discount amount
    let discount = 0;
    if (coupon.discount_type === 'percentage') {
      discount = (cartAmount * Number(coupon.discount_value)) / 100;
      if (coupon.maximum_discount && discount > Number(coupon.maximum_discount)) {
        discount = Number(coupon.maximum_discount);
      }
    } else {
      // Fixed discount
      discount = Number(coupon.discount_value);
    }

    // Cannot exceed cart amount
    discount = Math.min(discount, cartAmount);

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value
      },
      discountAmount: Number(discount.toFixed(2)),
      finalSubtotal: Number((cartAmount - discount).toFixed(2))
    };
  }
};
