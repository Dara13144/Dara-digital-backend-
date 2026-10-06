import axios from 'axios';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';

// In-memory deduplication cache to guarantee exactly-once Telegram notifications
const processedNotifications = new Set();

export function isNotificationAlreadySent(key) {
  if (!key) return false;
  return processedNotifications.has(String(key));
}

export function markNotificationSent(key) {
  if (!key) return;
  processedNotifications.add(String(key));
  // Keep set bounded to avoid unbounded memory growth
  if (processedNotifications.size > 5000) {
    const firstKey = processedNotifications.values().next().value;
    processedNotifications.delete(firstKey);
  }
}

/**
 * Gets the single primary destination for store reports / bot notifications
 */
export function getReportChatId() {
  return ENV.TELEGRAM_REPORT_CHANNEL_ID || ENV.TELEGRAM_ADMIN_CHAT_ID || null;
}

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
 * Send EXACTLY ONE notification message on Telegram when a user payment is done.
 * Deduplicates automatically across order/payment ID.
 */
export async function notifyPaymentCompleted({
  order,
  items = [],
  deliveries = [],
  user = null,
  paymentMethod = 'ABA KHQR (Bakong)',
  payment = null
}) {
  const dedupKey = `order_payment_done_${order?.id || payment?.id || order?.order_number}`;
  if (isNotificationAlreadySent(dedupKey)) {
    logger.info(`[Telegram] Skipped duplicate payment notification for ${dedupKey}`);
    return false;
  }
  markNotificationSent(dedupKey);

  // Digital accounts / keys delivery text
  let deliveryDetailsText = '';
  if (deliveries && deliveries.length > 0) {
    deliveries.forEach((d, idx) => {
      const matchedItem = items?.find((it) => it.product_id === d.product_id || it.id === d.product_id) || items?.[idx];
      const itemTitle = matchedItem?.product_name || `Product Item ${idx + 1}`;
      const payload = String(d.delivery_payload || '').trim();
      deliveryDetailsText += `\n📦 <b>${escapeHtml(itemTitle)}:</b>\n<code>${escapeHtml(payload)}</code>`;
    });
  }

  // Purchased items summary
  const itemsText = items && items.length > 0
    ? items.map(it => `• ${escapeHtml(it.product_name || it.name || 'Product')} (x${it.quantity || 1})`).join('\n')
    : 'Digital Products';

  const customerName = user?.email || (user?.username ? `@${user.username}` : user?.first_name || 'Customer');
  const robloxName = order?.customer_notes || user?.roblox_username || null;
  const totalAmount = Number(order?.total_amount || payment?.amount || 0).toFixed(2);
  const currency = order?.currency || payment?.currency || 'USD';

  const isTopUpOrder = Boolean(
    order?.customer_notes?.toLowerCase().includes('roblox') ||
    order?.customer_notes?.toLowerCase().includes('topup') ||
    order?.customer_notes?.toLowerCase().includes('player') ||
    items?.some(it => 
      (it.product_name || '').toLowerCase().includes('top-up') || 
      (it.product_name || '').toLowerCase().includes('topup') ||
      (it.product_name || '').toLowerCase().includes('robux') ||
      (it.product_name || '').toLowerCase().includes('blox') ||
      it.stock_type === 'manual'
    )
  );

  const headerTitle = isTopUpOrder
    ? `⚡ <b>USER TOP-UP SUCCESSFUL!</b>`
    : `🎉 <b>Payment Done & Order Delivered!</b>`;

  // Consolidated single Telegram message
  const message =
    `${headerTitle}\n\n` +
    `🧾 <b>${isTopUpOrder ? 'Top-Up Order ID' : 'Order ID'}:</b> <code>#${escapeHtml(order?.order_number || payment?.transaction_id)}</code>\n` +
    `👤 <b>Customer:</b> ${escapeHtml(customerName)}\n` +
    (robloxName ? `🎮 <b>Roblox / Player ID:</b> <code>${escapeHtml(robloxName)}</code>\n` : '') +
    `💰 <b>Total Paid:</b> <b>$${totalAmount} ${escapeHtml(currency)}</b>\n` +
    `⚡ <b>Payment Method:</b> ${escapeHtml(paymentMethod)}\n\n` +
    `🛍️ <b>${isTopUpOrder ? 'Top-Up Package' : 'Items'}:</b>\n${itemsText}\n` +
    (deliveryDetailsText ? `\n🔐 <b>Instant Delivery (Tap to Copy):</b>${deliveryDetailsText}\n` : '') +
    `\n⏱ <i>${new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' })} (Phnom Penh)</i>\n` +
    `🤖 <i>Delivered automatically by @Maiser_report_bot</i>`;

  const isHttps = typeof ENV.FRONTEND_URL === 'string' && ENV.FRONTEND_URL.startsWith('https://');
  const replyMarkup = isHttps
    ? {
        inline_keyboard: [
          [
            {
              text: '⚡ Open Store',
              web_app: { url: ENV.FRONTEND_URL }
            }
          ]
        ]
      }
    : undefined;

  // 1. Send strictly ONE message to Telegram Group / Channel
  if (ENV.TELEGRAM_REPORT_CHANNEL_ID) {
    logger.info(`[Telegram] Sending 1 notification to Group (${ENV.TELEGRAM_REPORT_CHANNEL_ID}) for Order #${order?.order_number}`);
    await sendTelegramMessage(ENV.TELEGRAM_REPORT_CHANNEL_ID, message, { replyMarkup });
  }

  // 2. Send strictly ONE message to Telegram Bot / Admin Chat
  if (ENV.TELEGRAM_ADMIN_CHAT_ID && String(ENV.TELEGRAM_ADMIN_CHAT_ID) !== String(ENV.TELEGRAM_REPORT_CHANNEL_ID)) {
    logger.info(`[Telegram] Sending 1 notification to Bot (${ENV.TELEGRAM_ADMIN_CHAT_ID}) for Order #${order?.order_number}`);
    await sendTelegramMessage(ENV.TELEGRAM_ADMIN_CHAT_ID, message, { replyMarkup });
  }

  // 3. If customer is an authenticated Telegram Mini App user (with a distinct ID from bot/group),
  // send their personal delivery receipt directly to their chat
  const customerTelegramId = user?.telegram_id;
  if (customerTelegramId && 
      String(customerTelegramId) !== String(ENV.TELEGRAM_REPORT_CHANNEL_ID) && 
      String(customerTelegramId) !== String(ENV.TELEGRAM_ADMIN_CHAT_ID)) {
    await notifyOrderDelivered(customerTelegramId, order, items, deliveries);
  }

  return true;
}

