import { validationResult } from 'express-validator';
import { errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { logger } from '../config/logger.js';
import { ENV } from '../config/env.js';

export function validate(validations) {
  return async (req, res, next) => {
    for (const validation of validations) {
      const result = await validation.run(req);
      if (result.errors.length) break;
    }

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    return errorResponse(
      res,
      ERROR_CODES.VALIDATION_ERROR,
      errors.array()[0].msg,
      422,
      errors.array()
    );
  };
}

export function errorHandler(err, req, res, next) {
  logger.error('Unhandled Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'An unexpected internal error occurred.';

  return errorResponse(
    res,
    err.code || ERROR_CODES.INTERNAL_SERVER_ERROR,
    ENV.NODE_ENV === 'production' && statusCode === 500
      ? 'An internal error occurred. Please try again later.'
      : message,
    statusCode,
    ENV.NODE_ENV !== 'production' ? err.stack : undefined
  );
}
