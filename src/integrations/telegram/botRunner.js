import axios from 'axios';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { handleTelegramWebhook } from './bot.js';

let offset = 0;

async function pollUpdates() {
  if (!ENV.TELEGRAM_BOT_TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN not provided. Bot polling skipped.');
    return;
  }

  logger.info(`Starting Telegram Bot long-polling for @${ENV.TELEGRAM_BOT_USERNAME}...`);

  // Initialize Bot Commands & Menu Button
  try {
    await axios.post(`https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/setMyCommands`, {
      commands: [
        { command: 'start', description: 'បើកហាងទំនិញ (Start & Open Store)' },
        { command: 'shop', description: 'ទំនិញ (Products Catalog)' },
        { command: 'orders', description: 'ការបញ្ជាទិញរបស់ខ្ញុំ (My Orders)' },
        { command: 'wallet', description: 'កាបូបលុយ (My Wallet)' },
        { command: 'help', description: 'ជំនួយ និងសេវាអតិថិជន (Customer Support)' }
      ]
    });
    logger.info('Telegram Bot commands registered successfully.');

    const miniAppUrl = ENV.TELEGRAM_MINI_APP_URL || ENV.FRONTEND_URL;
    if (typeof miniAppUrl === 'string' && miniAppUrl.startsWith('https://')) {
      await axios.post(`https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/setChatMenuButton`, {
        menu_button: {
          type: 'web_app',
          text: 'ទំនិញ',
          web_app: {
            url: miniAppUrl
          }
        }
      });
      logger.info('Telegram Bot WebApp menu button (ទំនិញ) configured successfully.');
    }
  } catch (err) {
    logger.warn('Failed to set Telegram commands / menu button:', err.response?.data || err.message);
  }

  while (true) {
    try {
      const response = await axios.get(
        `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`,
        { timeout: 35000 }
      );

      const updates = response.data?.result || [];
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleTelegramWebhook(update);
      }
    } catch (err) {
      logger.error('Telegram polling error:', err.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

pollUpdates();
