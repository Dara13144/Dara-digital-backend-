import { notifyAdmin, notifyOrderDelivered } from '../src/integrations/telegram/notifier.js';
import { ENV } from '../src/config/env.js';

async function main() {
  console.log('Testing clean formatted Telegram instant delivery...');

  // Test notifyOrderDelivered to customer
  await notifyOrderDelivered(
    '8361673413',
    {
      id: 'test-order-123',
      order_number: 'ORD-20261005-TEST99',
      total_amount: 14.99,
      currency: 'USD'
    },
    [
      {
        product_id: 'p1',
        product_name: 'Netflix Premium 4K UHD (1 Month)'
      }
    ],
    [
      {
        product_id: 'p1',
        delivery_payload: 'Email: dara.netflix@example.com | Pass: DaraShop#2026 | Profile: PIN 1234'
      }
    ]
  );

  console.log('✅ Instant Product Account Delivered to Telegram User Successfully!');
}

main().catch(console.error);

