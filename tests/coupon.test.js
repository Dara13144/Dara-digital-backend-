import { couponService } from '../src/services/couponService.js';

describe('Coupon Validation & Calculation Tests', () => {
  it('should calculate 10% percentage discount correctly', async () => {
    const result = await couponService.validateCoupon('WELCOME10', 'user-1', 50.0);
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(5.0);
    expect(result.finalSubtotal).toBe(45.0);
  });

  it('should calculate fixed discount correctly', async () => {
    const result = await couponService.validateCoupon('DARAMINI2', 'user-1', 20.0);
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(2.0);
    expect(result.finalSubtotal).toBe(18.0);
  });

  it('should reject coupon when cart subtotal is below minimum amount', async () => {
    await expect(
      couponService.validateCoupon('DARAMINI2', 'user-1', 5.0) // min amount is 15.0
    ).rejects.toThrow(/COUPON_MIN_AMOUNT/);
  });

  it('should reject invalid coupon code', async () => {
    await expect(
      couponService.validateCoupon('INVALID_CODE_XYZ', 'user-1', 50.0)
    ).rejects.toThrow(/COUPON_INVALID/);
  });
});
