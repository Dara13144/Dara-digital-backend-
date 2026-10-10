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
 * Gets the primary report destination
 */
export function getReportChatId() {
  return ENV.TELEGRAM_REPORT_CHANNEL_ID || ENV.TELEGRAM_ADMIN_CHAT_ID || null;
}

/**
 * Helper to escape HTML characters in Telegram messages
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sends a message via Telegram Bot API to a specific Chat ID
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
 * BROADCAST MESSAGE TO BOTH TELEGRAM GROUP AND TELEGRAM BOT (ADMIN CHAT)
 */
export async function broadcastToTelegram(text, options = {}) {
  const results = { group: false, admin: false };

  // 1. Send to Telegram Group / Channel
  if (ENV.TELEGRAM_REPORT_CHANNEL_ID) {
    results.group = await sendTelegramMessage(ENV.TELEGRAM_REPORT_CHANNEL_ID, text, options);
  }

  // 2. Send to Telegram Bot / Admin Private Chat
  if (ENV.TELEGRAM_ADMIN_CHAT_ID && String(ENV.TELEGRAM_ADMIN_CHAT_ID) !== String(ENV.TELEGRAM_REPORT_CHANNEL_ID)) {
    results.admin = await sendTelegramMessage(ENV.TELEGRAM_ADMIN_CHAT_ID, text, options);
  }

  return results;
}

/**
 * Helper to get current Phnom Penh formatted time
 */
function getPhnomPenhTime() {
  return new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' });
}

/**
 * Parses Roblox username, display name, and player ID from customer notes
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
 * Comprehensive customer username and identity resolver
 * Guarantees that the username of the user is always clearly extracted & formatted.
 */
