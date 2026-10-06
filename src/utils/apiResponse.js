/**
 * Standard API Response Utilities
 */

export function successResponse(res, data = null, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    message
  });
}

export function errorResponse(res, code = 'ERROR', message = 'An error occurred', statusCode = 400, details = null) {
  const payload = {
    success: false,
    error: {
      code,
      message
    }
  };

  if (details && process.env.NODE_ENV !== 'production') {
    payload.error.details = details;
  }

  return res.status(statusCode).json(payload);
}
