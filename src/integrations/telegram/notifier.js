import axios from 'axios';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * Sends a message via Telegram Bot API
 */
export async function sendTelegramMessage(chatId, text, options = {}) {
  if (!ENV.TELEGRAM_BOT_TOKEN || !chatId) {
    logger.debug(`Telegram notification skipped (No token or chatId). Message: ${text.slice(0, 60)}...`);
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: options.parseMode || 'HTML',
      reply_markup: options.replyMarkup || undefined,
      disable_web_page_preview: options.disablePreview ?? true
    };

    const response = await axios.post(url, payload, { timeout: 8000 });
    return response.data?.ok === true;
  } catch (err) {
    logger.error(`Failed to send Telegram message to ${chatId}:`, err.response?.data || err.message);
    return false;
  }
}

/**
 * Notify customer upon completed digital delivery
 * Sends the purchased account, keys, or digital payload directly to the user's Telegram chat
 */
export async function notifyOrderDelivered(telegramId, order, items = [], deliveries = []) {
  if (!telegramId) {
    logger.warn(`Cannot send Telegram delivery notification: Missing telegramId for Order #${order?.order_number}`);
    return;
  }

  let deliveryDetailsText = '';
  if (deliveries && deliveries.length > 0) {
    deliveries.forEach((d, idx) => {
      const matchedItem = items?.find((it) => it.product_id === d.product_id || it.id === d.product_id) || items?.[idx];
      const itemTitle = matchedItem?.product_name || `Product Item ${idx + 1}`;
      const payload = String(d.delivery_payload || '').trim();

      deliveryDetailsText += `\n📦 <b>${escapeHtml(itemTitle)}</b>\n<code>${escapeHtml(payload)}</code>\n`;
    });
  } else {
    deliveryDetailsText = `\n📦 <i>Digital product activated in your account.</i>\n`;
  }

  const message =
    `🎉 <b>Order Delivered Successfully!</b>\n\n` +
    `🧾 <b>Order ID:</b> <code>#${escapeHtml(order.order_number)}</code>\n` +
    `💰 <b>Total Paid:</b> <b>$${Number(order.total_amount).toFixed(2)} ${escapeHtml(order.currency || 'USD')}</b>\n` +
    `⚡ <b>Delivery Status:</b> Instant Automated Delivery\n\n` +
    `🔐 <b>Your Purchased Account / Key (Tap to Copy):</b>\n` +
    deliveryDetailsText +
    `\n<i>💡 Tip: Tap the code block above to copy instantly to your clipboard.</i>\n` +
    `<i>🤖 Delivered 24/7 by @DaraDigital_bot</i>`;

  const isHttps = typeof ENV.FRONTEND_URL === 'string' && ENV.FRONTEND_URL.startsWith('https://');
  const replyMarkup = isHttps
    ? {
        inline_keyboard: [
          [
            {
              text: '📦 View in Mini App',
              web_app: { url: `${ENV.FRONTEND_URL}/orders/${order.id}` }
            },
            {
              text: '🛍️ Shop More',
              web_app: { url: ENV.FRONTEND_URL }
            }
          ]
        ]
      }
    : undefined;

  logger.info(`Sending instant digital delivery to Telegram User ${telegramId} for Order #${order.order_number}`);
  await sendTelegramMessage(telegramId, message, { replyMarkup });
}

/**
 * Notify customer upon successful balance top-up
 */
export async function notifyBalanceTopUp(telegramId, amount, newBalance) {
  if (!telegramId) return;

  const message = `💰 <b>Balance Top-Up Successful!</b>\n\n` +
    `➕ <b>Added:</b> +$${Number(amount).toFixed(2)} USD\n` +
    `💳 <b>New Wallet Balance:</b> $${Number(newBalance).toFixed(2)} USD\n` +
    `⚡ <b>Payment Method:</b> ABA KHQR Auto-Check\n\n` +
    `<i>You can now use your wallet balance to checkout instantly on Maiser Store.</i>`;

  const isHttps = typeof ENV.FRONTEND_URL === 'string' && ENV.FRONTEND_URL.startsWith('https://');
  const replyMarkup = isHttps ? {
    inline_keyboard: [
      [
        {
          text: '🛍️ Shop Now',
          web_app: { url: ENV.FRONTEND_URL }
        }
      ]
    ]
  } : undefined;

  await sendTelegramMessage(telegramId, message, { replyMarkup });
}