export function formatCustomerIdentity(user, order = null) {
  if (!user && !order) {
    return {
      usernameTag: '@customer',
      usernameOnly: 'customer',
      displayName: 'Customer',
      email: null,
      telegramId: null,
      robloxUsername: null,
      summaryLine: '👤 <b>Customer Username:</b> <code>@customer</code>'
    };
  }

  // 1. Raw user account username
  let rawUsername = user?.username ? String(user.username).trim() : null;
  if (rawUsername) {
    rawUsername = rawUsername.replace(/^@+/, '');
  } else if (user?.email) {
    rawUsername = String(user.email).split('@')[0].trim();
  }

  // 2. Roblox player username if available
  const robloxInfo = parseRobloxDetails(order?.customer_notes || user?.roblox_username);
  const robloxUsername = robloxInfo?.username ? robloxInfo.username.replace(/^@+/, '') : (user?.roblox_username ? String(user.roblox_username).replace(/^@+/, '') : null);

  // 3. Fallback
  if (!rawUsername) {
    if (robloxUsername) {
      rawUsername = robloxUsername;
    } else if (user?.first_name) {
      rawUsername = user.first_name.replace(/\s+/g, '_').toLowerCase();
    } else {
      rawUsername = 'customer';
    }
  }

  const usernameTag = `@${rawUsername}`;
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.name || null;
  const email = user?.email || null;
  const telegramId = user?.telegram_id ? String(user.telegram_id) : null;

  // Build prominent summary line
  let summaryLine = `👤 <b>Customer Username:</b> <b>${escapeHtml(usernameTag)}</b>`;
  if (displayName && displayName.toLowerCase() !== rawUsername.toLowerCase()) {
    summaryLine += ` (<i>${escapeHtml(displayName)}</i>)`;
  }

  return {
    usernameTag,
    usernameOnly: rawUsername,
    displayName,
    email,
    telegramId,
    robloxUsername,
    robloxInfo,
    summaryLine
  };
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
 * Helper to build common inline button markup
 */
function buildStoreButtons(orderId = null, extraUrl = null) {
  const isHttps = typeof ENV.FRONTEND_URL === 'string' && ENV.FRONTEND_URL.startsWith('https://');
  const buttons = [];

  if (extraUrl) {
    buttons.push({ text: '🎮 Roblox Profile', url: extraUrl });
  }

  if (isHttps) {
    if (orderId) {
      buttons.push({ text: '📦 View Order', web_app: { url: `${ENV.FRONTEND_URL}/orders/${orderId}` } });
    }
    buttons.push({ text: '⚡ Open Store', web_app: { url: ENV.FRONTEND_URL } });
  }

  return buttons.length > 0 ? { inline_keyboard: [buttons] } : undefined;
}

// ============================================================================
// 1. ORDER CREATED (NEW PENDING CHECKOUT ON WEBSITE)
// ============================================================================
export async function notifyOrderCreated({ order, user, items = [], paymentMethod = 'ABA PayWay' }) {
  const dedupKey = `order_created_${order?.id || order?.order_number}`;
  if (isNotificationAlreadySent(dedupKey)) return false;
  markNotificationSent(dedupKey);

  const identity = formatCustomerIdentity(user, order);
  const totalAmount = Number(order?.total_amount || 0).toFixed(2);
  const currency = order?.currency || 'USD';
  const priceInKhr = Math.round(Number(totalAmount) * 4100).toLocaleString();

  const itemsText = items && items.length > 0
    ? items.map(it => `• ${escapeHtml(it.product_name || it.name || 'Product')} (x${it.quantity || 1}) - $${Number(it.unit_price || it.price || 0).toFixed(2)}`).join('\n')
    : '• Digital Items';

  const message =
    `🛒 <b>NEW ORDER CREATED (PENDING PAYMENT)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧾 <b>Order ID:</b> <code>#${escapeHtml(order?.order_number)}</code>\n` +
    `${identity.summaryLine}\n` +
    (identity.email ? `📧 <b>Email:</b> <code>${escapeHtml(identity.email)}</code>\n` : '') +
    (identity.telegramId ? `🆔 <b>Telegram ID:</b> <code>${escapeHtml(identity.telegramId)}</code>\n` : '') +
    (identity.robloxUsername ? `🎮 <b>Roblox Target Player:</b> <code>@${escapeHtml(identity.robloxUsername)}</code>\n` : '') +
    `💰 <b>Amount:</b> <b>$${totalAmount} ${escapeHtml(currency)}</b> (≈ ${priceInKhr} ៛)\n` +
    `⚡ <b>Payment Method:</b> ${escapeHtml(paymentMethod)}\n` +
    `⏳ <b>Status:</b> <i>Pending Customer Payment (QR Generated)</i>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛍️ <b>Cart Items:</b>\n${itemsText}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱ <i>${getPhnomPenhTime()} (Phnom Penh)</i>\n` +
    `🤖 <i>Maiser Store Website Monitor</i>`;

  const replyMarkup = buildStoreButtons(order?.id);
  await broadcastToTelegram(message, { replyMarkup });
  return true;
}

// ============================================================================
// 2. ORDER PAYMENT COMPLETED & DELIVERED
// ============================================================================
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

  const identity = formatCustomerIdentity(user, order);

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

  const itemsText = items && items.length > 0
    ? items.map(it => `• ${escapeHtml(it.product_name || it.name || 'Product')} (x${it.quantity || 1})`).join('\n')
    : 'Digital Products';

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
  let profileUrl = null;

  if (isGamepassOrder) {
    const robloxInfo = identity.robloxInfo;
    const robloxUsername = identity.robloxUsername || robloxInfo?.username || identity.usernameOnly;
    const robloxId = robloxInfo?.playerId;
    profileUrl = robloxId ? `https://www.roblox.com/users/${robloxId}/profile` : null;

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
      `${identity.summaryLine}\n` +
      (identity.email ? `📧 <b>Email:</b> <code>${escapeHtml(identity.email)}</code>\n` : '') +
      `💰 <b>Total Paid:</b> <b>$${totalAmount} USD</b> (≈ ${priceInKhr} ៛)\n` +
      `⚡ <b>Payment Method:</b> ${escapeHtml(paymentMethod)}\n` +
      `⏱️ <b>Delivery Window:</b> <b>1 Hour - 24 Hours (1h - 24h)</b> <i>[១ ម៉ោង - ២៤ ម៉ោង]</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 <b>ROBLOX TARGET PLAYER:</b>\n` +
      `👤 <b>Roblox Username:</b> <code>@${escapeHtml(robloxUsername)}</code>\n` +
      (robloxInfo?.displayName ? `🏷️ <b>Display Name:</b> <code>${escapeHtml(robloxInfo.displayName)}</code>\n` : '') +
      (robloxId ? `🆔 <b>Player ID:</b> <code>${escapeHtml(robloxId)}</code>\n` : '') +
      (profileUrl ? `🔗 <b>Profile Link:</b> <a href="${profileUrl}">View Roblox Profile</a>\n` : '') +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🛍️ <b>PURCHASED GAMEPASS ITEM:</b>\n` +
      `${gamepassItemsText}\n\n` +
      `⏳ <b>Status:</b> <i>Payment confirmed. GamePass gift/trade scheduled. Delivery completed within 1 - 24 hours.</i>\n\n` +
      `👉 <b>STORE ADMIN ACTION:</b>\n` +
      `<i>Please deliver/gift this GamePass to @${escapeHtml(robloxUsername)} on Roblox.</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏱ <i>${getPhnomPenhTime()} (Phnom Penh)</i>\n` +
      `🤖 <i>Auto-reported by @Maiser_report_bot</i>`;
  } else {
    const headerTitle = isTopUpOrder
      ? `⚡ <b>USER TOP-UP SUCCESSFUL!</b>`
      : `🎉 <b>ORDER PAYMENT SUCCESSFUL!</b>`;

    message =
      `${headerTitle}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🧾 <b>${isTopUpOrder ? 'Top-Up Order ID' : 'Order ID'}:</b> <code>#${escapeHtml(order?.order_number || payment?.transaction_id)}</code>\n` +
      `${identity.summaryLine}\n` +
      (identity.email ? `📧 <b>Email:</b> <code>${escapeHtml(identity.email)}</code>\n` : '') +
      (identity.telegramId ? `🆔 <b>Telegram ID:</b> <code>${escapeHtml(identity.telegramId)}</code>\n` : '') +
      (identity.robloxUsername ? `🎮 <b>Roblox Player / ID:</b> <code>@${escapeHtml(identity.robloxUsername)}</code>\n` : '') +
      `💰 <b>Total Paid:</b> <b>$${totalAmount} ${escapeHtml(currency)}</b> (≈ ${priceInKhr} ៛)\n` +
      `⚡ <b>Payment Method:</b> ${escapeHtml(paymentMethod)}\n` +
      `⚡ <b>Delivery Speed:</b> Instant Automated Delivery\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🛍️ <b>${isTopUpOrder ? 'Top-Up Package' : 'Purchased Items'}:</b>\n${itemsText}\n` +
      (deliveryDetailsText ? `\n🔐 <b>Instant Delivery (Tap to Copy):</b>${deliveryDetailsText}\n` : '') +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏱ <i>${getPhnomPenhTime()} (Phnom Penh)</i>\n` +
      `🤖 <i>Auto-reported by @Maiser_report_bot</i>`;
  }

  const replyMarkup = buildStoreButtons(order?.id, profileUrl);

  // Broadcast to BOTH Telegram Group and Telegram Bot (Admin Chat)
  await broadcastToTelegram(message, { replyMarkup });

  // Direct personal delivery receipt to customer if distinct Telegram user
  const customerTelegramId = user?.telegram_id;
  if (
    customerTelegramId &&
    String(customerTelegramId) !== String(ENV.TELEGRAM_REPORT_CHANNEL_ID) &&
    String(customerTelegramId) !== String(ENV.TELEGRAM_ADMIN_CHAT_ID)
  ) {
    await notifyOrderDelivered(customerTelegramId, order, items, deliveries);
  }

  return true;
}

// ============================================================================
// 3. PAYMENT FAILED / CANCELLED
// ============================================================================
export async function notifyPaymentFailed({ order, reason = 'Payment expired or cancelled', user = null, paymentMethod = 'ABA KHQR' }) {
  const dedupKey = `payment_failed_${order?.id || order?.order_number}`;
  if (isNotificationAlreadySent(dedupKey)) return false;
  markNotificationSent(dedupKey);

  const identity = formatCustomerIdentity(user, order);
  const amount = Number(order?.total_amount || 0).toFixed(2);

  const message =
    `⚠️ <b>PAYMENT FAILED / CANCELLED</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧾 <b>Order ID:</b> <code>#${escapeHtml(order?.order_number)}</code>\n` +
    `${identity.summaryLine}\n` +
    (identity.email ? `📧 <b>Email:</b> <code>${escapeHtml(identity.email)}</code>\n` : '') +
    `💵 <b>Amount:</b> $${amount} USD\n` +
    `⚡ <b>Gateway:</b> ${escapeHtml(paymentMethod)}\n` +
    `❌ <b>Reason:</b> <code>${escapeHtml(reason)}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱ <i>${getPhnomPenhTime()} (Phnom Penh)</i>\n` +
    `🤖 <i>Maiser Store System Monitor</i>`;

  await broadcastToTelegram(message);

  if (user?.telegram_id) {
    await sendTelegramMessage(user.telegram_id, `⚠️ <b>Payment Notification:</b> Order #${order?.order_number} was cancelled or expired.`);
  }

  return true;
}

// ============================================================================
// 4. WALLET TOP-UP INITIATED & COMPLETED
// ============================================================================
export async function notifyWalletTopUpInitiated({ user, amount, method = 'ABA KHQR', payment = null }) {
  const dedupKey = `wallet_topup_init_${payment?.id || payment?.transaction_id || Date.now()}`;
  if (isNotificationAlreadySent(dedupKey)) return false;
  markNotificationSent(dedupKey);

  const identity = formatCustomerIdentity(user);

  const message =
    `💳 <b>WALLET TOP-UP INITIATED (KHQR GENERATED)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${identity.summaryLine}\n` +
    (identity.email ? `📧 <b>Email:</b> <code>${escapeHtml(identity.email)}</code>\n` : '') +
    (identity.telegramId ? `🆔 <b>Telegram ID:</b> <code>${escapeHtml(identity.telegramId)}</code>\n` : '') +
    `➕ <b>Pending Amount:</b> <b>+$${Number(amount).toFixed(2)} USD</b>\n` +
    `⚡ <b>Method:</b> ${escapeHtml(method)}\n` +
    `⏳ <b>Status:</b> <i>Awaiting QR Scan & Bakong Confirmation</i>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱ <i>${getPhnomPenhTime()} (Phnom Penh)</i>`;

  await broadcastToTelegram(message);
  return true;
}

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

  const identity = formatCustomerIdentity(user);

  const message =
    `💰 <b>USER TOP-UP SUCCESSFUL (WALLET)!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${identity.summaryLine}\n` +
    (identity.email ? `📧 <b>Email:</b> <code>${escapeHtml(identity.email)}</code>\n` : '') +
    (identity.telegramId ? `🆔 <b>Telegram ID:</b> <code>${escapeHtml(identity.telegramId)}</code>\n` : '') +
    `➕ <b>Top-Up Amount:</b> <b>+$${Number(amount).toFixed(2)} USD</b>\n` +
    `💳 <b>New Wallet Balance:</b> <b>$${Number(newBalance).toFixed(2)} USD</b>\n` +
    `⚡ <b>Payment Method:</b> ABA KHQR (Bakong)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱ <i>${getPhnomPenhTime()} (Phnom Penh)</i>\n` +
    `🤖 <i>Auto-reported by @Maiser_report_bot</i>`;

  // Broadcast to Group and Bot
  await broadcastToTelegram(message);

  // Direct notification to customer if distinct Telegram ID
  if (
    user?.telegram_id &&
    String(user.telegram_id) !== String(ENV.TELEGRAM_REPORT_CHANNEL_ID) &&
    String(user.telegram_id) !== String(ENV.TELEGRAM_ADMIN_CHAT_ID)
  ) {
    await notifyBalanceTopUp(user.telegram_id, amount, newBalance);
  }

  return true;
}

