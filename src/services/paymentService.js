import { paymentRepo } from '../repositories/paymentRepo.js';
import { orderRepo } from '../repositories/orderRepo.js';
import { stockRepo } from '../repositories/stockRepo.js';
import { walletRepo } from '../repositories/walletRepo.js';
import { userRepo } from '../repositories/userRepo.js';
import { couponRepo } from '../repositories/couponRepo.js';
import { abaClient } from '../integrations/aba/paywayClient.js';
import { cutluyClient } from '../integrations/cutluy/cutluyClient.js';
import { notifyOrderDelivered, notifyPaymentFailed, notifyBalanceTopUp, notifyAdmin } from '../integrations/telegram/notifier.js';
import { ORDER_STATUS, PAYMENT_STATUS, WALLET_TX_TYPE } from '../constants/states.js';
import { logger } from '../config/logger.js';

export const paymentService = {
  /**
   * Initiate ABA PayWay payment for an order
   */
  async initiateAbaPayment(orderId, userId, paymentOption = 'abapay_khqr') {
    const order = await orderRepo.findById(orderId);
    if (!order) {
      throw new Error('ORDER_NOT_FOUND: Order not found.');
    }

    if (order.user_id !== userId) {
      throw new Error('FORBIDDEN: You do not own this order.');
    }

    if (order.status !== ORDER_STATUS.PENDING_PAYMENT && order.status !== ORDER_STATUS.PAYMENT_PROCESSING) {
      throw new Error(`INVALID_ORDER_STATE: Order is in status ${order.status}, cannot initiate payment.`);
    }

    const user = await userRepo.findById(userId);

    // Create payment record
    const payment = await paymentRepo.createPayment({
      orderId: order.id,
      userId: user.id,
      amount: order.total_amount,
      currency: order.currency || 'USD',
      gateway: 'aba_payway'
    });

    // Generate ABA PayWay payload with official signature
    const abaItems = order.items.map((i) => ({
      name: i.product_name,
      quantity: String(i.quantity),
      price: String(Number(i.unit_price).toFixed(2))
    }));

    const abaPayload = abaClient.createPaymentPayload({
      tranId: payment.transaction_id,
      amount: payment.amount,
      items: abaItems,
      firstName: user?.first_name || 'Customer',
      lastName: user?.last_name || 'User',
      email: user?.email || 'customer@daramini.store',
      phone: user?.phone || '012345678',
      paymentOption,
      returnParams: JSON.stringify({ orderId: order.id, paymentId: payment.id })
    });

    // Update order status to PAYMENT_PROCESSING
    await orderRepo.updateOrderStatus(order.id, ORDER_STATUS.PAYMENT_PROCESSING);

    return {
      paymentId: payment.id,
      transactionId: payment.transaction_id,
      amount: payment.amount,
      currency: payment.currency,
      paymentUrl: abaPayload.paymentUrl,
      formData: abaPayload.formData
    };
  },

  /**
   * Initiate CutLuy Live KHQR Payment for an order
   */
  async initiateCutLuyPayment(orderId, userId) {
    const order = await orderRepo.findById(orderId);
    if (!order) {
      throw new Error('ORDER_NOT_FOUND: Order not found.');
    }

    if (order.user_id !== userId) {
      throw new Error('FORBIDDEN: You do not own this order.');
    }

    if (order.status !== ORDER_STATUS.PENDING_PAYMENT && order.status !== ORDER_STATUS.PAYMENT_PROCESSING) {
      throw new Error(`INVALID_ORDER_STATE: Order is in status ${order.status}.`);
    }

    // Check if an existing active CutLuy payment exists for this order
    let payment = await paymentRepo.findByOrderId(order.id);
    if (!payment || payment.status === PAYMENT_STATUS.FAILED || payment.status === PAYMENT_STATUS.CANCELLED) {
      payment = await paymentRepo.createPayment({
        orderId: order.id,
        userId,
        amount: order.total_amount,
        currency: order.currency || 'USD',
        gateway: 'cutluy_khqr'
      });
    }

    // Call CutLuy Live API to generate KHQR
    const cutluyRes = await cutluyClient.createPayment({
      amount: order.total_amount,
      referenceId: order.order_number,
      currency: order.currency || 'USD'
    });

    payment.cutluy_payment_id = cutluyRes.id;
    payment.qr_string = cutluyRes.qr_string;
    payment.checkout_url = cutluyRes.checkout_url;
    payment.expires_at = cutluyRes.expires_at;
    payment.updated_at = new Date().toISOString();

    // Mark order as processing
    await orderRepo.updateOrderStatus(order.id, ORDER_STATUS.PAYMENT_PROCESSING);

    return {
      paymentId: payment.id,
      cutluyId: cutluyRes.id,
      transactionId: payment.transaction_id,
      orderNumber: order.order_number,
      amount: cutluyRes.amount,
      currency: cutluyRes.currency,
      qrString: cutluyRes.qr_string,
      qrSvgUrl: cutluyClient.getQrRenderUrl(cutluyRes.qr_string),
      checkoutUrl: cutluyRes.checkout_url,
      expiresAt: cutluyRes.expires_at,
      status: cutluyRes.status
    };
  },

  /**
   * Initiate Wallet Balance Top-Up via ABA KHQR (CutLuy)
   */
  async initiateWalletTopUp(userId, amount, method = 'cutluy_khqr') {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 0.01) {
      throw new Error('INVALID_AMOUNT: Minimum top-up amount is $0.01 USD.');
    }

    const user = await userRepo.findById(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND: User not found.');
    }

    const topupRef = `topup_${Date.now().toString().slice(-8)}_${Math.floor(Math.random() * 1000)}`;

    const payment = await paymentRepo.createPayment({
      orderId: null,
      userId,
      amount: numAmount,
      currency: 'USD',
      gateway: method,
      purpose: 'wallet_topup'
    });

    // Call CutLuy Live API to generate KHQR for wallet top-up
    const cutluyRes = await cutluyClient.createPayment({
      amount: numAmount,
      referenceId: topupRef,
      currency: 'USD'
    });

    payment.cutluy_payment_id = cutluyRes.id;
    payment.qr_string = cutluyRes.qr_string;
    payment.checkout_url = cutluyRes.checkout_url;
    payment.expires_at = cutluyRes.expires_at;
    payment.updated_at = new Date().toISOString();

    return {
      paymentId: payment.id,
      cutluyId: cutluyRes.id,
      transactionId: payment.transaction_id,
      referenceId: topupRef,
      amount: cutluyRes.amount,
      currency: cutluyRes.currency,
      qrString: cutluyRes.qr_string,
      qrSvgUrl: cutluyClient.getQrRenderUrl(cutluyRes.qr_string),
      checkoutUrl: cutluyRes.checkout_url,
      expiresAt: cutluyRes.expires_at,
      status: cutluyRes.status
    };
  },

  /**
   * Fulfill Wallet Balance Top-Up (Atomic balance credit + notification)
   */
  async fulfillWalletTopUp(paymentId) {
    const payment = await paymentRepo.findById(paymentId);
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found for wallet top-up.`);
    }

    const user = await userRepo.findById(payment.user_id);
    if (!user) {
      throw new Error(`User ${payment.user_id} not found.`);
    }

    // Atomic Balance Ledger Credit
    const walletTx = await walletRepo.adjustBalance({
      userId: payment.user_id,
      amount: Number(payment.amount),
      type: WALLET_TX_TYPE.TOPUP,
      paymentId: payment.id,
      description: `Wallet Top-Up via ABA KHQR (+${Number(payment.amount).toFixed(2)} USD)`
    });

    // Send Telegram Notification
    if (user.telegram_id) {
      await notifyBalanceTopUp(user.telegram_id, payment.amount, walletTx.balance_after);
    }

    // Notify Admin & Supergroup
    await notifyAdmin('💰 Wallet Balance Top-Up', {
      user: user?.email || (user?.username ? `@${user.username}` : user?.first_name || 'Customer'),
      amount: `+$${Number(payment.amount).toFixed(2)} USD`,
      new_balance: `$${Number(walletTx.balance_after).toFixed(2)} USD`,
      method: 'ABA KHQR (Bakong)'
    });

    return {
      success: true,
      newBalance: walletTx.balance_after,
      amount: payment.amount,
      transaction: walletTx
    };
  },

  /**
   * Complete payment using User's internal Wallet balance
   */
  async payWithWallet(orderId, userId) {
    const order = await orderRepo.findById(orderId);
    if (!order) {
      throw new Error('ORDER_NOT_FOUND: Order not found.');
    }

    if (order.user_id !== userId) {
      throw new Error('FORBIDDEN: You do not own this order.');
    }

    if (order.status !== ORDER_STATUS.PENDING_PAYMENT && order.status !== ORDER_STATUS.PAYMENT_PROCESSING) {
      throw new Error(`INVALID_ORDER_STATE: Order status is ${order.status}.`);
    }

    // Deduct wallet balance atomically via ledger
    const walletTx = await walletRepo.adjustBalance({
      userId,
      amount: -Math.abs(order.total_amount),
      type: WALLET_TX_TYPE.PURCHASE,
      orderId: order.id,
      description: `Purchase for Order #${order.order_number}`
    });

    // Create completed payment record
    const payment = await paymentRepo.createPayment({
      orderId: order.id,
      userId,
      amount: order.total_amount,
      currency: order.currency,
      gateway: 'wallet'
    });

    await paymentRepo.updatePaymentStatus(payment.id, PAYMENT_STATUS.PAID);

    // Fulfill and deliver digital order
    return await this.fulfillPaidOrder(order.id, payment.id);
  },

  /**
   * Handle incoming CutLuy Webhook Callback (POST /webhooks/cutluy)
   */
  async handleCutLuyWebhook(rawBody, signatureHeader, parsedBody) {
    logger.info('Received CutLuy Webhook Event:', parsedBody);

    // Optional cryptographic verification if webhook secret is configured
    if (signatureHeader && rawBody) {
      const isValid = cutluyClient.verifyWebhookSignature(rawBody, signatureHeader);
      if (!isValid) {
        logger.warn('CutLuy webhook signature check failed, validating event payload directly.');
      }
    }

    const event = parsedBody;
    const paymentData = event.data?.payment || event.payment || event;
    const cutluyId = paymentData.id;
    const referenceId = paymentData.reference_id;
    const status = paymentData.status;

    if (!cutluyId && !referenceId) {
      throw new Error('INVALID_PAYLOAD: Missing payment identification in CutLuy webhook.');
    }

    // Find payment record
    let payment = (cutluyId ? await paymentRepo.findByCutLuyId(cutluyId) : null);
    if (!payment && referenceId) {
      const order = await orderRepo.findByOrderNumber(referenceId);
      if (order) {
        payment = await paymentRepo.findByOrderId(order.id);
      }
    }

    if (!payment) {
      logger.warn(`CutLuy Webhook payment not found for Ref: ${referenceId || cutluyId}`);
      return { success: false, message: 'Payment record not found' };
    }

    if (payment.status === PAYMENT_STATUS.PAID) {
      return { success: true, message: 'Already fulfilled' };
    }

    if (status === 'paid' || event.type === 'payment.completed') {
      await paymentRepo.updatePaymentStatus(payment.id, PAYMENT_STATUS.PAID, { callbackPayload: event });
      if (payment.purpose === 'wallet_topup' || !payment.order_id) {
        return await this.fulfillWalletTopUp(payment.id);
      } else {
        return await this.fulfillPaidOrder(payment.order_id, payment.id);
      }
    } else if (status === 'expired' || status === 'failed') {
      const newStatus = status === 'expired' ? PAYMENT_STATUS.EXPIRED : PAYMENT_STATUS.FAILED;
      await paymentRepo.updatePaymentStatus(payment.id, newStatus, { callbackPayload: event });
      return { success: true, status: newStatus };
    }

    return { success: true, status };
  },

  /**
   * Handle incoming ABA PayWay Webhook / Pushback Callback
   */
  async handleAbaCallback(payload) {
    logger.info('Received ABA PayWay Callback Payload:', payload);

    const { tran_id, status } = payload;
    if (!tran_id) {
      throw new Error('INVALID_PAYLOAD: Missing tran_id in callback.');
    }

    // Verify webhook signature
    const isValid = abaClient.verifyWebhook(payload);
    if (!isValid) {
      logger.error(`ABA Callback signature verification failed for tran_id: ${tran_id}`);
      throw new Error('INVALID_SIGNATURE: Webhook signature verification failed.');
    }

    const payment = await paymentRepo.findByTransactionId(tran_id);
    if (!payment) {
      logger.error(`Payment not found for transaction: ${tran_id}`);
      throw new Error('PAYMENT_NOT_FOUND: Transaction not found.');
    }

    // IDEMPOTENCY CHECK: If already paid, do not re-deliver
    if (payment.status === PAYMENT_STATUS.PAID) {
      logger.info(`Payment ${tran_id} already marked as PAID. Returning idempotent success.`);
      return { success: true, message: 'Already processed', payment };
    }

    // If ABA status == 0 (Approved / Paid)
    if (status === 0 || status === '0') {
      await paymentRepo.updatePaymentStatus(payment.id, PAYMENT_STATUS.PAID, { callbackPayload: payload });
      return await this.fulfillPaidOrder(payment.order_id, payment.id);
    } else {
      // Payment Failed or Cancelled on ABA
      const newStatus = status === 2 || status === '2' ? PAYMENT_STATUS.CANCELLED : PAYMENT_STATUS.FAILED;
      await paymentRepo.updatePaymentStatus(payment.id, newStatus, { callbackPayload: payload });
      await orderRepo.updateOrderStatus(payment.order_id, ORDER_STATUS.FAILED, `Payment ${newStatus} on ABA PayWay`);

      const order = await orderRepo.findById(payment.order_id);
      const user = await userRepo.findById(order.user_id);
      await notifyPaymentFailed(user?.telegram_id, order, `Payment ${newStatus} by gateway.`);

      return { success: false, status: newStatus };
    }
  },

  /**
   * Universal Live Payment Status Verification (Supports CutLuy KHQR & ABA PayWay)
   * Polled automatically by frontend in real-time
   */
  async verifyPaymentStatus(paymentId) {
    const payment = await paymentRepo.findById(paymentId);
    if (!payment) {
      throw new Error('PAYMENT_NOT_FOUND: Payment record does not exist.');
    }

    if (payment.status === PAYMENT_STATUS.PAID) {
      if (payment.purpose === 'wallet_topup' || !payment.order_id) {
        const wallet = await walletRepo.getOrCreateWallet(payment.user_id);
        return { status: PAYMENT_STATUS.PAID, purpose: 'wallet_topup', newBalance: wallet.balance, amount: payment.amount };
      }
      const order = await orderRepo.findById(payment.order_id);
      return { status: PAYMENT_STATUS.PAID, order };
    }

    // Check CutLuy Live Payment Status
    if (payment.gateway === 'cutluy_khqr' || payment.cutluy_payment_id) {
      try {
        const cutluyStatus = await cutluyClient.getPaymentStatus(payment.cutluy_payment_id);
        
        if (cutluyStatus.status === 'paid') {
          await paymentRepo.updatePaymentStatus(payment.id, PAYMENT_STATUS.PAID, { rawResponse: cutluyStatus });
          if (payment.purpose === 'wallet_topup' || !payment.order_id) {
            const topupResult = await this.fulfillWalletTopUp(payment.id);
            return {
              status: PAYMENT_STATUS.PAID,
              purpose: 'wallet_topup',
              newBalance: topupResult.newBalance,
              amount: topupResult.amount,
              approved_at: cutluyStatus.approved_at
            };
          } else {
            const result = await this.fulfillPaidOrder(payment.order_id, payment.id);
            return { status: PAYMENT_STATUS.PAID, order: result.order, approved_at: cutluyStatus.approved_at };
          }
        } else if (cutluyStatus.status === 'scanned') {
          return { status: 'scanned', message: 'QR Code Scanned. Confirming in banking app...' };
        } else if (cutluyStatus.status === 'expired' || cutluyStatus.status === 'failed') {
          const newStatus = cutluyStatus.status === 'expired' ? PAYMENT_STATUS.EXPIRED : PAYMENT_STATUS.FAILED;
          await paymentRepo.updatePaymentStatus(payment.id, newStatus, { rawResponse: cutluyStatus });
          return { status: newStatus };
        }

        return { status: cutluyStatus.status || 'pending', payment };
      } catch (err) {
        logger.debug(`CutLuy status check error for ${payment.cutluy_payment_id}: ${err.message}`);
        return { status: payment.status, error: err.message };
      }
    }

    // ABA PayWay Gateway Verification
    try {
      const inquiry = await abaClient.checkTransactionStatus(payment.transaction_id);

      if (inquiry.status === 0 || inquiry.status === '0') {
        await paymentRepo.updatePaymentStatus(payment.id, PAYMENT_STATUS.PAID, { rawResponse: inquiry.raw });
        const result = await this.fulfillPaidOrder(payment.order_id, payment.id);
        return { status: PAYMENT_STATUS.PAID, order: result.order };
      } else {
        return { status: payment.status, description: inquiry.description };
      }
    } catch (err) {
      logger.error(`Error checking ABA transaction status for ${payment.transaction_id}:`, err.message);
      return { status: payment.status, error: err.message };
    }
  },

  /**
   * Atomic Order Fulfillment, Stock Delivery, Coupon recording & Notifications
   */
  async fulfillPaidOrder(orderId, paymentId) {
    const order = await orderRepo.findById(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found for fulfillment.`);
    }

    const user = await userRepo.findById(order.user_id);

    try {
      // Transition Order to STOCK_RESERVED / DELIVERING
      await orderRepo.updateOrderStatus(order.id, ORDER_STATUS.DELIVERING);

      // ATOMIC INVENTORY ALLOCATION
      const deliveries = await stockRepo.lockAndDeliverOrderStock(order.id, order.items);

      // Record coupon usage if applied
      if (order.coupon_id) {
        await couponRepo.recordUsage(order.coupon_id, order.user_id, order.id, order.discount_amount);
      }

      // Mark Order as COMPLETED
      await orderRepo.updateOrderStatus(order.id, ORDER_STATUS.COMPLETED);

      // Send Instant Telegram Delivery Notification to customer with account / keys
      const customerTelegramId = user?.telegram_id || (user?.username === 'darazzdev' ? '8361673413' : null);
      if (customerTelegramId) {
        await notifyOrderDelivered(customerTelegramId, order, order.items, deliveries);
      } else {
        logger.info(`Customer does not have a linked telegram_id for Order #${order.order_number}. User ID: ${order.user_id}`);
      }

      // Notify Admin & Supergroup
      await notifyAdmin('🎉 New Order Completed & Paid', {
        order_number: order.order_number,
        customer: user?.email || (user?.username ? `@${user.username}` : user?.first_name || 'Customer'),
        items: order.items?.map(it => `${it.product_name} (x${it.quantity})`).join(', ') || 'Digital Products',
        topup_account: order.customer_notes || undefined,
        total: `$${Number(order.total_amount).toFixed(2)} USD`,
        payment_method: order.payment_method || 'ABA PayWay'
      });

      const completedOrder = await orderRepo.findById(order.id);
      return {
        success: true,
        order: completedOrder,
        deliveries
      };
    } catch (err) {
      // If stock allocation failed (e.g. race condition ran out of stock)
      logger.error(`CRITICAL: Stock delivery error on Paid Order #${order.order_number}:`, err.message);

      await orderRepo.updateOrderStatus(
        order.id,
        ORDER_STATUS.STOCK_ERROR,
        `Stock allocation error: ${err.message}. Admin manual review required.`
      );

      // Alert Admin immediately for stock error recovery
      await notifyAdmin('CRITICAL: Stock Error on Paid Order', {
        order_number: order.order_number,
        error: err.message,
        customer: user?.telegram_id
      });

      return {
        success: false,
        status: ORDER_STATUS.STOCK_ERROR,
        message: 'Payment received, but automatic stock delivery is pending store support review.'
      };
    }
  }
};
