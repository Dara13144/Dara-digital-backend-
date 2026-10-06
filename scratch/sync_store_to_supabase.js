import pg from 'pg';
import { v4 as uuidv4, validate as isUUID } from 'uuid';
import { memoryStore } from '../src/repositories/storeMemory.js';

const { Pool } = pg;
const pass = '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';
const projectRef = 'ghstmiubmmfogscpohek';
const connectionString = `postgresql://postgres.${projectRef}:${pass}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;

async function syncAllToSupabase() {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  console.log('Syncing all products, categories, stocks, and coupons to Supabase with proper UUIDs...');

  // 1. Categories
  for (const cat of memoryStore.categories) {
    const catId = isUUID(cat.id) ? cat.id : uuidv4();
    await pool.query(`
      INSERT INTO categories (id, name, name_km, slug, icon, image_url, description, sort_order, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        name_km = EXCLUDED.name_km,
        icon = EXCLUDED.icon,
        image_url = EXCLUDED.image_url;
    `, [catId, cat.name, cat.name_km, cat.slug, cat.icon, cat.image_url, cat.description, cat.sort_order, cat.status]);
  }
  console.log(`✅ Synced ${memoryStore.categories.length} Categories.`);

  // 2. Products
  for (const p of memoryStore.products) {
    const prodId = isUUID(p.id) ? p.id : uuidv4();
    await pool.query(`
      INSERT INTO products (
        id, category_id, name, name_km, slug, description, description_km,
        images, price, discount_price, currency, stock_type, stock_quantity,
        sold_quantity, status, featured, published, rating, instructions
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19
      )
      ON CONFLICT (slug) DO UPDATE SET
        price = EXCLUDED.price,
        discount_price = EXCLUDED.discount_price,
        images = EXCLUDED.images,
        status = EXCLUDED.status,
        published = EXCLUDED.published,
        featured = EXCLUDED.featured;
    `, [
      prodId, p.category_id, p.name, p.name_km, p.slug, p.description, p.description_km,
      p.images, p.price, p.discount_price, p.currency, p.stock_type, p.stock_quantity || 0,
      p.sold_quantity || 0, p.status, Boolean(p.featured), p.published !== false,
      p.rating || 5.0, p.instructions || ''
    ]);
  }
  console.log(`✅ Synced ${memoryStore.products.length} Products.`);

  // 3. Stock Items
  for (const s of memoryStore.stock_items) {
    const stockId = isUUID(s.id) ? s.id : uuidv4();
    await pool.query(`
      INSERT INTO stock_items (id, product_id, stock_type, payload, stock_hash, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (product_id, stock_hash) DO NOTHING;
    `, [stockId, s.product_id, s.stock_type, s.payload, s.stock_hash, s.status]);
  }
  console.log(`✅ Synced ${memoryStore.stock_items.length} Stock items.`);

  // 4. Verification
  const prodRes = await pool.query('SELECT count(*) FROM products;');
  const stockRes = await pool.query('SELECT count(*) FROM stock_items WHERE status = \'available\';');
  console.log('⚡ Verification in Supabase:');
  console.log('• Products Count:', prodRes.rows[0].count);
  console.log('• Available Stock Items:', stockRes.rows[0].count);

  await pool.end();
}

syncAllToSupabase().catch(console.error);