// ============================================================================
// 5. USER REGISTRATION / SIGN-IN
// ============================================================================
const recentUserAuthSet = new Map();

export async function notifyUserAuth({ user, method = 'Google OAuth', isNewUser = false }) {
  if (!user || !user.id) return false;

  const now = Date.now();
  const lastAuth = recentUserAuthSet.get(user.id);
  // Throttle repeated sign-ins for same user to once every 15 minutes
  if (lastAuth && now - lastAuth < 15 * 60 * 1000 && !isNewUser) {
    return false;
  }
  recentUserAuthSet.set(user.id, now);

  const identity = formatCustomerIdentity(user);
  const roleBadges = Array.isArray(user.roles) ? user.roles.join(', ') : 'USER';
  const icon = isNewUser ? '🎉' : '👤';
  const title = isNewUser ? 'NEW USER REGISTRATION' : 'USER SIGNED IN';

  const message =
    `${icon} <b>${title}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${identity.summaryLine}\n` +
    `👤 <b>Username:</b> <code>${escapeHtml(identity.usernameTag)}</code>\n` +
    (user.email ? `📧 <b>Email:</b> <code>${escapeHtml(user.email)}</code>\n` : '') +
    (user.telegram_id ? `🆔 <b>Telegram ID:</b> <code>${escapeHtml(user.telegram_id)}</code>\n` : '') +
    `🔑 <b>Auth Method:</b> ${escapeHtml(method)}\n` +
    `🛡️ <b>Roles:</b> <code>[${escapeHtml(roleBadges)}]</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱ <i>${getPhnomPenhTime()} (Phnom Penh)</i>\n` +
    `🤖 <i>Maiser Store Security Watcher</i>`;

  await broadcastToTelegram(message);
  return true;
}

