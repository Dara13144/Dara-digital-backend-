import { v4 as uuidv4 } from 'uuid';
import { memoryStore } from './storeMemory.js';

export const couponRepo = {
  async findByCode(code) {
    if (!code) return null;
    return (
      memoryStore.coupons.find(
        (c) => c.code.trim().toUpperCase() === code.trim().toUpperCase()
      ) || null
    );
  },

  async findById(id) {
    return memoryStore.coupons.find((c) => c.id === id) || null;
  },

  async getAllCoupons() {
    return [...memoryStore.coupons].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
  },

  async create(data) {
    const existing = await this.findByCode(data.code);
    if (existing) {
      throw new Error('COUPON_ALREADY_EXISTS: Coupon code already exists.');
    }

    const coupon = {
      id: uuidv4(),
      code: data.code.trim().toUpperCase(),
      description: data.description || '',
      discount_type: data.discount_type || 'percentage',
      discount_value: Number(data.discount_value),
      minimum_amount: Number(data.minimum_amount || 0),
      maximum_discount: data.maximum_discount ? Number(data.maximum_discount) : null,
      usage_limit: data.usage_limit ? Number(data.usage_limit) : null,
      used_count: 0,
      per_user_limit: Number(data.per_user_limit || 1),
      active: data.active !== undefined ? Boolean(data.active) : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    memoryStore.coupons.push(coupon);
    return coupon;
  },

  async update(id, data) {
    const coupon = memoryStore.coupons.find((c) => c.id === id);
    if (!coupon) return null;

    Object.assign(coupon, {
      ...data,
      code: data.code ? data.code.trim().toUpperCase() : coupon.code,
      discount_value: data.discount_value !== undefined ? Number(data.discount_value) : coupon.discount_value,
      minimum_amount: data.minimum_amount !== undefined ? Number(data.minimum_amount) : coupon.minimum_amount,
      maximum_discount: data.maximum_discount !== undefined ? (data.maximum_discount ? Number(data.maximum_discount) : null) : coupon.maximum_discount,
      updated_at: new Date().toISOString()
    });

    return coupon;
  },

  async delete(id) {
    const index = memoryStore.coupons.findIndex((c) => c.id === id);
    if (index === -1) return false;
    memoryStore.coupons.splice(index, 1);
    return true;
  },

  async recordUsage(couponId, userId, orderId, discountApplied) {
    const coupon = memoryStore.coupons.find((c) => c.id === couponId);
    if (coupon) {
      coupon.used_count = (coupon.used_count || 0) + 1;
    }

    const usage = {
      id: uuidv4(),
      coupon_id: couponId,
      user_id: userId,
      order_id: orderId,
      discount_applied: Number(discountApplied),
      created_at: new Date().toISOString()
    };

    memoryStore.coupon_usages.push(usage);
    return usage;
  },

  async getUserUsageCount(couponId, userId) {
    return memoryStore.coupon_usages.filter(
      (u) => u.coupon_id === couponId && u.user_id === userId
    ).length;
  }
};
