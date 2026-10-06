import { stockRepo } from '../src/repositories/stockRepo.js';
import { productRepo } from '../src/repositories/productRepo.js';

describe('Atomic Stock Inventory & Concurrency Protection Tests', () => {
  let testProductId;

  beforeAll(async () => {
    const prod = await productRepo.create({
      name: 'Concurrency Test Key',
      category_id: '10000000-0000-0000-0000-000000000001',
      price: 10.0,
      stock_type: 'code'
    });
    testProductId = prod.id;
  });

  it('should bulk insert stock items without allowing duplicates', async () => {
    const lines = ['TEST-KEY-001', 'TEST-KEY-002', 'TEST-KEY-003', 'TEST-KEY-001']; // Note duplicate 001
    const result = await stockRepo.bulkAddStock(testProductId, 'code', lines);

    expect(result.inserted).toBe(3);
    expect(result.duplicates).toBe(1);

    const availableCount = await stockRepo.getAvailableCount(testProductId);
    expect(availableCount).toBe(3);
  });

  it('should atomically reserve distinct stock items for order A and order B', async () => {
    const orderItemsA = [
      {
        id: 'item-a-1',
        product_id: testProductId,
        product_name: 'Concurrency Test Key',
        stock_type: 'code',
        quantity: 2
      }
    ];

    const orderItemsB = [
      {
        id: 'item-b-1',
        product_id: testProductId,
        product_name: 'Concurrency Test Key',
        stock_type: 'code',
        quantity: 1
      }
    ];

    const deliveriesA = await stockRepo.lockAndDeliverOrderStock('order-A', orderItemsA);
    const deliveriesB = await stockRepo.lockAndDeliverOrderStock('order-B', orderItemsB);

    expect(deliveriesA.length).toBe(2);
    expect(deliveriesB.length).toBe(1);

    // CRITICAL: Deliveries must not share any identical payload or stock_item_id
    const payloadA = deliveriesA.map((d) => d.delivery_payload);
    const payloadB = deliveriesB.map((d) => d.delivery_payload);

    expect(payloadA.some((code) => payloadB.includes(code))).toBe(false);

    // Inventory remaining must be 0
    const remaining = await stockRepo.getAvailableCount(testProductId);
    expect(remaining).toBe(0);
  });

  it('should reject order C when stock is exhausted with INSUFFICIENT_STOCK error', async () => {
    const orderItemsC = [
      {
        id: 'item-c-1',
        product_id: testProductId,
        product_name: 'Concurrency Test Key',
        stock_type: 'code',
        quantity: 1
      }
    ];

    await expect(
      stockRepo.lockAndDeliverOrderStock('order-C', orderItemsC)
    ).rejects.toThrow(/INSUFFICIENT_STOCK/);
  });
});
