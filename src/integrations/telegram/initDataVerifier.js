import crypto from 'crypto';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { safeCompare } from '../../utils/crypto.js';

/**
 * Validates Telegram WebApp initData server-side using Telegram's cryptographic specification
 * @param {string} initData - Raw initData string sent from Telegram WebApp SDK
 * @param {string} botToken - Telegram Bot Token
 * @param {number} maxAgeSeconds - Max allowed age in seconds (default 86400 / 24h)
 * @returns {object|null} Parsed and validated user & auth data or null if invalid
 */
export function verifyTelegramInitData(initData, botToken = ENV.TELEGRAM_BOT_TOKEN, maxAgeSeconds = 86400) {
  if (!initData || typeof initData !== 'string') {
    return null;
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) {
      return null;
    }

    // Collect and sort all parameters except 'hash'
    const dataCheckArr = [];
    urlParams.forEach((val, key) => {
      if (key !== 'hash') {
        dataCheckArr.push(`${key}=${val}`);
      }
    });
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');

    // If bot token is not set (e.g. initial dev environment), support mock in development only
    if (!botToken) {
      if (ENV.NODE_ENV === 'development') {
        logger.warn('TELEGRAM_BOT_TOKEN is not configured. Development mock bypass enabled.');
        const userJson = urlParams.get('user');
        return {
          user: userJson ? JSON.parse(userJson) : { id: 999999999, first_name: 'Dev', username: 'devuser' },
          auth_date: parseInt(urlParams.get('auth_date') || Date.now() / 1000, 10),
          query_id: urlParams.get('query_id')
        };
      }
      return null;
    }

    // 1. Calculate secret key = HMAC_SHA256("WebAppData", botToken)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

    // 2. Calculate data hash = HMAC_SHA256(secretKey, dataCheckString)
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    // 3. Constant-time comparison
    if (!safeCompare(calculatedHash, hash)) {
      logger.warn('Telegram initData signature mismatch.');
      return null;
    }

    // 4. Validate auth_date to prevent replay attacks
    const authDate = parseInt(urlParams.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > maxAgeSeconds) {
      logger.warn(`Telegram initData expired. Auth date: ${authDate}, Now: ${now}`);
      return null;
    }

    const userJson = urlParams.get('user');
    const user = userJson ? JSON.parse(userJson) : null;

    return {
      user,
      auth_date: authDate,
      query_id: urlParams.get('query_id'),
      start_param: urlParams.get('start_param'),
      chat_instance: urlParams.get('chat_instance'),
      chat_type: urlParams.get('chat_type')
    };
  } catch (err) {
    logger.error('Error verifying Telegram initData:', err);
    return null;
  }
}
