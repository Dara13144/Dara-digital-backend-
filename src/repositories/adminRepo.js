import { v4 as uuidv4 } from 'uuid';
import { memoryStore } from './storeMemory.js';
import { ORDER_STATUS, PAYMENT_STATUS, STOCK_STATUS } from '../constants/states.js';
import { dbPool } from '../config/db.js';
import { logger } from '../config/logger.js';

export const adminRepo = {
  /**
   * Aggregate Dashboard Statistics from live Supabase PostgreSQL
   */
  async getDashboardStats() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    if (dbPool) {
      try {
        // 1. User metrics
        const userRes = await dbPool.query(`
          SELECT 
            count(*)::int as total_users,
            count(*) FILTER (WHERE created_at >= $1)::int as today_users
          FROM users
        `, [startOfToday]);
        const totalUsers = userRes.rows[0]?.total_users || 0;
        const todayUsers = userRes.rows[0]?.today_users || 0;

        // 2. Order & Revenue metrics
        const orderRes = await dbPool.query(`
          SELECT 
            count(*)::int as total_orders,
            count(*) FILTER (WHERE created_at >= $1)::int as today_orders,
            count(*) FILTER (WHERE status = 'COMPLETED')::int as completed_orders,
            COALESCE(SUM(total_amount) FILTER (WHERE status = 'COMPLETED'), 0)::float as total_revenue,
            COALESCE(SUM(total_amount) FILTER (WHERE status = 'COMPLETED' AND created_at >= $1), 0)::float as today_revenue
          FROM orders
        `, [startOfToday]);
        const totalOrders = orderRes.rows[0]?.total_orders || 0;
        const todayOrders = orderRes.rows[0]?.today_orders || 0;
        const completedOrdersCount = orderRes.rows[0]?.completed_orders || 0;
        const totalRevenue = orderRes.rows[0]?.total_revenue || 0.00;
        const todayRevenue = orderRes.rows[0]?.today_revenue || 0.00;

        // 3. Payment metrics
        const paymentRes = await dbPool.query(`
          SELECT 
            count(*) FILTER (WHERE status = 'PENDING')::int as pending_payments,
            count(*) FILTER (WHERE status = 'FAILED')::int as failed_payments
          FROM payments
        `);
        const pendingPaymentsCount = paymentRes.rows[0]?.pending_payments || 0;
        const failedPaymentsCount = paymentRes.rows[0]?.failed_payments || 0;

        // 4. Products & Stock metrics
        const lowStockThreshold = Number(memoryStore.settings.low_stock_threshold || 3);
        const prodRes = await dbPool.query(`
          SELECT 
            p.id, 
            p.name,
            COALESCE((
              SELECT count(*)::int 
              FROM stock_items s 
              WHERE s.product_id = p.id AND s.status = 'available'
            ), 0) as available
          FROM products p
        `);
        const productStats = prodRes.rows;
        const lowStockProducts = productStats.filter((p) => p.available > 0 && p.available <= lowStockThreshold);
        const outOfStockProducts = productStats.filter((p) => p.available === 0);

        // 5. Chart Data: Last 7 Days Revenue & Orders
        const chartRes = await dbPool.query(`
          SELECT 
            TO_CHAR(d::date, 'YYYY-MM-DD') as date_str,
            TO_CHAR(d::date, 'Dy, Mon DD') as label,
            COALESCE(count(o.id), 0)::int as orders,
            COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'COMPLETED'), 0)::float as revenue
          FROM generate_series(
            CURRENT_DATE - INTERVAL '6 days',
            CURRENT_DATE,
            '1 day'::interval
          ) d
          LEFT JOIN orders o ON DATE(o.created_at) = d::date
          GROUP BY d::date
          ORDER BY d::date ASC
        `);
        const chartDays = chartRes.rows.map(r => ({
          date: r.date_str,
          label: r.label,
          orders: r.orders,
          revenue: Number(r.revenue.toFixed(2))
        }));

        // 6. Recent Orders
        const recentOrdersRes = await dbPool.query(`
          SELECT 
            o.*,
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.username, 'Guest') as customer_name
          FROM orders o
          LEFT JOIN users u ON o.user_id = u.id
          ORDER BY o.created_at DESC
          LIMIT 10
        `);

        return {
          overview: {
            totalUsers,
            todayUsers,
            totalOrders,
            todayOrders,
            totalRevenue: Number(totalRevenue.toFixed(2)),
            todayRevenue: Number(todayRevenue.toFixed(2)),
            completedOrdersCount,
            pendingPaymentsCount,
            failedPaymentsCount,
            totalProductsCount: productStats.length,
            lowStockCount: lowStockProducts.length,
            outOfStockCount: outOfStockProducts.length
          },
          lowStockProducts,
          outOfStockProducts,
          chartDays,
          recentOrders: recentOrdersRes.rows
        };
      } catch (err) {
        logger.warn('dbPool getDashboardStats error, falling back to memoryStore:', err.message);
      }
    }

    // Fallback to memoryStore
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

    if (dbPool) {
      try {
        await dbPool.query(
          `INSERT INTO admin_logs (id, admin_id, action, target_type, target_id, metadata, ip_address, user_agent, created_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW())`,
          [
            entry.id, entry.admin_id, entry.action, entry.target_type,
            entry.target_id, JSON.stringify(metadata), entry.ip_address,
            entry.user_agent
          ]
        );
      } catch (err) {
        logger.debug('dbPool logAdminAction error:', err.message);
      }
    }

    memoryStore.admin_logs.unshift(entry);
    return entry;
  },

  async getAdminLogs({ page = 1, limit = 50 } = {}) {
    if (dbPool) {
      try {
        const countRes = await dbPool.query('SELECT count(*)::int as count FROM admin_logs');
        const total = countRes.rows[0]?.count || 0;
        const offset = (page - 1) * limit;

        const { rows } = await dbPool.query(`
          SELECT 
            al.*,
            u.username as admin_username,
            u.first_name as admin_first_name
          FROM admin_logs al
          LEFT JOIN users u ON al.admin_id = u.id
          ORDER BY al.created_at DESC
          LIMIT $1 OFFSET $2
        `, [limit, offset]);

        return { items: rows, total, page, limit };
      } catch (err) {
        logger.debug('dbPool getAdminLogs error, falling back:', err.message);
      }
    }

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
