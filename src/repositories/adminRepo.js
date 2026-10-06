import { v4 as uuidv4 } from 'uuid';
import { memoryStore } from './storeMemory.js';
import { ORDER_STATUS, PAYMENT_STATUS, STOCK_STATUS } from '../constants/states.js';
import { dbPool } from '../config/db.js';
import { logger } from '../config/logger.js';

export const adminRepo = {
  /**
   * Aggregate Dashboard Statistics
   */
  async getDashboardStats() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const totalUsers = memoryStore.users.length;
    const todayUsers = memoryStore.users.filter((u) => u.created_at >= startOfToday).length;

    const totalOrders = memoryStore.orders.length;
    const todayOrders = memoryStore.orders.filter((o) => o.created_at >= startOfToday).length;

    const completedOrders = memoryStore.orders.filter((o) => o.status === ORDER_STATUS.COMPLETED);
    const todayCompletedOrders = completedOrders.filter((o) => o.created_at >= startOfToday);

    const totalRevenue = completedOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
    const todayRevenue = todayCompletedOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);

    const pendingPayments = memoryStore.payments.filter((p) => p.status === PAYMENT_STATUS.PENDING).length;
    const failedPayments = memoryStore.payments.filter((p) => p.status === PAYMENT_STATUS.FAILED).length;

    const lowStockThreshold = Number(memoryStore.settings.low_stock_threshold || 3);

    // Calculate product stock status
    const productStats = memoryStore.products.map((p) => {
      const available = memoryStore.stock_items.filter(
        (s) => s.product_id === p.id && s.status === STOCK_STATUS.AVAILABLE
      ).length;
      return {
        id: p.id,
        name: p.name,
        available
      };
    });

    const lowStockProducts = productStats.filter((p) => p.available > 0 && p.available <= lowStockThreshold);
    const outOfStockProducts = productStats.filter((p) => p.available === 0);

    // Chart Data: Last 7 Days Revenue & Orders
    const chartDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);

      const dayOrders = memoryStore.orders.filter((o) => o.created_at.startsWith(dateStr));
      const dayCompleted = dayOrders.filter((o) => o.status === ORDER_STATUS.COMPLETED);
      const dayRev = dayCompleted.reduce((sum, o) => sum + Number(o.total_amount), 0);

      chartDays.push({
        date: dateStr,
        label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
        orders: dayOrders.length,
        revenue: Number(dayRev.toFixed(2))
      });
    }

    return {
      overview: {
        totalUsers,
        todayUsers,
        totalOrders,
        todayOrders,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        todayRevenue: Number(todayRevenue.toFixed(2)),
        completedOrdersCount: completedOrders.length,
        pendingPaymentsCount: pendingPayments,
        failedPaymentsCount: failedPayments,
        totalProductsCount: memoryStore.products.length,
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockProducts.length
      },
      lowStockProducts,
      outOfStockProducts,
      chartDays,
      recentOrders: memoryStore.orders.slice(0, 10).map((o) => {
        const user = memoryStore.users.find((u) => u.id === o.user_id);
        return {
          ...o,
          customer_name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username : 'Guest'
        };
      })
    };
  },

  /**
   * Log Admin Actions for Compliance and Audit Trails
   */
  async logAdminAction({ adminId, action, targetType, targetId, metadata = {}, req = null }) {
    const entry = {
      id: uuidv4(),
      admin_id: adminId || null,
      action,
      target_type: targetType,
      target_id: String(targetId),
      metadata,
      ip_address: req ? req.ip || req.connection?.remoteAddress : null,
      user_agent: req ? req.headers['user-agent'] : null,
      created_at: new Date().toISOString()
    };

    memoryStore.admin_logs.unshift(entry);
    return entry;
  },

  async getAdminLogs({ page = 1, limit = 50 } = {}) {
    const total = memoryStore.admin_logs.length;
    const items = memoryStore.admin_logs.slice((page - 1) * limit, page * limit);
    return { items, total, page, limit };
  },

  async getSettings() {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query('SELECT key, value FROM settings');
        for (const row of rows) {
          memoryStore.settings[row.key] = row.value;
        }
      } catch (err) {
        logger.warn('Failed to load settings from dbPool:', err.message);
      }
    }
    return memoryStore.settings;
  },

  async updateSettings(newSettings, adminId, req) {
    Object.assign(memoryStore.settings, newSettings);
    if (dbPool) {
      try {
        for (const [key, val] of Object.entries(newSettings)) {
          await dbPool.query(
            `INSERT INTO settings (key, value, description)
             VALUES ($1, $2::jsonb, $3)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
            [key, JSON.stringify(val), `Setting for ${key}`]
          );
        }
      } catch (err) {
        logger.error('Failed to persist settings to PostgreSQL:', err.message);
      }
    }
    await this.logAdminAction({
      adminId,
      action: 'UPDATE_SETTINGS',
      targetType: 'SETTINGS',
      targetId: 'GLOBAL',
      metadata: newSettings,
      req
    });
    return memoryStore.settings;
  }
};
