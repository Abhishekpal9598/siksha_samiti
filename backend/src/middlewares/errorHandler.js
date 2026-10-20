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

  const response = {
    error: {
      code: err.code || (statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR'),
      message: err.message || 'An unexpected internal error occurred',
      details: err.details || [],
      requestId: req.id || 'unknown'
    }
  };

  if (!isProd && err.stack) {
    // Only in development, attach sanitized stack for debugging
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
};
