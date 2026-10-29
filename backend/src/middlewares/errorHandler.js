import { config } from '../config/env.js';

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.originalUrl} not found`,
      details: [],
      requestId: req.id || 'unknown'
    }
  });
};

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  const isProd = config.nodeEnv === 'production';

  // Sanitize message in production for 500-level internal errors to prevent information leakage
  const safeMessage = (isProd && statusCode >= 500)
    ? 'An unexpected internal error occurred. Please contact system administrator.'
    : (err.message || 'An unexpected internal error occurred');

  const safeDetails = (isProd && statusCode >= 500)
    ? []
    : (err.details || []);

  const response = {
    error: {
      code: err.code || (statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR'),
      message: safeMessage,
      details: safeDetails,
      requestId: req.id || 'unknown'
    }
  };

  if (!isProd && err.stack) {
    // Only in non-production, attach stack trace for debugging
    response.error.stack = err.stack;
  }

  if (statusCode >= 500) {
    console.error(`[ERROR] [${req.id || 'system'}] Server error on ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json(response);
};
