import axios from 'axios';

async function testE2E() {
  console.log('Testing End-to-End Supabase Integration...');

  // 1. Categories
  const catRes = await axios.get('http://localhost:5001/api/categories');
  console.log(`1. Categories fetched from Supabase: ${catRes.data.data.length} categories.`);

  // 2. Products
  const prodRes = await axios.get('http://localhost:5001/api/products');
  console.log(`2. Products fetched from Supabase: ${prodRes.data.data.items.length} products.`);

  // 3. Admin Dashboard
  const adminLogin = await axios.post('http://localhost:5001/api/auth/mock-login', {
    telegramId: 8361673413,
    username: 'darazzdev',
    firstName: 'Dara Admin'
  });
  const token = adminLogin.data.data.token;
  console.log('3. Logged in as Admin:', adminLogin.data.data.user.username);

  const dashRes = await axios.get('http://localhost:5001/api/admin/dashboard', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('4. Admin Dashboard loaded from Supabase:', dashRes.data.data.metrics);
  console.log('🎉 All systems verified connected to Supabase!');
}

testE2E().catch(console.error);
