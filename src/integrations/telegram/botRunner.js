import axios from 'axios';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { handleTelegramWebhook } from './bot.js';

let offset = 0;
let isPolling = false;

export async function startBotRunner() {
  if (isPolling) {
    logger.debug('Telegram Bot runner is already running.');
    return;
  }

  if (!ENV.TELEGRAM_BOT_TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN not provided. Bot polling skipped.');
    return;
  }

  isPolling = true;
  logger.info(`Starting Telegram Bot background runner for @${ENV.TELEGRAM_BOT_USERNAME}...`);

  // Initialize Bot Commands & Menu Button
  try {
    await axios.post(`https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/setMyCommands`, {
      commands: [
        { command: 'start', description: 'បើកហាងទំនិញ (Start & Open Store)' },
        { command: 'shop', description: 'ទំនិញ (Products Catalog)' },
        { command: 'orders', description: 'ការបញ្ជាទិញរបស់ខ្ញុំ (My Orders)' },
        { command: 'wallet', description: 'កាបូបលុយ (My Wallet)' },
        { command: 'status', description: 'ស្ថានភាពប្រព័ន្ធ (System Status)' },
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
    logger.warn('Telegram commands / menu setup notice:', err.response?.data?.description || err.message);
  }

  // Background long polling loop
  (async () => {
    while (isPolling) {
      try {
        const response = await axios.get(
          `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=25`,
          { timeout: 30000 }
        );

        const updates = response.data?.result || [];
        for (const update of updates) {
          offset = update.update_id + 1;
          await handleTelegramWebhook(update).catch((err) => {
            logger.error('Error handling Telegram update:', err.message);
          });
        }
      } catch (err) {
        if (!isPolling) break;
        // In case of conflict (e.g. another instance started) or network timeout, wait and retry
        logger.debug('Telegram polling tick:', err.message);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  })().catch((err) => {
    logger.error('Fatal Telegram polling runner error:', err.message);
  });
}

export function stopBotRunner() {
  isPolling = false;
  logger.info('Telegram Bot runner stopped.');
}

// Auto-run if executed directly as standalone script
const isDirectScript = process.argv[1] && (
  process.argv[1].endsWith('botRunner.js') || 
  process.argv[1].endsWith('botRunner')
);
if (isDirectScript) {
  startBotRunner();
}
