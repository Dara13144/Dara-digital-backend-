import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;
const pass = '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';
const projectRef = 'ghstmiubmmfogscpohek';
const connectionString = `postgresql://postgres.${projectRef}:${pass}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;

async function runSeed() {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  console.log('Running supabase/seed.sql on live Supabase database...');
  const seedPath = path.resolve(__dirname, '../../supabase/seed.sql');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  try {
    await pool.query(seedSql);
    console.log('✅ seed.sql executed successfully!');

    // Query stats
    const categoriesCount = await pool.query('SELECT count(*) FROM categories;');
    const productsCount = await pool.query('SELECT count(*) FROM products;');
    const stockCount = await pool.query('SELECT count(*) FROM stock_items;');
    const couponsCount = await pool.query('SELECT count(*) FROM coupons;');
    const settingsCount = await pool.query('SELECT count(*) FROM settings;');

    console.log('📊 Current Database Status:');
    console.log('• Categories in DB:', categoriesCount.rows[0].count);
    console.log('• Products in DB:', productsCount.rows[0].count);
    console.log('• Stock Items in DB:', stockCount.rows[0].count);
    console.log('• Coupons in DB:', couponsCount.rows[0].count);
    console.log('• Settings in DB:', settingsCount.rows[0].count);
  } catch (err) {
    console.error('Error running seed.sql:', err.message);
  } finally {
    await pool.end();
  }
}

runSeed();
