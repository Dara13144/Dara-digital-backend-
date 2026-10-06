import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env or backend .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:5000',

  // Security & JWT
  JWT_SECRET: process.env.JWT_SECRET || 'dev_jwt_secret_daramini_store_minimum_32_chars_ok',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // Google OAuth & Admin
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS || 'darazzdev@gmail.com,admin@daradigital.store')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '',
  SUPABASE_JWKS_URL: process.env.SUPABASE_JWKS_URL || '',
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || 'DaraDigital_bot',
  TELEGRAM_ADMIN_CHAT_ID: process.env.TELEGRAM_ADMIN_CHAT_ID || '',
  TELEGRAM_MINI_APP_URL: process.env.TELEGRAM_MINI_APP_URL || 'http://localhost:5173',

  // ABA PayWay
  ABA: {
    ENVIRONMENT: process.env.ABA_ENVIRONMENT || 'sandbox',
    MERCHANT_ID: process.env.ABA_MERCHANT_ID || 'ec000000',
    API_KEY: process.env.ABA_API_KEY || '',
    SECRET: process.env.ABA_SECRET || '',
    RETURN_URL: process.env.ABA_RETURN_URL || 'http://localhost:5173/orders',
    CANCEL_URL: process.env.ABA_CANCEL_URL || 'http://localhost:5173/checkout',
    CALLBACK_URL: process.env.ABA_CALLBACK_URL || 'http://localhost:5000/api/payments/aba/callback',
    SANDBOX_BASE_URL: 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase',
    PRODUCTION_BASE_URL: 'https://checkout.payway.com.kh/api/payment-gateway/v1/payments/purchase',
    SANDBOX_CHECK_TRAN_URL: 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-status',
    PRODUCTION_CHECK_TRAN_URL: 'https://checkout.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-status'
  },

  // CutLuy KHQR Payment Gateway
  CUTLUY: {
    API_KEY: process.env.CUTLUY_API_KEY || '',
    WEBHOOK_SECRET: process.env.CUTLUY_WEBHOOK_SECRET || '',
    BASE_URL: process.env.CUTLUY_BASE_URL || 'https://cutluy.com/v1'
  },

  // Buckets
  BUCKETS: {
    PRODUCTS: process.env.SUPABASE_BUCKET_PRODUCTS || 'products',
    AVATARS: process.env.SUPABASE_BUCKET_AVATARS || 'avatars',
    DIGITAL_FILES: process.env.SUPABASE_BUCKET_DIGITAL_FILES || 'digital-files'
  }
};
