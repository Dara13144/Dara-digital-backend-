# DaraMini Digital Store - Backend API

Production-ready backend API service for **DaraMini Digital Products Store & Telegram Mini App** with ABA PayWay Payment Gateway and Supabase PostgreSQL.

## 🚀 Features

- **Authentication & Security**: Telegram `initData` cryptographic HMAC-SHA256 signature verification and JWT sessions.
- **Atomic Stock Reservation**: Concurrency-safe stock delivery using `SELECT ... FOR UPDATE SKIP LOCKED` in PostgreSQL transactions (prevents race conditions and double-spending).
- **ABA PayWay Gateway**: Direct integration with ABA PayWay (Sandbox & Production) supporting KHQR, Cards, and ABA Mobile app with HMAC-SHA512 checksum validation.
- **Store Wallet Ledger**: Double-entry ledger system with atomic balance transactions and instant checkouts.
- **Telegram Bot Integration**: Real-time order confirmation, direct digital code delivery via bot chat, and admin notifications.
- **Discounts & Coupons**: Fixed and percentage promo codes with min-spend and validity checking.
- **Admin Management API**: Analytics dashboard, product catalog management, bulk stock uploader, order recovery, user balance adjustment, and store settings.

---

## 🛠 Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: Supabase PostgreSQL (`pg` + `@supabase/supabase-js`)
- **Payment Gateway**: ABA PayWay (HMAC-SHA512)
- **Security**: Helmet, CORS, Express Rate Limit, Express Validator, JsonWebToken, Winston Logger
- **Testing**: Jest, Supertest

---

## 📦 Project Structure

```
backend/
├── src/
│   ├── config/          # Environment, database pool, logger, payment & bot configs
│   ├── constants/       # Order states, user roles, error codes
│   ├── controllers/     # API request handlers (auth, products, orders, payments, admin, etc.)
│   ├── integrations/    # Telegram bot & ABA PayWay API clients
│   ├── jobs/            # Background scheduled tasks
│   ├── middleware/      # Auth, RBAC, Rate limiting, Validation, Error handlers
│   ├── repositories/    # Database query layer (SQL & Supabase transactions)
│   ├── routes/          # Express route definitions
│   ├── services/        # Business logic layer
│   ├── utils/           # Helper functions & response formatters
│   ├── validators/      # Request validation schemas
│   ├── app.js           # Express app setup
│   └── server.js        # Server entry point
├── tests/               # Unit and integration test suites
├── .env.example         # Environment template
└── package.json
```

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

### 3. Run in Development Mode
```bash
npm run dev
```

### 4. Run Production Server
```bash
npm start
```

### 5. Run Tests
```bash
npm test
```

---

## 🌐 API Endpoints Overview

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/telegram` | Telegram WebApp auth & session JWT | No |
| `GET` | `/api/products` | Browse public product catalog | No |
| `GET` | `/api/products/:id` | Get single product details | No |
| `POST` | `/api/orders` | Create a new order | Yes |
| `POST` | `/api/payments/aba/create` | Initiate ABA PayWay payment | Yes |
| `POST` | `/api/payments/aba/callback` | ABA PayWay Webhook callback | No (Signature Verified) |
| `POST` | `/api/payments/wallet` | Pay using wallet balance | Yes |
| `GET` | `/api/orders/:id` | Get order details & delivered keys | Yes |
| `GET` | `/api/admin/dashboard` | Admin analytics & revenue summary | Admin |
| `POST` | `/api/admin/stock/bulk` | Bulk digital stock uploader | Admin |
| `GET` | `/api/health` | Healthcheck endpoint | No |

---

## 📄 License
MIT License. Built for DaraMini Digital Store.
