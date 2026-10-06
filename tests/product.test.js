import request from 'supertest';
import { app } from '../src/app.js';

describe('Products & Categories API Tests', () => {
  it('should fetch categories with status 200', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('should fetch products list and NEVER leak stock payload', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toBeDefined();

    const firstProduct = res.body.data.items[0];
    expect(firstProduct.id).toBeDefined();
    expect(firstProduct.name).toBeDefined();
    expect(firstProduct.price).toBeDefined();
    expect(firstProduct.stock_quantity).toBeGreaterThanOrEqual(0);

    // CRITICAL SECURITY ASSERTION: Payload / codes must not be present
    expect(firstProduct.payload).toBeUndefined();
    expect(firstProduct.stock_items).toBeUndefined();
  });

  it('should filter products by category slug', async () => {
    const res = await request(app).get('/api/products?categorySlug=game-keys');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  it('should retrieve a product by slug', async () => {
    const res = await request(app).get('/api/products/slug/windows-11-pro-oem-key');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toContain('Windows 11');
  });
});
