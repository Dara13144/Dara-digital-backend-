import pg from 'pg';

const { Pool } = pg;
const pass = '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';
const projectRef = 'ghstmiubmmfogscpohek';

async function testBothPorts() {
  const sessionUrl = `postgresql://postgres.${projectRef}:${pass}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
  const txUrl = `postgresql://postgres.${projectRef}:${pass}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

  console.log('Testing port 5432 (Session mode)...');
  try {
    const pool1 = new Pool({ connectionString: sessionUrl, ssl: { rejectUnauthorized: false } });
    const res1 = await pool1.query('SELECT current_database(), current_user, version();');
    console.log('✅ Port 5432 works:', res1.rows[0]);
    await pool1.end();
  } catch (e) {
    console.log('Port 5432 error:', e.message);
  }

  console.log('Testing port 6543 (Transaction mode)...');
  try {
    const pool2 = new Pool({ connectionString: txUrl, ssl: { rejectUnauthorized: false } });
    const res2 = await pool2.query('SELECT current_database(), current_user;');
    console.log('✅ Port 6543 works:', res2.rows[0]);
    await pool2.end();
  } catch (e) {
    console.log('Port 6543 error:', e.message);
  }
}

testBothPorts();
