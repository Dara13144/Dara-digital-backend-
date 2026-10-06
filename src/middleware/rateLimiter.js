import rateLimit from 'express-rate-limit';
import { errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return errorResponse(
      res,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      'Too many requests from this IP, please try again later.',
      429
    );
  }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 requests per 15 minutes for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return errorResponse(
      res,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      'Too many login attempts, please try again later.',
      429
    );
  }
});

export const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20, // 20 requests per 5 minutes for payment creations
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return errorResponse(
      res,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      'Too many payment requests, please try again later.',
      429
    );
  }
});