// ============================================================================
// 6. INVENTORY RESTOCKED & LOW STOCK ALERTS
// ============================================================================
export async function notifyStockAdded({ product, count = 1, stockType = 'code', adminUser = null }) {
  const adminIdentity = formatCustomerIdentity(adminUser);
  const message =
    `📦 <b>INVENTORY RESTOCKED</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎮 <b>Product:</b> <b>${escapeHtml(product?.name || 'Digital Item')}</b>\n` +
    `➕ <b>Added Count:</b> <b>+${count} item(s)</b>\n` +
    `🏷️ <b>Stock Format:</b> <code>${escapeHtml(stockType)}</code>\n` +
    `👤 <b>Restocked By (Admin Username):</b> <b>${escapeHtml(adminIdentity.usernameTag)}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱ <i>${getPhnomPenhTime()} (Phnom Penh)</i>`;

  await broadcastToTelegram(message);
  return true;
}

export async function notifyLowStock({ product, remainingCount = 0 }) {
  const nameLower = (product?.name || '').toLowerCase();
  const catSlug = (product?.category?.slug || '').toLowerCase();
  const isGamepassOrRobux =
    product?.stock_type === 'manual' ||
    catSlug === 'gamepass' ||
    catSlug === 'topup' ||
    catSlug === 'robux' ||
    nameLower.includes('gamepass') ||
    nameLower.includes('permanent') ||
    nameLower.includes('top-up') ||
    nameLower.includes('topup') ||
    nameLower.includes('robux') ||
    nameLower.includes('r$') ||
    nameLower.includes('fruit') ||
    nameLower.includes('blox');

  // GamePass, Robux & manual products are delivered on-demand and NEVER run out of stock
  if (isGamepassOrRobux) {
    return false;
  }

  const dedupKey = `low_stock_${product?.id}_${remainingCount}`;
  if (isNotificationAlreadySent(dedupKey)) return false;
  markNotificationSent(dedupKey);

  const isOutOfStock = remainingCount <= 0;
  const icon = isOutOfStock ? '🚨' : '⚠️';
  const title = isOutOfStock ? 'OUT OF STOCK ALERT!' : 'LOW STOCK WARNING!';

  const message =
    `${icon} <b>${title}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎮 <b>Product:</b> <b>${escapeHtml(product?.name || 'Product')}</b>\n` +
    `📊 <b>Remaining Available:</b> <b>${remainingCount} item(s)</b>\n` +
    `⚠️ <b>Action Required:</b> ${isOutOfStock ? 'Product cannot be purchased. Please restock immediately!' : 'Stock is running low. Please replenish keys/accounts.'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱ <i>${getPhnomPenhTime()} (Phnom Penh)</i>`;

  await broadcastToTelegram(message);
  return true;
}

