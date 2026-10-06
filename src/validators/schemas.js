import { body, param, query } from 'express-validator';

export const checkoutValidator = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('Cart must contain at least one item.'),
  body('items.*.productId')
    .isString()
    .notEmpty()
    .withMessage('Product ID is required for all items.'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be an integer greater than 0.'),
  body('paymentMethod')
    .optional()
    .isIn(['aba_payway', 'cutluy_khqr', 'khqr', 'wallet'])
    .withMessage('Invalid payment method.')
];

export const productValidator = [
  body('name').trim().notEmpty().withMessage('Product name is required.'),
  body('category_id').trim().notEmpty().withMessage('Category ID is required.'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be greater than or equal to 0.'),
  body('discount_price').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Discount price must be non-negative.'),
  body('stock_type').isIn(['manual', 'code', 'account', 'file', 'link', 'text']).withMessage('Invalid stock type.')
];

export const categoryValidator = [
  body('name').trim().notEmpty().withMessage('Category name is required.')
];

export const stockBulkValidator = [
  body('productId').notEmpty().withMessage('Product ID is required.'),
  body('stockType').isIn(['manual', 'code', 'account', 'file', 'link', 'text']).withMessage('Invalid stock type.'),
  body('lines').isArray({ min: 1 }).withMessage('Stock lines array cannot be empty.')
];

export const couponValidator = [
  body('code').trim().notEmpty().withMessage('Coupon code is required.'),
  body('discount_type').isIn(['percentage', 'fixed']).withMessage('Discount type must be percentage or fixed.'),
  body('discount_value').isFloat({ min: 0.01 }).withMessage('Discount value must be greater than 0.')
];

export const walletAdjustValidator = [
  body('userId').notEmpty().withMessage('User ID is required.'),
  body('amount').isFloat().withMessage('Amount must be a valid number.'),
  body('type').isIn(['ADMIN_CREDIT', 'ADMIN_DEBIT']).withMessage('Type must be ADMIN_CREDIT or ADMIN_DEBIT.')
];
