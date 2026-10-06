import request from 'supertest';
import { app } from '../src/app.js';
import { verifyTelegramInitData } from '../src/integrations/telegram/initDataVerifier.js';

describe('Authentication & Telegram Verification Tests', () => {
  it('should authenticate mock user for development/test environment', async () => {
    const res = await request(app)
      .post('/api/auth/mock-login')
      .send({
        telegramId: 88888888,
        username: 'test_telegram_user',
        firstName: 'John'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(Number(res.body.data.user.telegram_id)).toBe(88888888);
  });

  it('should return error when initData is missing', async () => {
    const res = await request(app)
      .post('/api/telegram/auth')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject invalid telegram initData string gracefully', () => {
    const result = verifyTelegramInitData('invalid_data=123&hash=abc', 'some_token');
    expect(result).toBeNull();
  });
});
