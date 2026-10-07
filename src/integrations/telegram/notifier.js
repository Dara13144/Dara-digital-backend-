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
 * Parses Roblox username, display name, and player ID from order customer notes
 */
export function parseRobloxDetails(customerNotes) {
  if (!customerNotes) return null;
  const str = String(customerNotes);

  let username = null;
  let displayName = null;
  let playerId = null;

  // Pattern: "Roblox Player: DisplayName (@Username) | ID: 123456789 | Package: ..."
  const matchFull = str.match(/Roblox(?:\s+Player)?:\s*(.*?)\s*\(@([a-zA-Z0-9_]+)\)\s*\|\s*ID:\s*(\d+)/i);
  if (matchFull) {
    displayName = matchFull[1].trim();
    username = matchFull[2].trim();
    playerId = matchFull[3].trim();
  } else {
    // Pattern: "Roblox: DisplayName (@Username) | ID: 123456789"
    const matchSimple = str.match(/@([a-zA-Z0-9_]+)/);
    if (matchSimple) username = matchSimple[1].trim();

    const matchId = str.match(/ID:\s*(\d+)/i);
    if (matchId) playerId = matchId[1].trim();

    const matchPlayer = str.match(/Roblox.*?: (.*?)(\||$)/i);
    if (matchPlayer && !displayName) displayName = matchPlayer[1].replace(/@.*$/, '').trim();
  }

  return { username, displayName, playerId, raw: str };
}

/**
 * Returns package tag / badge based on GamePass title
 */
