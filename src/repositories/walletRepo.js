import { v4 as uuidv4 } from 'uuid';
import { memoryStore } from './storeMemory.js';
import { WALLET_TX_TYPE } from '../constants/states.js';
import { dbPool } from '../config/db.js';
import { logger } from '../config/logger.js';

export const walletRepo = {
  async getOrCreateWallet(userId) {
    if (dbPool) {
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
        id: uuidv4(),
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
    // If PostgreSQL pool is available, use stored procedure
    if (dbPool) {
      const client = await dbPool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          'SELECT * FROM adjust_wallet_balance($1, $2, $3, $4, $5, $6, $7, $8)',
          [userId, amount, type, orderId, paymentId, reference, description, createdBy]
        );
        await client.query('COMMIT');
        return rows[0];
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('PostgreSQL adjust_wallet_balance error:', err.message);
        throw err;
      } finally {
        client.release();
      }
    }

    // Atomic in-memory balance adjustment
    const wallet = await this.getOrCreateWallet(userId);
    const balanceBefore = Number(wallet.balance);
    const delta = Number(amount);
    const balanceAfter = Number((balanceBefore + delta).toFixed(2));

    if (balanceAfter < 0) {
      throw new Error(`INSUFFICIENT_FUNDS: Current balance is $${balanceBefore.toFixed(2)}, cannot debit $${Math.abs(delta).toFixed(2)}`);
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
      id: uuidv4(),
      wallet_id: wallet.id,
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
