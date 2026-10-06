import pg from 'pg';

const { Pool } = pg;

async function testPostgres() {
  const urlWithoutBrackets = 'postgresql://postgres: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@db.ghstmiubmmfogscpohek.supabase.co:5432/postgres';
  const urlWithBrackets = 'postgresql://postgres:[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]@db.ghstmiubmmfogscpohek.supabase.co:5432/postgres';

  console.log('Testing Postgres connection without brackets...');
  try {
    const pool = new Pool({
      connectionString: urlWithoutBrackets,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000
    });
    const res = await pool.query('SELECT NOW() as now, version() as version;');
    console.log('✅ Connected successfully without brackets! Result:', res.rows[0]);
    await pool.end();
    return urlWithoutBrackets;
  } catch (err1) {
    console.log('Failed without brackets:', err1.message);
  }

  console.log('Testing Postgres connection with brackets...');
  try {
    const pool = new Pool({
      connectionString: urlWithBrackets,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000
    });
    const res = await pool.query('SELECT NOW() as now;');
    console.log('✅ Connected successfully with brackets! Result:', res.rows[0]);
    await pool.end();
    return urlWithBrackets;
  } catch (err2) {
    console.log('Failed with brackets:', err2.message);
  }
}

testPostgres();