export function getGamepassBadge(productName = '') {
  const lower = productName.toLowerCase();
  if (lower.includes('2x mastery')) return '🔥 Best Seller';
  if (lower.includes('2x money')) return '⚡ Hot Deal';
  if (lower.includes('dark blade') || lower.includes('yoru')) return '🗡️ Mythical';
  if (lower.includes('fast boats') || lower.includes('luxury')) return '🌟 Popular';
  if (lower.includes('2x boss') || lower.includes('2x drops')) return '✨ Special';
  if (lower.includes('+1 fruit') || lower.includes('+1 storage')) return '💎 Best Value';
  if (lower.includes('fruit notifier') || lower.includes('notifier')) return '👑 VIP / Ultra';
  return '🎮 GamePass';
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
  const priceInKhr = Math.round(Number(totalAmount) * 4100).toLocaleString();

  const isGamepassOrder = Boolean(
    order?.customer_notes?.toLowerCase().includes('gamepass') ||
    items?.some(it => 
      (it.product_name || '').toLowerCase().includes('gamepass') ||
      (it.name || '').toLowerCase().includes('gamepass')
    )
  );

  const isTopUpOrder = isGamepassOrder || Boolean(
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

  let message = '';
  let replyMarkup = undefined;
  const isHttps = typeof ENV.FRONTEND_URL === 'string' && ENV.FRONTEND_URL.startsWith('https://');

  if (isGamepassOrder) {
    const robloxInfo = parseRobloxDetails(robloxName);
    const robloxUsername = robloxInfo?.username || (robloxInfo?.displayName ? robloxInfo.displayName : robloxName);
    const robloxId = robloxInfo?.playerId;
    const profileUrl = robloxId ? `https://www.roblox.com/users/${robloxId}/profile` : null;

    let gamepassItemsText = '';
    if (items && items.length > 0) {
      gamepassItemsText = items.map(it => {
        const title = it.product_name || it.name || 'Blox Fruits GamePass';
        const badge = getGamepassBadge(title);
        const qty = it.quantity || 1;
        const itemPrice = Number(it.unit_price || it.price || totalAmount).toFixed(2);
        const itemKhr = Math.round(Number(itemPrice) * 4100).toLocaleString();
        return `🎮 <b>${escapeHtml(title)}</b> (x${qty})\n` +
               `   • 🏷️ <b>Badge / Tag:</b> <code>[${badge}]</code>\n` +
               `   • 💵 <b>Package Price:</b> $${itemPrice} USD (≈ ${itemKhr} ៛)\n` +
               `   • ⏱️ <b>Delivery Window:</b> 1h - 24h`;
      }).join('\n\n');
    } else {
      gamepassItemsText = `🎮 <b>Blox Fruits GamePass</b>\n   • 🏷️ <b>Tag:</b> <code>[🎮 GamePass]</code>`;
    }

    message =
      `🎮 <b>GAMEPASS TOP-UP ORDER SUCCESSFUL!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🧾 <b>GamePass Order ID:</b> <code>#${escapeHtml(order?.order_number || payment?.transaction_id)}</code>\n` +
      `👤 <b>Customer:</b> ${escapeHtml(customerName)}\n` +
      `💰 <b>Total Paid:</b> <b>$${totalAmount} USD</b> (≈ ${priceInKhr} ៛)\n` +
      `⚡ <b>Payment Method:</b> ${escapeHtml(paymentMethod)}\n` +
      `⏱️ <b>Delivery Window:</b> <b>1 Hour - 24 Hours (1h - 24h)</b> <i>[១ ម៉ោង - ២៤ ម៉ោង]</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 <b>ROBLOX TARGET PLAYER:</b>\n` +
      (robloxUsername ? `👤 <b>Username:</b> <code>@${escapeHtml(robloxUsername)}</code>\n` : '') +
      (robloxInfo?.displayName ? `🏷️ <b>Display Name:</b> <code>${escapeHtml(robloxInfo.displayName)}</code>\n` : '') +
      (robloxId ? `🆔 <b>Player ID:</b> <code>${escapeHtml(robloxId)}</code>\n` : '') +
      (profileUrl ? `🔗 <b>Profile Link:</b> <a href="${profileUrl}">View Roblox Profile</a>\n` : '') +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🛍️ <b>PURCHASED GAMEPASS ITEM:</b>\n` +
      `${gamepassItemsText}\n\n` +
      `⏳ <b>Status:</b> <i>Payment confirmed. GamePass gift/trade scheduled. Delivery completed within 1 - 24 hours.</i>\n\n` +
      `👉 <b>STORE ADMIN ACTION:</b>\n` +
      `<i>Please deliver/gift this GamePass to @${escapeHtml(robloxUsername || 'target player')} on Roblox.</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏱ <i>${new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' })} (Phnom Penh)</i>\n` +
      `🤖 <i>Auto-reported by @Maiser_report_bot</i>`;

    const buttons = [];
    if (profileUrl) {
      buttons.push({ text: '🎮 Open Roblox Profile', url: profileUrl });
    }
    if (isHttps) {
      buttons.push({ text: '⚡ Open Store', web_app: { url: ENV.FRONTEND_URL } });
    }
    if (buttons.length > 0) {
      replyMarkup = { inline_keyboard: [buttons] };
    }
  } else {
    const headerTitle = isTopUpOrder
      ? `⚡ <b>USER TOP-UP SUCCESSFUL!</b>`
      : `🎉 <b>Payment Done & Order Delivered!</b>`;

    const deliveryWindowLine = isTopUpOrder
      ? `⚡ <b>Delivery Speed:</b> Instant Automated Delivery\n`
      : `⚡ <b>Delivery Speed:</b> Instant Automated Delivery\n`;

    message =
      `${headerTitle}\n\n` +
      `🧾 <b>${isTopUpOrder ? 'Top-Up Order ID' : 'Order ID'}:</b> <code>#${escapeHtml(order?.order_number || payment?.transaction_id)}</code>\n` +
      `👤 <b>Customer:</b> ${escapeHtml(customerName)}\n` +
      (robloxName ? `🎮 <b>Roblox / Player ID:</b> <code>${escapeHtml(robloxName)}</code>\n` : '') +
      `💰 <b>Total Paid:</b> <b>$${totalAmount} ${escapeHtml(currency)}</b> (≈ ${priceInKhr} ៛)\n` +
      `⚡ <b>Payment Method:</b> ${escapeHtml(paymentMethod)}\n` +
      deliveryWindowLine +
      `\n🛍️ <b>${isTopUpOrder ? 'Top-Up Package' : 'Items'}:</b>\n${itemsText}\n` +
      (deliveryDetailsText ? `\n🔐 <b>Instant Delivery (Tap to Copy):</b>${deliveryDetailsText}\n` : '') +
      `\n⏱ <i>${new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' })} (Phnom Penh)</i>\n` +
      `🤖 <i>Delivered automatically by @Maiser_report_bot</i>`;

    if (isHttps) {
      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '⚡ Open Store',
              web_app: { url: ENV.FRONTEND_URL }
            }
          ]
        ]
      };
    }
  }

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

  const isGamepass = Boolean(
    order?.customer_notes?.toLowerCase().includes('gamepass') ||
    items?.some(it => (it.product_name || '').toLowerCase().includes('gamepass') || (it.name || '').toLowerCase().includes('gamepass'))
  );

  const deliveryStatusText = isGamepass
    ? 'GamePass Delivery Window: 1 - 24 Hours (១ ម៉ោង - ២៤ ម៉ោង)'
    : 'Instant Automated Delivery';

  let gamepassItemsList = '';
  if (isGamepass && items && items.length > 0) {
    gamepassItemsList = items.map(it => {
      const title = it.product_name || it.name || 'GamePass Package';
      const badge = getGamepassBadge(title);
      return `• 🎮 <b>${escapeHtml(title)}</b> <code>[${badge}]</code> (x${it.quantity || 1})`;
    }).join('\n');
  }

  const message =
    `🎉 <b>${isGamepass ? 'GamePass Order Confirmed!' : 'Order Delivered Successfully!'}</b>\n\n` +
    `🧾 <b>Order ID:</b> <code>#${escapeHtml(order.order_number)}</code>\n` +
    `💰 <b>Total Paid:</b> <b>$${Number(order.total_amount).toFixed(2)} ${escapeHtml(order.currency || 'USD')}</b>\n` +
    `⏱️ <b>Delivery Status:</b> ${deliveryStatusText}\n` +
    (isGamepass && gamepassItemsList ? `\n🛍️ <b>GamePass Package:</b>\n${gamepassItemsList}\n` : '') +
    (isGamepass ? `\n🎮 <b>Roblox Target:</b> <code>${escapeHtml(order.customer_notes || 'Verified Player')}</code>\n` : '') +
    (isGamepass 
      ? `⏳ <i>Your GamePass will be gifted/transferred to your Roblox account within 1 to 24 hours. Check your Roblox inventory / trades.</i>\n`
      : `🔐 <b>Your Purchased Account / Key (Tap to Copy):</b>\n${deliveryDetailsText}\n`) +
    `\n<i>💡 Need support? Contact @rybunrak 24/7</i>\n` +
    `<i>🤖 Processed automatically by @Maiser_report_bot</i>`;

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
