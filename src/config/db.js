import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { ENV } from './env.js';
import { logger } from './logger.js';

const { Pool } = pg;

// Supabase Public / Anon client
export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Supabase Admin / Service Role client (Trusted server-side operations)
export const supabaseAdmin = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Direct PostgreSQL Connection Pool for row-level transactions (SELECT FOR UPDATE)
let pool = null;
if (ENV.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: ENV.DATABASE_URL,
      ssl: ENV.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    pool.on('error', (err) => {
      logger.error('Unexpected Postgres pool error:', err);
    });

    logger.info('Direct PostgreSQL pool initialized successfully.');
  } catch (err) {
    logger.warn('Direct PostgreSQL pool initialization skipped or failed:', err.message);
  }
}

export const dbPool = pool;

/**
 * Execute a query with direct pool or fall back to Supabase RPC
 */
export async function executeTx(callback) {
  if (dbPool) {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    // If running via Supabase JS client only
    return await callback(supabaseAdmin);
  }
}
