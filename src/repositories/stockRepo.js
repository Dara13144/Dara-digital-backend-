import { v4 as uuidv4 } from 'uuid';
import { memoryStore } from './storeMemory.js';
import { sha256 } from '../utils/crypto.js';
import { STOCK_STATUS } from '../constants/states.js';
import { supabaseAdmin, dbPool } from '../config/db.js';
import { logger } from '../config/logger.js';
import { ENV } from '../config/env.js';

export const stockRepo = {
  /**
   * Get available stock count for a given product
   */
  async getAvailableCount(productId) {
    return memoryStore.stock_items.filter(
      (s) => s.product_id === productId && s.status === STOCK_STATUS.AVAILABLE
    ).length;
  },

  /**
   * Admin: List stock items with pagination & status filters
   */
  async getStockItemsByProduct(productId, { status, page = 1, limit = 50 } = {}) {
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

    // Duplicate check
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

    // Atomic memory lock
    const createdDeliveries = [];
    const stockToUpdate = [];

    // Step 1: Check availability & allocate
    for (const item of orderItems) {
      if (['code', 'account', 'file', 'link', 'text'].includes(item.stock_type)) {
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
