import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { memoryStore } from './storeMemory.js';
import { WALLET_TX_TYPE } from '../constants/states.js';
import { dbPool } from '../config/db.js';
import { logger } from '../config/logger.js';

const isUuid = (val) => typeof val === 'string' && uuidValidate(val);

export const walletRepo = {
  async getOrCreateWallet(userId) {
    if (dbPool && isUuid(userId)) {
      try {
        const { rows } = await dbPool.query(
          `INSERT INTO wallets (user_id, balance, currency)
           VALUES ($1, 0.00, 'USD')
           ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
           RETURNING *`,
          [userId]
        );
        if (rows.length > 0) {
          const w = rows[0];
          const index = memoryStore.wallets.findIndex((mem) => mem.user_id === userId);
          if (index !== -1) memoryStore.wallets[index] = w;
          else memoryStore.wallets.push(w);
          return w;
        }
      } catch (err) {
        logger.debug('dbPool getOrCreateWallet fallback:', err.message);
      }
    }

    let wallet = memoryStore.wallets.find((w) => w.user_id === userId);
    if (!wallet) {
      wallet = {
        id: isUuid(userId) ? uuidv4() : `wal-${userId}`,
        user_id: userId,
        balance: 0.00,
        currency: 'USD',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryStore.wallets.push(wallet);
    }
    return wallet;
  },

  async getTransactions(userId, { page = 1, limit = 20 } = {}) {
    if (dbPool && isUuid(userId)) {
      try {
        const offset = (page - 1) * limit;
        const countRes = await dbPool.query(
          'SELECT COUNT(*) FROM wallet_transactions WHERE user_id = $1',
          [userId]
        );
        const total = parseInt(countRes.rows[0].count, 10);
        const { rows } = await dbPool.query(
          `SELECT * FROM wallet_transactions 
           WHERE user_id = $1 
           ORDER BY created_at DESC 
           LIMIT $2 OFFSET $3`,
          [userId, limit, offset]
        );
        return { items: rows, total, page, limit };
      } catch (err) {
        logger.debug('dbPool getTransactions fallback:', err.message);
      }
    }

    const list = memoryStore.wallet_transactions
      .filter((tx) => tx.user_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = list.length;
    const items = list.slice((page - 1) * limit, page * limit);
    return { items, total, page, limit };
  },

  async adjustBalance({
    userId,
    amount,
    type,
    orderId = null,
    paymentId = null,
    reference = null,
    description = null,
    createdBy = null
  }) {
    const safeUserId = isUuid(userId) ? userId : null;
    const safeOrderId = isUuid(orderId) ? orderId : null;
    const safePaymentId = isUuid(paymentId) ? paymentId : null;
    const safeCreatedBy = isUuid(createdBy) ? createdBy : null;
    const delta = Number(amount);

    let dbResult = null;

    // 1. Try PostgreSQL stored procedure if valid UUID
    if (dbPool && safeUserId) {
      const client = await dbPool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          'SELECT * FROM adjust_wallet_balance($1, $2, $3, $4, $5, $6, $7, $8)',
          [safeUserId, delta, type, safeOrderId, safePaymentId, reference, description, safeCreatedBy]
        );
        await client.query('COMMIT');
        if (rows && rows.length > 0) {
          dbResult = rows[0];
        }
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('PostgreSQL adjust_wallet_balance error:', err.message);
        throw err;
      } finally {
        client.release();
      }
    }

    // 2. Synchronize in-memory cache and handle non-DB environments
    const wallet = await this.getOrCreateWallet(userId);
    const balanceBefore = Number(wallet.balance || 0);
    const balanceAfter = dbResult
      ? Number(dbResult.new_balance)
      : Number((balanceBefore + delta).toFixed(2));

    if (!dbResult && balanceAfter < 0) {
      throw new Error(
        `INSUFFICIENT_FUNDS: Current balance is $${balanceBefore.toFixed(2)}, cannot debit $${Math.abs(delta).toFixed(2)}`
      );
    }

    wallet.balance = balanceAfter;
    wallet.updated_at = new Date().toISOString();

    // Sync user cached balance
    const user = memoryStore.users.find((u) => u.id === userId);
    if (user) {
      user.balance = balanceAfter;
      user.updated_at = new Date().toISOString();
    }

    const tx = {
      id: dbResult?.transaction_id || uuidv4(),
      wallet_id: dbResult?.wallet_id || wallet.id,
      user_id: userId,
      type,
      amount: delta,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      order_id: orderId,
      payment_id: paymentId,
      reference,
      description,
      created_by: createdBy,
      created_at: new Date().toISOString()
    };

    memoryStore.wallet_transactions.unshift(tx);
    return tx;
  }
};
