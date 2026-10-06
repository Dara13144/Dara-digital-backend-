import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { sendTelegramMessage } from './notifier.js';

/**
 * Handle incoming Telegram Bot Webhook Updates
 */
export async function handleTelegramWebhook(update) {
  if (!update || !update.message) return;

  const message = update.message;
  const chatId = message.chat?.id;
  const text = message.text ? message.text.trim() : '';
  const from = message.from;

  if (!chatId || !text) return;

  logger.info(`Received Telegram message from @${from?.username || from?.id}: ${text}`);

  const makeButton = (label, path = '') => {
    const baseUrl = ENV.TELEGRAM_MINI_APP_URL || ENV.FRONTEND_URL || '';
    const fullUrl = path ? `${baseUrl}${path}` : baseUrl;
    if (typeof fullUrl === 'string' && fullUrl.startsWith('https://')) {
      return { text: label, web_app: { url: fullUrl } };
    }
    // Fallback to valid Telegram Bot URL when running in local dev (http://localhost)
    const botUrl = `https://t.me/${ENV.TELEGRAM_BOT_USERNAME || 'DaraDigital_bot'}`;
    return { text: label, url: botUrl };
  };

  const productButton = makeButton('ទំនិញ');

  const command = text.split(' ')[0].toLowerCase();

  switch (command) {
    case '/start': {
      const welcomeText =
        `👋 <b>សូមស្វាគមន៍មកកាន់ Dara Digital Store, ${from?.first_name || 'អតិថិជន'}!</b>\n\n` +
        `យើងខ្ញុំមានផ្ដល់ជូននូវសេវាកម្មឌីជីថលជាច្រើនដូចជា៖\n` +
        `• 🎮 Game Accounts & Keys (Roblox, Steam, PS5, Xbox)\n` +
        `• 🎁 Gift Cards & Top-ups (Apple, Google Play, Steam)\n` +
        `• 💻 Software, Windows & Office Keys\n` +
        `• ✨ Premium Subscriptions (Telegram Premium, Canva)\n\n` +
        `💳 <i>ទូទាត់ប្រាក់រហ័ស និងសុវត្ថិភាពតាម ABA PayWay (KHQR)</i>\n\n` +
        `ចុចប៊ូតុង <b>«ទំនិញ»</b> ខាងក្រោមដើម្បីបើកកម្មវិធីទិញទំនិញ៖`;

      await sendTelegramMessage(chatId, welcomeText, {
        replyMarkup: {
          inline_keyboard: [
            [productButton],
            [
              makeButton('📦 ការបញ្ជាទិញ (Orders)', '/orders'),
              makeButton('💳 កាបូបលុយ (Wallet)', '/wallet')
            ]
          ]
        }
      });
      break;
    }

    case '/shop':
    case 'ទំនិញ': {
      await sendTelegramMessage(chatId, '🛒 <b>សូមចុចប៊ូតុងខាងក្រោមដើម្បីមើលទំនិញទាំងអស់៖</b>', {
        replyMarkup: {
          inline_keyboard: [[productButton]]
        }
      });
      break;
    }

    case '/orders': {
      await sendTelegramMessage(chatId, '📦 <b>View your orders and instant digital deliveries:</b>', {
        replyMarkup: {
          inline_keyboard: [
            [makeButton('📦 View Orders', '/orders')]
          ]
        }
      });
      break;
    }

    case '/balance':
    case '/wallet': {
      await sendTelegramMessage(chatId, '💳 <b>Check your balance and transaction history:</b>', {
        replyMarkup: {
          inline_keyboard: [
            [makeButton('💳 Open Wallet', '/wallet')]
          ]
        }
      });
      break;
    }

    case '/profile': {
      await sendTelegramMessage(chatId, '👤 <b>Your Account Profile:</b>', {
        replyMarkup: {
          inline_keyboard: [
            [makeButton('👤 Open Profile', '/profile')]
          ]
        }
      });
      break;
    }

    case '/help':
    case '/support': {
      const supportText =
        `💬 <b>Dara Digital Customer Support</b>\n\n` +
        `Need help with an order or product activation?\n` +
        `• Contact Support Admin: <b>@DaraDigital_bot</b>\n` +
        `• Operating Hours: 24/7 Instant Delivery\n` +
        `• Guarantee: 100% genuine digital product guarantee`;

      await sendTelegramMessage(chatId, supportText, {
        replyMarkup: {
          inline_keyboard: [
            [makeButton('🛍 Back to Store')]
          ]
        }
      });
      break;
    }

    case '/admin': {
      // Check if user is the super admin @darazzdev
      const isAuthorized =
        String(from?.id) === String(ENV.TELEGRAM_ADMIN_CHAT_ID) ||
        String(from?.id) === '8361673413' ||
        (from?.username && from.username.toLowerCase() === 'darazzdev');

      if (isAuthorized) {
        await sendTelegramMessage(chatId, '👑 <b>Admin Portal Authorized (@darazzdev)</b>\n\nAccess the store admin dashboard below:', {
          replyMarkup: {
            inline_keyboard: [
              [makeButton('⚡ Open Admin Dashboard', '/admin')]
            ]
          }
        });
      } else {
        await sendTelegramMessage(chatId, '⛔ <b>Access Denied</b>: This command is restricted to @darazzdev only.');
      }
      break;
    }

    default:
      await sendTelegramMessage(chatId, 'Use /start to open the Dara Digital Store Mini App or /help for assistance.');
      break;
  }
}
