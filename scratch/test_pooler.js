import pg from 'pg';
import dns from 'dns/promises';

const { Pool } = pg;
const pass = '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';
const projectRef = 'ghstmiubmmfogscpohek';

const regions = [
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'eu-central-1',
  'eu-west-1'
];

async function testPoolers() {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    try {
      await dns.lookup(host);
      const connStr = `postgresql://postgres.${projectRef}:${pass}@${host}:6543/postgres`;
      const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 4000 });
      const res = await pool.query('SELECT NOW() as now;');
      console.log(`✅ SUCCESS on pooler region ${region}:`, res.rows[0]);
      await pool.end();
      return connStr;
    } catch (e) {
      // ignore
    }
  }
  console.log('No pooler matched or direct IPv6 required.');
}

testPoolers();
