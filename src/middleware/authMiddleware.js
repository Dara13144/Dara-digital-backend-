import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';
import { errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(
      res,
      ERROR_CODES.UNAUTHORIZED,
      'Authentication token required.',
      401
    );
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return errorResponse(res, ERROR_CODES.EXPIRED_TOKEN, 'Session expired. Please re-authenticate.', 401);
    }
    return errorResponse(res, ERROR_CODES.INVALID_TOKEN, 'Invalid authentication token.', 401);
  }
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, ENV.JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // Ignore invalid optional token
    }
  }
  next();
}