/**
 * Send EXACTLY ONE notification message on Telegram when wallet balance top-up is completed
 */
export async function notifyWalletTopUpCompleted({
  user,
  amount,
  newBalance,
  payment
}) {
  const dedupKey = `wallet_topup_done_${payment?.id || payment?.transaction_id}`;
  if (isNotificationAlreadySent(dedupKey)) {
    logger.info(`[Telegram] Skipped duplicate wallet top-up notification for ${dedupKey}`);
    return false;
  }
  markNotificationSent(dedupKey);

  const customerName = user?.email || (user?.username ? `@${user.username}` : user?.first_name || 'Customer');
  const message =
    `💰 <b>USER TOP-UP SUCCESSFUL (WALLET)!</b>\n\n` +
    `👤 <b>Customer / User:</b> ${escapeHtml(customerName)}\n` +
    `➕ <b>Top-Up Amount:</b> <b>+$${Number(amount).toFixed(2)} USD</b>\n` +
    `💳 <b>New Wallet Balance:</b> <b>$${Number(newBalance).toFixed(2)} USD</b>\n` +
    `⚡ <b>Payment Method:</b> ABA KHQR (Bakong)\n\n` +
    `⏱ <i>${new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' })} (Phnom Penh)</i>\n` +
    `🤖 <i>Processed automatically by @Maiser_report_bot</i>`;

  // 1. Send strictly ONE message to Telegram Group / Channel
  if (ENV.TELEGRAM_REPORT_CHANNEL_ID) {
    await sendTelegramMessage(ENV.TELEGRAM_REPORT_CHANNEL_ID, message);
  }

  // 2. Send strictly ONE message to Telegram Bot / Admin Chat
  if (ENV.TELEGRAM_ADMIN_CHAT_ID && String(ENV.TELEGRAM_ADMIN_CHAT_ID) !== String(ENV.TELEGRAM_REPORT_CHANNEL_ID)) {
    await sendTelegramMessage(ENV.TELEGRAM_ADMIN_CHAT_ID, message);
  }

  // 3. If customer has personal Telegram ID distinct from bot/group
  if (user?.telegram_id && 
      String(user.telegram_id) !== String(ENV.TELEGRAM_REPORT_CHANNEL_ID) && 
      String(user.telegram_id) !== String(ENV.TELEGRAM_ADMIN_CHAT_ID)) {
    await notifyBalanceTopUp(user.telegram_id, amount, newBalance);
  }

  return true;
}

/**
 * Notify customer upon completed digital delivery
 */
export async function notifyOrderDelivered(telegramId, order, items = [], deliveries = []) {
  if (!telegramId) return;

  const dedupKey = `order_delivery_${telegramId}_${order?.id || order?.order_number}`;
  if (isNotificationAlreadySent(dedupKey)) {
    logger.info(`[Telegram] Skipped duplicate delivery slip for ${dedupKey}`);
    return;
  }
  markNotificationSent(dedupKey);

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
    `<i>🤖 Delivered 24/7 by @Maiser_report_bot</i>`;

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

  await sendTelegramMessage(telegramId, message, { replyMarkup });
}

/**
 * Notify customer upon successful balance top-up
 */
export async function notifyBalanceTopUp(telegramId, amount, newBalance) {
  if (!telegramId) return;

  const dedupKey = `customer_topup_${telegramId}_${amount}_${newBalance}`;
  if (isNotificationAlreadySent(dedupKey)) return;
  markNotificationSent(dedupKey);

  const message = `💰 <b>Balance Top-Up Successful!</b>\n\n` +
    `➕ <b>Added:</b> +$${Number(amount).toFixed(2)} USD\n` +
    `💳 <b>New Wallet Balance:</b> $${Number(newBalance).toFixed(2)} USD\n` +
    `⚡ <b>Payment Method:</b> ABA KHQR Auto-Check\n\n` +
    `<i>You can now use your wallet balance to checkout instantly on Maiser Store.</i>`;

  await sendTelegramMessage(telegramId, message);
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
 * Notify Admin chat for store alerts (Stock warning, Critical errors)
 * Sends to ONLY ONE destination (Report channel or Admin chat)
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

  // 1. Send strictly ONE message to Telegram Group / Channel
  if (ENV.TELEGRAM_REPORT_CHANNEL_ID) {
    await sendTelegramMessage(ENV.TELEGRAM_REPORT_CHANNEL_ID, message, { replyMarkup });
  }

  // 2. Send strictly ONE message to Telegram Bot / Admin Chat
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
