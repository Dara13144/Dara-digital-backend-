import { v4 as uuidv4 } from 'uuid';
import { memoryStore } from './storeMemory.js';
import { dbPool } from '../config/db.js';
import { logger } from '../config/logger.js';

export const couponRepo = {
  async findByCode(code) {
    if (!code) return null;
    const cleanCode = code.trim().toUpperCase();

    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          'SELECT * FROM coupons WHERE UPPER(code) = $1 LIMIT 1',
          [cleanCode]
        );
        if (rows.length > 0) return rows[0];
      } catch (err) {
        logger.debug('dbPool findByCode error, falling back:', err.message);
      }
    }

    return (
      memoryStore.coupons.find(
        (c) => c.code.trim().toUpperCase() === cleanCode
      ) || null
    );
  },

  async findById(id) {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          'SELECT * FROM coupons WHERE id = $1 LIMIT 1',
          [id]
        );
        if (rows.length > 0) return rows[0];
      } catch (err) {
        logger.debug('dbPool findById error, falling back:', err.message);
      }
    }

    return memoryStore.coupons.find((c) => c.id === id) || null;
  },

  async getAllCoupons() {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          'SELECT * FROM coupons ORDER BY created_at DESC'
        );
        if (rows.length > 0) return rows;
      } catch (err) {
        logger.debug('dbPool getAllCoupons error, falling back:', err.message);
      }
    }

    return [...memoryStore.coupons].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
  },

  async create(data) {
    const cleanCode = data.code.trim().toUpperCase();
    const existing = await this.findByCode(cleanCode);
    if (existing) {
      throw new Error('COUPON_ALREADY_EXISTS: Coupon code already exists.');
    }

    const couponId = uuidv4();
    const discountType = data.discount_type || 'percentage';
    const discountVal = Number(data.discount_value);
    const minAmount = Number(data.minimum_amount || 0);
    const maxDiscount = data.maximum_discount ? Number(data.maximum_discount) : null;
    const usageLimit = data.usage_limit ? Number(data.usage_limit) : null;
    const perUserLimit = Number(data.per_user_limit || 1);
    const active = data.active !== undefined ? Boolean(data.active) : true;

    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          `INSERT INTO coupons (
            id, code, description, discount_type, discount_value,
            minimum_amount, maximum_discount, usage_limit, used_count,
            per_user_limit, active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10)
          RETURNING *`,
          [
            couponId, cleanCode, data.description || '', discountType,
            discountVal, minAmount, maxDiscount, usageLimit,
            perUserLimit, active
          ]
        );

        if (rows.length > 0) {
          const c = rows[0];
          memoryStore.coupons.unshift(c);
          return c;
        }
      } catch (err) {
        logger.warn('dbPool create coupon error, falling back:', err.message);
      }
    }

    const coupon = {
      id: couponId,
      code: cleanCode,
      description: data.description || '',
      discount_type: discountType,
      discount_value: discountVal,
      minimum_amount: minAmount,
      maximum_discount: maxDiscount,
      usage_limit: usageLimit,
      used_count: 0,
      per_user_limit: perUserLimit,
      active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    memoryStore.coupons.push(coupon);
    return coupon;
  },

  async update(id, data) {
    const cleanCode = data.code ? data.code.trim().toUpperCase() : undefined;

    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          `UPDATE coupons
           SET code = COALESCE($2, code),
               description = COALESCE($3, description),
               discount_type = COALESCE($4, discount_type),
               discount_value = COALESCE($5, discount_value),
               minimum_amount = COALESCE($6, minimum_amount),
               maximum_discount = $7,
               usage_limit = $8,
               per_user_limit = COALESCE($9, per_user_limit),
               active = COALESCE($10, active),
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [
            id, cleanCode, data.description, data.discount_type,
            data.discount_value !== undefined ? Number(data.discount_value) : null,
            data.minimum_amount !== undefined ? Number(data.minimum_amount) : null,
            data.maximum_discount !== undefined ? (data.maximum_discount ? Number(data.maximum_discount) : null) : null,
            data.usage_limit !== undefined ? (data.usage_limit ? Number(data.usage_limit) : null) : null,
            data.per_user_limit !== undefined ? Number(data.per_user_limit) : null,
            data.active !== undefined ? Boolean(data.active) : null
          ]
        );

        if (rows.length > 0) {
          const c = rows[0];
          const idx = memoryStore.coupons.findIndex((mem) => mem.id === id);
          if (idx !== -1) memoryStore.coupons[idx] = c;
          return c;
        }
      } catch (err) {
        logger.warn('dbPool update coupon error, falling back:', err.message);
      }
    }

    const coupon = memoryStore.coupons.find((c) => c.id === id);
    if (!coupon) return null;

    Object.assign(coupon, {
      ...data,
      code: cleanCode || coupon.code,
      discount_value: data.discount_value !== undefined ? Number(data.discount_value) : coupon.discount_value,
      minimum_amount: data.minimum_amount !== undefined ? Number(data.minimum_amount) : coupon.minimum_amount,
      maximum_discount: data.maximum_discount !== undefined ? (data.maximum_discount ? Number(data.maximum_discount) : null) : coupon.maximum_discount,
      updated_at: new Date().toISOString()
    });

    return coupon;
  },

  async delete(id) {
    if (dbPool) {
      try {
        const res = await dbPool.query('DELETE FROM coupons WHERE id = $1', [id]);
        const index = memoryStore.coupons.findIndex((c) => c.id === id);
        if (index !== -1) memoryStore.coupons.splice(index, 1);
        return res.rowCount > 0;
      } catch (err) {
        logger.warn('dbPool delete coupon error, falling back:', err.message);
      }
    }

    const index = memoryStore.coupons.findIndex((c) => c.id === id);
    if (index === -1) return false;
    memoryStore.coupons.splice(index, 1);
    return true;
  },

  async recordUsage(couponId, userId, orderId, discountApplied) {
    if (dbPool) {
      try {
        await dbPool.query(
          'UPDATE coupons SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1',
          [couponId]
        );
        const usageId = uuidv4();
        await dbPool.query(
          `INSERT INTO coupon_usages (id, coupon_id, user_id, order_id, discount_applied, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [usageId, couponId, userId, orderId, Number(discountApplied)]
        );
      } catch (err) {
        logger.warn('dbPool recordUsage error, falling back:', err.message);
      }
    }

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
    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          'SELECT count(*)::int as count FROM coupon_usages WHERE coupon_id = $1 AND user_id = $2',
          [couponId, userId]
        );
        return rows[0]?.count ?? 0;
      } catch (err) {
        logger.debug('dbPool getUserUsageCount error, falling back:', err.message);
      }
    }

    return memoryStore.coupon_usages.filter(
      (u) => u.coupon_id === couponId && u.user_id === userId
    ).length;
  }
};
