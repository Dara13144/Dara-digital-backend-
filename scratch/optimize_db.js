import pg from 'pg';

const { Pool } = pg;
const pass = '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';
const projectRef = 'ghstmiubmmfogscpohek';
const connectionString = `postgresql://postgres.${projectRef}:${pass}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;

async function optimizeDb() {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  console.log('Adding performance indexes to Supabase PostgreSQL...');

  const indexQueries = [
    'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);',
    'CREATE INDEX IF NOT EXISTS idx_products_published_status ON products(published, status);',
    'CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);',
    'CREATE INDEX IF NOT EXISTS idx_stock_items_product_status ON stock_items(product_id, status);',
    'CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);',
    'CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet ON wallet_transactions(wallet_id, created_at DESC);',
    'CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);',
    'CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);'
  ];

  for (const q of indexQueries) {
    try {
      await pool.query(q);
      console.log('✅ Executed:', q);
    } catch (e) {
      console.log('Notice:', e.message);
    }
  }

  console.log('Testing query performance...');
  const start = performance.now();
  const res = await pool.query(`
    SELECT p.id, p.name, p.price, count(s.id) as available_stock
    FROM products p
    LEFT JOIN stock_items s ON p.id = s.product_id AND s.status = 'available'
    WHERE p.published = true
    GROUP BY p.id;
  `);
  const duration = (performance.now() - start).toFixed(2);
  console.log(`⚡ Indexed Query executed in ${duration}ms! Rows returned: ${res.rows.length}`);

  await pool.end();
}

optimizeDb().catch(console.error);
