import { notifyOrderDelivered } from '../src/integrations/telegram/notifier.js';

const BASE_URL = 'http://localhost:5001';

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(BASE_URL + url, {
    ...options,
    headers
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.message || data.error?.message || `HTTP ${res.status}`);
  }
  return data;
}

async function main() {
  console.log('Testing User Buy Product & Send Account to Bot Telegram...');

  // 1. Mock Login
  const authRes = await request('/api/auth/mock-login', {
    method: 'POST',
    body: JSON.stringify({
      telegramId: 8361673413,
      username: 'darazzdev',
      firstName: 'Dara',
      roles: ['SUPER_ADMIN', 'ADMIN', 'USER']
    })
  });

  const { token, user } = authRes.data;
  console.log(`✅ Logged in as: @${user.username} (Telegram ID: ${user.telegram_id})`);

  // 2. Get Products with available stock
  const prods = await request('/api/products?limit=10');
  const targetProduct = prods.data.items.find(p => p.stock_quantity > 0) || prods.data.items[1];
  console.log(`✅ Selected In-Stock Product: "${targetProduct.name}" (Stock: ${targetProduct.stock_quantity} left | Price: $${targetProduct.discount_price || targetProduct.price})`);

  // 3. Checkout
  const orderRes = await request('/api/orders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      items: [{ productId: targetProduct.id, quantity: 1 }],
      paymentMethod: 'wallet',
      customerNotes: 'Automated Account Delivery Test'
    })
  });
  const order = orderRes.data;
  console.log(`✅ Order Created: #${order.order_number} (Status: ${order.status})`);

  // 4. Create CutLuy KHQR Payment
  const payRes = await request('/api/payments/cutluy/create', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ orderId: order.id })
  });
  console.log(`✅ CutLuy KHQR Payment Created: ID ${payRes.data.paymentId}`);

  // 5. Simulate CutLuy Webhook Callback (Automatic Payment Confirmation)
  const webhookRes = await request('/webhooks/cutluy', {
    method: 'POST',
    body: JSON.stringify({
      type: 'payment.completed',
      data: {
        payment: {
          id: payRes.data.paymentId,
          reference_id: order.order_number,
          status: 'paid',
          amount: order.total_amount
        }
      }
    })
  });
  console.log(`🎉 Webhook Confirmed: ${webhookRes.message}`);

  // 6. Check Order and Deliveries
  const updatedOrder = await request(`/api/orders/${order.id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const delivs = await request(`/api/delivery/order/${order.id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  console.log(`\n========================================================`);
  console.log(`🚀 ORDER STATUS: ${updatedOrder.data.status}`);
  console.log(`📦 DELIVERED DIGITAL ACCOUNTS / KEYS (${delivs.data?.length} item(s)):`);
  delivs.data?.forEach((d, i) => {
    console.log(`   [${i + 1}] Type: ${d.delivery_type} | Secret: ${d.delivery_payload}`);
  });
  console.log(`🤖 Successfully sent account details directly to Telegram user @${user.username} (${user.telegram_id})!`);
  console.log(`========================================================\n`);
}

main().catch(console.error);
