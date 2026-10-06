import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { ENV } from './config/env.js';
import { logger } from './config/logger.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiRouter from './routes/api.js';

export const app = express();

// Trust proxy for rate limiters behind load balancers / reverse proxies
app.set('trust proxy', 1);

// Security Headers (Configured for Telegram WebApp iframe embedding & mobile webviews)
app.use(
  helmet({
    contentSecurityPolicy: false, // Allow Telegram WebApp integration
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

// CORS Configuration
const allowedOrigins = [
  ENV.FRONTEND_URL,
  'https://maiserstore.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'https://web.telegram.org'
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server callbacks)
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.telegram.org') || origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive in dev for Telegram WebApp variations
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })
);

import { paymentController } from './controllers/paymentController.js';

// Body Parsers with Raw Body Capture for Webhook Verification
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP Request Logging
const morganFormat = ENV.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => logger.info(message.trim())
    },
    skip: (req) => req.url === '/api/health'
  })
);

// CutLuy Webhook direct path (https://api.yourdomain.com/webhooks/cutluy)
app.post('/webhooks/cutluy', paymentController.handleCutLuyWebhook);

// Rate Limiting
app.use('/api/', generalLimiter);

// Main API Routes
app.use('/api', apiRouter);

// Root Welcome Endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Maiser Store API',
    version: '1.0.0',
    status: 'online',
    docs: '/api/health'
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'RESOURCE_NOT_FOUND',
      message: `Cannot ${req.method} ${req.url}`
    }
  });
});

// Centralized Error Handler
app.use(errorHandler);
