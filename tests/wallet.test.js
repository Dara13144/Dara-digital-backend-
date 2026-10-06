import { walletRepo } from '../src/repositories/walletRepo.js';
import { WALLET_TX_TYPE } from '../src/constants/states.js';

describe('Wallet & Ledger Transactions Tests', () => {
  const testUserId = 'test-wallet-user-123';

  it('should credit user balance and record ledger transaction', async () => {
    const tx = await walletRepo.adjustBalance({
      userId: testUserId,
      amount: 50.0,
      type: WALLET_TX_TYPE.ADMIN_CREDIT,
      description: 'Test Deposit'
    });

    expect(tx.balance_before).toBe(0);
    expect(tx.balance_after).toBe(50.0);
    expect(tx.amount).toBe(50.0);
  });

  it('should debit user balance correctly for purchase', async () => {
    const tx = await walletRepo.adjustBalance({
      userId: testUserId,
      amount: -20.0,
      type: WALLET_TX_TYPE.PURCHASE,
      description: 'Order Purchase'
    });

    expect(tx.balance_before).toBe(50.0);
    expect(tx.balance_after).toBe(30.0);
  });

  it('should reject debit when balance is insufficient', async () => {
    await expect(
      walletRepo.adjustBalance({
        userId: testUserId,
        amount: -100.0, // Current balance is 30.0
        type: WALLET_TX_TYPE.PURCHASE
      })
    ).rejects.toThrow(/INSUFFICIENT_FUNDS/);
  });
});
