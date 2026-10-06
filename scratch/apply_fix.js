import { dbPool } from '../src/config/db.js';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('Applying updated functions to Supabase PostgreSQL...');
  const sql = fs.readFileSync(path.resolve('../supabase/migrations/002_functions_and_triggers.sql'), 'utf-8');
  await dbPool.query(sql);
  console.log('✅ 002_functions_and_triggers.sql applied successfully to Supabase!');
  process.exit(0);
}

main().catch(err => {
  console.error('Error applying SQL:', err);
  process.exit(1);
});
