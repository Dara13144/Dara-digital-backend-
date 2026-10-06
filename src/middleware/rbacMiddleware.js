import { errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * Role-Based Access Control Middleware
 * @param {string[]} allowedRoles - List of permitted roles (e.g. ['ADMIN', 'SUPER_ADMIN'])
 */
export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, ERROR_CODES.UNAUTHORIZED, 'Authentication required.', 401);
    }

    const userRoles = req.user.roles || [];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return errorResponse(
        res,
        ERROR_CODES.FORBIDDEN,
        'Access denied: You do not have permission to perform this action.',
        403
      );
    }

    next();
  };
}
