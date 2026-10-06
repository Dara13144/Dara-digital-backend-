import { supabase, supabaseAdmin } from '../src/config/db.js';
import { ENV } from '../src/config/env.js';

async function testSupabase() {
  console.log('Testing Supabase Connection:');
  console.log('URL:', ENV.SUPABASE_URL);
  console.log('Publishable Key:', ENV.SUPABASE_PUBLISHABLE_KEY?.slice(0, 20) + '...');
  console.log('Secret Key:', ENV.SUPABASE_SECRET_KEY?.slice(0, 20) + '...');

  try {
    const { data, error } = await supabaseAdmin.from('users').select('count', { count: 'exact', head: true });
    if (error) {
      console.log('Supabase API responded (Table query test):', error.message || error);
    } else {
      console.log('✅ Supabase connected successfully! Result:', data);
    }
  } catch (err) {
    console.error('Connection test error:', err.message);
  }
}

testSupabase();
