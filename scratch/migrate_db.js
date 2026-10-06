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

async function checkAndApplyMigrations() {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  console.log('Checking existing public tables...');
  const res = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  const existingTables = res.rows.map(r => r.table_name);
  console.log('Existing tables in Supabase:', existingTables);

  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
  const files = ['001_initial_schema.sql', '002_functions_and_triggers.sql', '003_rls_policies.sql'];

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`Applying migration: ${file}...`);
      const sql = fs.readFileSync(filePath, 'utf8');
      try {
        await pool.query(sql);
        console.log(`✅ ${file} applied successfully!`);
      } catch (err) {
        console.log(`⚠️ ${file} Notice/Error:`, err.message);
      }
    }
  }

  const finalRes = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log('✅ Final public tables in Supabase:', finalRes.rows.map(r => r.table_name));

  await pool.end();
}

checkAndApplyMigrations().catch(console.error);
