import express from 'express';
import { authController } from '../controllers/authController.js';
import { userController } from '../controllers/userController.js';
import { categoryController } from '../controllers/categoryController.js';
import { productController } from '../controllers/productController.js';
import { orderController } from '../controllers/orderController.js';
import { paymentController } from '../controllers/paymentController.js';
import { walletController } from '../controllers/walletController.js';
import { deliveryController } from '../controllers/deliveryController.js';
import { couponController } from '../controllers/couponController.js';
import { adminController } from '../controllers/adminController.js';
import { healthController } from '../controllers/healthController.js';
import { handleTelegramWebhook } from '../integrations/telegram/bot.js';

import { authenticate, optionalAuth } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/rbacMiddleware.js';
import { authLimiter, paymentLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validateMiddleware.js';
import {
  checkoutValidator,
  productValidator,
  categoryValidator,
  stockBulkValidator,
  couponValidator,
  walletAdjustValidator
} from '../validators/schemas.js';

const router = express.Router();

// ============================================================================
// 1. Health & Telegram Webhook
// ============================================================================
router.get('/health', healthController.getHealth);
router.post('/telegram/webhook', async (req, res) => {
  try {
    await handleTelegramWebhook(req.body);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: false });
  }
});

// ============================================================================
// 2. Authentication
// ============================================================================
router.post('/telegram/auth', authLimiter, authController.telegramAuth);
router.post('/auth/google', authLimiter, authController.googleAuth);
router.post('/auth/mock-login', authLimiter, authController.mockLogin);

// ============================================================================
// 3. User Profile & Settings
// ============================================================================
router.get('/users/me', authenticate, userController.getProfile);
router.post('/users/language', authenticate, userController.updateLanguage);
router.post('/users/sync-avatar', authenticate, userController.syncAvatar);
router.put('/users/avatar', authenticate, userController.updateAvatar);

// ============================================================================
// 4. Categories & Catalog
// ============================================================================
router.get('/categories', categoryController.getCategories);
router.get('/categories/:slug', categoryController.getCategoryBySlug);

// ============================================================================
// 5. Products Catalog (Never exposes secret stock payload)
// ============================================================================
router.get('/products', productController.getProducts);
router.get('/products/:id', productController.getProductById);
router.get('/products/slug/:slug', productController.getProductBySlug);

// ============================================================================
// 6. Shopping Cart & Coupons
// ============================================================================
router.post('/cart/calculate', optionalAuth, orderController.calculateCart);
router.post('/coupons/validate', optionalAuth, couponController.validateCoupon);

// ============================================================================
// 7. Orders
// ============================================================================
router.post('/orders', authenticate, validate(checkoutValidator), orderController.checkout);
router.get('/orders', authenticate, orderController.getUserOrders);
router.get('/orders/:id', authenticate, orderController.getOrder);

// ============================================================================
// 8. Payments (CutLuy KHQR & ABA PayWay Integration)
// ============================================================================
router.post('/payments/cutluy/create', authenticate, paymentLimiter, paymentController.createCutLuyPayment);
router.post('/payments/cutluy/webhook', paymentController.handleCutLuyWebhook);
router.post('/payments/cutluy/callback', paymentController.handleCutLuyWebhook);
router.post('/payments/aba/create', authenticate, paymentLimiter, paymentController.createAbaPayment);
router.post('/payments/wallet/pay', authenticate, paymentLimiter, paymentController.payWithWallet);
router.post('/payments/aba/callback', paymentController.handleAbaCallback);
router.get('/payments/:paymentId/status', authenticate, paymentController.checkPaymentStatus);

// ============================================================================
// 9. Digital Delivery (Protected: Only delivered items after completion)
// ============================================================================
router.get('/delivery/order/:orderId', authenticate, deliveryController.getOrderDeliveries);
router.get('/delivery/my-items', authenticate, deliveryController.getMyPurchasedProducts);

// ============================================================================
// 10. Wallet
// ============================================================================
router.get('/wallet', authenticate, walletController.getWallet);
router.get('/wallet/transactions', authenticate, walletController.getTransactions);
router.post('/wallet/topup', authenticate, paymentLimiter, walletController.initiateTopup);

// ============================================================================
// 11. Admin Protected Management Routes (RBAC: ADMIN, SUPER_ADMIN, STAFF)
// ============================================================================
const adminAuth = [authenticate, requireRoles('ADMIN', 'SUPER_ADMIN', 'STAFF')];
const superAdminAuth = [authenticate, requireRoles('SUPER_ADMIN')];

// Admin Dashboard
router.get('/admin/dashboard', adminAuth, adminController.getDashboard);

// Admin Products
router.get('/admin/products', adminAuth, adminController.getProducts);
router.post('/admin/products', adminAuth, validate(productValidator), adminController.createProduct);
router.put('/admin/products/:id', adminAuth, adminController.updateProduct);
router.delete('/admin/products/:id', adminAuth, adminController.deleteProduct);

// Admin Stock Inventory
router.get('/admin/stock/:productId', adminAuth, adminController.getProductStock);
router.post('/admin/stock/single', adminAuth, adminController.addStockItem);
router.post('/admin/stock/bulk', adminAuth, validate(stockBulkValidator), adminController.bulkAddStock);
router.delete('/admin/stock/:id', adminAuth, adminController.deleteStockItem);

// Admin Orders & Delivery Recovery
router.get('/admin/orders', adminAuth, adminController.getOrders);
router.get('/admin/orders/:id', adminAuth, adminController.getOrderDetail);
router.post('/admin/orders/:id/retry-delivery', adminAuth, adminController.retryOrderDelivery);
router.put('/admin/orders/:id/status', adminAuth, adminController.updateOrderStatus);

// Admin Payments
router.get('/admin/payments', adminAuth, adminController.getPayments);

// Admin Users & Wallets
router.get('/admin/users', adminAuth, adminController.getUsers);
router.put('/admin/users/:id/status', adminAuth, adminController.updateUserStatus);
router.post('/admin/users/balance', adminAuth, validate(walletAdjustValidator), adminController.adjustUserBalance);

// Admin Categories
router.post('/admin/categories', adminAuth, validate(categoryValidator), adminController.createCategory);
router.put('/admin/categories/:id', adminAuth, adminController.updateCategory);
router.delete('/admin/categories/:id', adminAuth, adminController.deleteCategory);

// Admin Coupons
router.get('/admin/coupons', adminAuth, adminController.getCoupons);
router.post('/admin/coupons', adminAuth, validate(couponValidator), adminController.createCoupon);
router.put('/admin/coupons/:id', adminAuth, adminController.updateCoupon);
router.delete('/admin/coupons/:id', adminAuth, adminController.deleteCoupon);

// Admin Settings & Logs
router.get('/admin/settings', adminAuth, adminController.getSettings);
router.put('/admin/settings', superAdminAuth, adminController.updateSettings);
router.get('/admin/logs', adminAuth, adminController.getLogs);

export default router;
