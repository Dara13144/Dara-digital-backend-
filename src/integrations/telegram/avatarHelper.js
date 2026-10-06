import axios from 'axios';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';

// Cache avatar URLs for 1 hour to reduce Telegram API calls
const avatarCache = new Map();

/**
 * Fetch a Telegram user's profile photo via Telegram Bot API
 * @param {number|string} telegramId - Telegram User ID
 * @returns {Promise<string|null>} Direct Telegram CDN photo URL or null
 */
export async function fetchTelegramAvatarUrl(telegramId) {
  if (!telegramId || !ENV.TELEGRAM_BOT_TOKEN) return null;

  const idStr = String(telegramId);
  const cached = avatarCache.get(idStr);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  try {
    // 1. Get user profile photos
    const response = await axios.get(
      `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/getUserProfilePhotos?user_id=${idStr}&limit=1`,
      { timeout: 8000 }
    );

    const photos = response.data?.result?.photos;
    if (!photos || photos.length === 0 || photos[0].length === 0) {
      return null;
    }

    // Pick highest resolution available (last item in photo array)
    const bestPhoto = photos[0][photos[0].length - 1];
    const fileId = bestPhoto.file_id;

    // 2. Get file path from Telegram
    const fileRes = await axios.get(
      `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`,
      { timeout: 8000 }
    );

    const filePath = fileRes.data?.result?.file_path;
    if (!filePath) return null;

    const fullPhotoUrl = `https://api.telegram.org/file/bot${ENV.TELEGRAM_BOT_TOKEN}/${filePath}`;

    avatarCache.set(idStr, {
      url: fullPhotoUrl,
      expiresAt: Date.now() + 60 * 60 * 1000 // 1 hour
    });

    return fullPhotoUrl;
  } catch (err) {
    logger.debug(`Could not fetch Telegram avatar for ${telegramId}: ${err.message}`);
    return null;
  }
}