// ============================================================================
// 7. ADMIN ACTIONS & GENERAL ALERTS
// ============================================================================
export async function notifyAdminAction({ action, target, details = {}, adminUser = null }) {
  const adminIdentity = formatCustomerIdentity(adminUser);
  const detailsHtml = Object.entries(details)
    .map(([k, v]) => `• <b>${escapeHtml(k)}:</b> ${escapeHtml(String(v))}`)
    .join('\n');

  const message =
    `🛠️ <b>STORE ADMIN ACTION: ${escapeHtml(action)}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 <b>Target:</b> ${escapeHtml(target)}\n` +
    `👤 <b>Admin Username:</b> <b>${escapeHtml(adminIdentity.usernameTag)}</b>\n` +
    (detailsHtml ? `${detailsHtml}\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱ <i>${getPhnomPenhTime()} (Phnom Penh)</i>`;

  await broadcastToTelegram(message);
  return true;
}

export async function notifyAdmin(title, details) {
  const formattedDetails = formatDetailsHtml(details);
  const message = `🔔 <b>MAISER STORE: ${escapeHtml(title)}</b>\n\n` +
    (formattedDetails ? `${formattedDetails}\n\n` : '') +
    `⏱ <i>${getPhnomPenhTime()} (Phnom Penh)</i>`;

  await broadcastToTelegram(message);
}

function formatDetailsHtml(details) {
  if (!details) return '';
  if (typeof details === 'string') return escapeHtml(details);

  const lines = [];
  for (const [key, val] of Object.entries(details)) {
    lines.push(`• <b>${escapeHtml(key.replace(/_/g, ' ').toUpperCase())}:</b> ${escapeHtml(String(val))}`);
  }
  return lines.join('\n');
}

// ============================================================================
// 8. CUSTOMER PERSONAL DELIVERIES
// ============================================================================
export async function notifyOrderDelivered(telegramId, order, items = [], deliveries = []) {
  if (!telegramId) return;

  const dedupKey = `order_delivery_${telegramId}_${order?.id || order?.order_number}`;
  if (isNotificationAlreadySent(dedupKey)) return;
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

  const message =
    `🎉 <b>${isGamepass ? 'GamePass Order Confirmed!' : 'Order Delivered Successfully!'}</b>\n\n` +
    `🧾 <b>Order ID:</b> <code>#${escapeHtml(order.order_number)}</code>\n` +
    `💰 <b>Total Paid:</b> <b>$${Number(order.total_amount).toFixed(2)} ${escapeHtml(order.currency || 'USD')}</b>\n` +
    (isGamepass ? `\n🎮 <b>Roblox Target:</b> <code>${escapeHtml(order.customer_notes || 'Verified Player')}</code>\n` : '') +
    (isGamepass 
      ? `⏳ <i>Your GamePass will be gifted/transferred to your Roblox account within 1 to 24 hours. Check your Roblox inventory / trades.</i>\n`
      : `🔐 <b>Your Purchased Account / Key (Tap to Copy):</b>\n${deliveryDetailsText}\n`) +
    `\n<i>💡 Need support? Contact @MaiserStore_bot 24/7</i>`;

  const replyMarkup = buildStoreButtons(order?.id);
  await sendTelegramMessage(telegramId, message, { replyMarkup });
}

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

// ============================================================================
// 9. TEST TELEGRAM SYSTEM ENDPOINT HANDLER
// ============================================================================
export async function testTelegramSystem() {
  const time = getPhnomPenhTime();
  const sampleUser = {
    username: 'dara_customer',
    first_name: 'Dara',
    last_name: 'Customer',
    email: 'dara@example.com'
  };
  const identity = formatCustomerIdentity(sampleUser);

  const message =
    `🚀 <b>MAISER STORE: TELEGRAM NOTIFICATION SYSTEM LIVE</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ <b>System Status:</b> ALL SYSTEMS OPERATIONAL\n` +
    `🤖 <b>Telegram Bot:</b> @${ENV.TELEGRAM_BOT_USERNAME || 'Maiser_report_bot'}\n` +
    `👥 <b>Group / Channel ID:</b> <code>${ENV.TELEGRAM_REPORT_CHANNEL_ID || 'Configured'}</code>\n` +
    `👑 <b>Admin Chat ID:</b> <code>${ENV.TELEGRAM_ADMIN_CHAT_ID || 'Configured'}</code>\n` +
    `👤 <b>Username System:</b> ACTIVE (Displays <code>${identity.usernameTag}</code> for all actions)\n` +
    `🌐 <b>Store Frontend:</b> ${ENV.FRONTEND_URL}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱ <i>Test executed at ${time} (Phnom Penh)</i>\n` +
    `🎉 <i>Usernames are prominently reported across all store events!</i>`;

  const replyMarkup = buildStoreButtons();
  const results = await broadcastToTelegram(message, { replyMarkup });

  return {
    success: results.group || results.admin,
    bot: results.admin,
    group: results.group,
    details: {
      botUsername: ENV.TELEGRAM_BOT_USERNAME,
      adminChatId: ENV.TELEGRAM_ADMIN_CHAT_ID,
      reportChannelId: ENV.TELEGRAM_REPORT_CHANNEL_ID,
      usernameFormat: identity.usernameTag,
      timestamp: time
    }
  };
}
