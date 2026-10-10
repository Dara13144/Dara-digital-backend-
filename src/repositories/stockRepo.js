import { v4 as uuidv4 } from 'uuid';
import { memoryStore } from './storeMemory.js';
import { sha256 } from '../utils/crypto.js';
import { STOCK_STATUS } from '../constants/states.js';
import { dbPool } from '../config/db.js';
import { logger } from '../config/logger.js';

export const stockRepo = {
  /**
   * Get available stock count for a given product
   */
  async getAvailableCount(productId) {
    if (productId) {
      const prod = memoryStore.products?.find((p) => p.id === productId);
      if (prod) {
        const cat = prod.category_id ? memoryStore.categories?.find((c) => c.id === prod.category_id) : null;
        const nameLower = (prod.name || '').toLowerCase();
        const catSlug = (cat?.slug || prod.category?.slug || '').toLowerCase();
        if (
          prod.stock_type === 'manual' ||
          catSlug === 'gamepass' ||
          catSlug === 'topup' ||
          catSlug === 'robux' ||
          nameLower.includes('gamepass') ||
          nameLower.includes('robux') ||
          nameLower.includes('top-up') ||
          nameLower.includes('topup') ||
          nameLower.includes('r$')
        ) {
          return (prod.stock_quantity && prod.stock_quantity > 0) ? prod.stock_quantity : 9999;
        }
      }
    }

    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          `SELECT 
            CASE 
              WHEN p.stock_type = 'manual' OR c.slug IN ('gamepass', 'topup') OR LOWER(p.name) LIKE '%gamepass%' OR LOWER(p.name) LIKE '%robux%' OR LOWER(p.name) LIKE '%top-up%'
              THEN CASE WHEN COALESCE(p.stock_quantity, 0) > 0 THEN p.stock_quantity ELSE 9999 END
              ELSE COALESCE((
                SELECT count(*)::int 
                FROM stock_items s 
                WHERE s.product_id = p.id AND s.status = 'available'
              ), 0)
            END as count
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           WHERE p.id = $1`,
          [productId]
        );
        if (rows[0] && rows[0].count !== undefined) {
          return rows[0].count;
        }
      } catch (err) {
        logger.debug('dbPool getAvailableCount error, falling back:', err.message);
      }
    }

    return memoryStore.stock_items.filter(
      (s) => s.product_id === productId && s.status === STOCK_STATUS.AVAILABLE
    ).length;
  },

  /**
   * Admin: List stock items with pagination & status filters
   */
  async getStockItemsByProduct(productId, { status, page = 1, limit = 50 } = {}) {
    if (dbPool) {
      try {
        let query = 'SELECT * FROM stock_items WHERE product_id = $1';
        const params = [productId];

        if (status) {
          params.push(status);
          query += ` AND status = $${params.length}`;
        }

        const countQuery = `SELECT count(*)::int as count FROM (${query}) as count_tbl`;
        const countRes = await dbPool.query(countQuery, params);
        const total = countRes.rows[0]?.count || 0;

        const offset = (page - 1) * limit;
        params.push(limit, offset);
        query += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

        const { rows } = await dbPool.query(query, params);
        return { items: rows, total, page, limit };
      } catch (err) {
        logger.debug('dbPool getStockItemsByProduct error, falling back:', err.message);
      }
    }

    let list = memoryStore.stock_items.filter((s) => s.product_id === productId);
    if (status) {
      list = list.filter((s) => s.status === status);
    }
    const total = list.length;
    const items = list.slice((page - 1) * limit, page * limit);
    return { items, total, page, limit };
  },

  /**
   * Admin: Add single stock item with hash deduplication
   */
  async addStockItem({ productId, stockType, payload }) {
    const cleanPayload = String(payload).trim();
    if (!cleanPayload) {
      throw new Error('Payload cannot be empty');
    }
    const stockHash = sha256(cleanPayload);

    if (dbPool) {
      try {
        const check = await dbPool.query(
          'SELECT id FROM stock_items WHERE product_id = $1 AND stock_hash = $2 LIMIT 1',
          [productId, stockHash]
        );
        if (check.rows.length > 0) {
          throw new Error('DUPLICATE_STOCK_HASH: This stock item has already been added to this product.');
        }

        const stockId = uuidv4();
        const { rows } = await dbPool.query(
          `INSERT INTO stock_items (id, product_id, stock_type, payload, stock_hash, status)
           VALUES ($1, $2, $3, $4, $5, 'available')
           RETURNING *`,
          [stockId, productId, stockType, cleanPayload, stockHash]
        );

        if (rows.length > 0) {
          const item = rows[0];
          memoryStore.stock_items.push(item);
          return item;
        }
      } catch (err) {
        if (err.message.includes('DUPLICATE_STOCK_HASH') || err.message.includes('unique_product_stock_hash')) {
          throw new Error('DUPLICATE_STOCK_HASH: This stock item has already been added to this product.');
        }
        logger.warn('dbPool addStockItem error, falling back to memory:', err.message);
      }
    }

    // Duplicate check in memory
    const duplicate = memoryStore.stock_items.find(
      (s) => s.product_id === productId && s.stock_hash === stockHash
    );
    if (duplicate) {
      throw new Error('DUPLICATE_STOCK_HASH: This stock item has already been added to this product.');
    }

    const item = {
      id: uuidv4(),
      product_id: productId,
      stock_type: stockType,
      payload: cleanPayload,
      stock_hash: stockHash,
      status: STOCK_STATUS.AVAILABLE,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    memoryStore.stock_items.push(item);
    return item;
  },

  /**
   * Admin: Bulk upload stock items (e.g. from multiline TXT or CSV)
   */
  async bulkAddStock(productId, stockType, lines) {
    const results = {
      total: lines.length,
      inserted: 0,
      duplicates: 0,
      errors: []
    };

    if (dbPool) {
      try {
        const { rows: existingRows } = await dbPool.query(
          'SELECT stock_hash FROM stock_items WHERE product_id = $1',
          [productId]
        );
        const existingHashes = new Set(existingRows.map((r) => r.stock_hash));

        for (const rawLine of lines) {
          const line = String(rawLine).trim();
          if (!line) continue;

          const stockHash = sha256(line);
          if (existingHashes.has(stockHash)) {
            results.duplicates += 1;
            continue;
          }

          existingHashes.add(stockHash);
          const stockId = uuidv4();
          await dbPool.query(
            `INSERT INTO stock_items (id, product_id, stock_type, payload, stock_hash, status)
             VALUES ($1, $2, $3, $4, $5, 'available')
             ON CONFLICT (product_id, stock_hash) DO NOTHING`,
            [stockId, productId, stockType, line, stockHash]
          );

          results.inserted += 1;
        }

        return results;
      } catch (err) {
        logger.warn('dbPool bulkAddStock error, falling back to memory:', err.message);
      }
    }

    const existingHashes = new Set(
      memoryStore.stock_items
        .filter((s) => s.product_id === productId)
        .map((s) => s.stock_hash)
    );

    const newItems = [];

    for (const rawLine of lines) {
      const line = String(rawLine).trim();
      if (!line) continue;

      const stockHash = sha256(line);
      if (existingHashes.has(stockHash)) {
        results.duplicates += 1;
        continue;
      }

      existingHashes.add(stockHash);
      const item = {
        id: uuidv4(),
        product_id: productId,
        stock_type: stockType,
        payload: line,
        stock_hash: stockHash,
        status: STOCK_STATUS.AVAILABLE,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      newItems.push(item);
      results.inserted += 1;
    }

    memoryStore.stock_items.push(...newItems);
    return results;
  },

  /**
   * Delete or disable unsold stock item
   */
  async deleteStockItem(id) {
    if (dbPool) {
      try {
        const check = await dbPool.query('SELECT status FROM stock_items WHERE id = $1', [id]);
        if (check.rows.length > 0 && check.rows[0].status === 'sold') {
          throw new Error('Cannot delete already sold stock item');
        }

        const res = await dbPool.query('DELETE FROM stock_items WHERE id = $1 AND status != \'sold\'', [id]);
        const index = memoryStore.stock_items.findIndex((s) => s.id === id);
        if (index !== -1) memoryStore.stock_items.splice(index, 1);
        return res.rowCount > 0;
      } catch (err) {
        if (err.message.includes('sold')) throw err;
        logger.warn('dbPool deleteStockItem error, falling back:', err.message);
      }
    }

    const index = memoryStore.stock_items.findIndex((s) => s.id === id);
    if (index === -1) return false;
    const item = memoryStore.stock_items[index];
    if (item.status === STOCK_STATUS.SOLD) {
      throw new Error('Cannot delete already sold stock item');
    }
    memoryStore.stock_items.splice(index, 1);
    return true;
  },

  /**
   * ATOMIC INVENTORY ALLOCATION & DELIVERY
   * Ensures no two customers get the same stock items
   */
  async lockAndDeliverOrderStock(orderId, orderItems) {
    // If PostgreSQL pool exists, run the database stored procedure for valid DB order UUIDs
    const isUuid = typeof orderId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    if (dbPool && isUuid) {
      const client = await dbPool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT * FROM process_order_stock_delivery($1)', [orderId]);
        await client.query('COMMIT');
        return rows;
      } catch (err) {
        await client.query('ROLLBACK');
        if (err.message && err.message.toLowerCase().includes('not found')) {
          logger.warn(`Order ${orderId} not found in PostgreSQL, using in-memory stock allocation.`);
        } else {
          logger.error('PostgreSQL stored procedure process_order_stock_delivery failed:', err.message);
          throw err;
        }
      } finally {
        client.release();
      }
    }

    // Atomic memory lock fallback
    const createdDeliveries = [];
    const stockToUpdate = [];

    // Step 1: Check availability & allocate
    for (const item of orderItems) {
      const isGamepassOrRobux =
        item.stock_type === 'manual' ||
        (item.product_name || '').toLowerCase().includes('gamepass') ||
        (item.product_name || '').toLowerCase().includes('top-up') ||
        (item.product_name || '').toLowerCase().includes('topup') ||
        (item.product_name || '').toLowerCase().includes('robux') ||
        (item.product_name || '').toLowerCase().includes('r$');

      if (['code', 'account', 'file', 'link', 'text'].includes(item.stock_type) && !isGamepassOrRobux) {
        const availableItems = memoryStore.stock_items.filter(
          (s) => s.product_id === item.product_id && s.status === STOCK_STATUS.AVAILABLE
        );

        if (availableItems.length < item.quantity) {
          throw new Error(
            `INSUFFICIENT_STOCK: Required ${item.quantity} units for product "${item.product_name}", but only ${availableItems.length} available.`
          );
        }

        const allocated = availableItems.slice(0, item.quantity);
        allocated.forEach((s) => {
          stockToUpdate.push(s);
          createdDeliveries.push({
            id: uuidv4(),
            order_id: orderId,
            order_item_id: item.id,
            stock_item_id: s.id,
            product_id: item.product_id,
            delivery_type: s.stock_type,
            delivery_payload: s.payload,
            delivered_at: new Date().toISOString(),
            is_viewed: false
          });
        });
      } else {
        // Manual stock delivery
        createdDeliveries.push({
          id: uuidv4(),
          order_id: orderId,
          order_item_id: item.id,
          stock_item_id: null,
          product_id: item.product_id,
          delivery_type: 'manual',
          delivery_payload: 'Order confirmed. Store support will provide details manually via Telegram.',
          delivered_at: new Date().toISOString(),
          is_viewed: false
        });
      }
    }

    // Step 2: Mark all allocated stock items as sold
    stockToUpdate.forEach((s) => {
      s.status = STOCK_STATUS.SOLD;
      s.order_id = orderId;
      s.sold_at = new Date().toISOString();
      s.updated_at = new Date().toISOString();
    });

    memoryStore.deliveries.push(...createdDeliveries);
    return createdDeliveries;
  }
};