/**
 * Notify customer upon payment failure or cancellation
 */
export async function notifyPaymentFailed(telegramId, order, reason = 'Payment was cancelled or expired.') {
  if (!telegramId) return;

  const message = `⚠️ <b>Payment Notification</b>\n\n` +
    `Order: <code>#${order.order_number}</code>\n` +
    `Status: <b>Payment Unsuccessful</b>\n` +
    `Reason: ${escapeHtml(reason)}\n\n` +
    `If you need help, please reach out to our store support.`;

  await sendTelegramMessage(telegramId, message);
}

function formatDetailsHtml(details) {
  if (!details) return '';
  if (typeof details === 'string') return escapeHtml(details);

  const keyLabels = {
    order_number: '🧾 Order ID',
    customer: '👤 Customer',
    user: '👤 User',
    total: '💰 Total Amount',
    amount: '💵 Amount',
    new_balance: '💳 New Balance',
    items: '📦 Items',
    product: '🎮 Product',
    method: '⚡ Payment Method',
    error: '⚠️ Error'
  };

  const lines = [];
  for (const [key, val] of Object.entries(details)) {
    const label = keyLabels[key] || `• <b>${escapeHtml(key.replace(/_/g, ' ').toUpperCase())}</b>`;
    const formattedLabel = keyLabels[key] ? `<b>${label}:</b>` : label;
    
    if (key === 'order_number') {
      lines.push(`${formattedLabel} <code>#${escapeHtml(val)}</code>`);
    } else if (key === 'error') {
      lines.push(`${formattedLabel} <code>${escapeHtml(val)}</code>`);
    } else {
      lines.push(`${formattedLabel} ${escapeHtml(String(val))}`);
    }
  }

  return lines.join('\n');
}

/**
 * Notify Admin chat for key store events (New order, Stock warning, Stock error)
 */
export async function notifyAdmin(title, details) {
  if (!ENV.TELEGRAM_ADMIN_CHAT_ID && !ENV.TELEGRAM_REPORT_CHANNEL_ID) return;

  const formattedDetails = formatDetailsHtml(details);
  const message = `🔔 <b>MAISER STORE: ${escapeHtml(title)}</b>\n\n` +
    (formattedDetails ? `${formattedDetails}\n\n` : '') +
    `⏱ <i>${new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' })} (Phnom Penh)</i>`;

  const isHttps = typeof ENV.FRONTEND_URL === 'string' && ENV.FRONTEND_URL.startsWith('https://');
  const replyMarkup = isHttps ? {
    inline_keyboard: [
      [
        {
          text: '⚡ Open Admin Dashboard',
          web_app: { url: `${ENV.FRONTEND_URL}/admin` }
        }
      ]
    ]
  } : undefined;

  // 1. Post to Report Channel / Supergroup (-1003823688631)
  if (ENV.TELEGRAM_REPORT_CHANNEL_ID) {
    await sendTelegramMessage(ENV.TELEGRAM_REPORT_CHANNEL_ID, message, { replyMarkup });
  }

  // 2. Post to Admin Private Chat (7789859191)
  if (ENV.TELEGRAM_ADMIN_CHAT_ID && String(ENV.TELEGRAM_ADMIN_CHAT_ID) !== String(ENV.TELEGRAM_REPORT_CHANNEL_ID)) {
    await sendTelegramMessage(ENV.TELEGRAM_ADMIN_CHAT_ID, message, { replyMarkup });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

