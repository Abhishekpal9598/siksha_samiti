import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config, getAllowedOrigins } from './config/env.js';
import { requestIdMiddleware } from './middlewares/requestId.js';
import { csrfProtection } from './middlewares/csrf.middleware.js';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import competitionRoutes from './routes/competition.routes.js';
import registrationRoutes from './routes/registration.routes.js';
import adminRoutes from './routes/admin.routes.js';
import attemptRoutes from './routes/attempt.routes.js';

const app = express();

// 1. Request ID middleware
app.use(requestIdMiddleware);

// 2. Cookie parser for HttpOnly session cookies
app.use(cookieParser());

// 3. Security headers via Helmet
app.use(helmet());

// 4. CORS configuration
const allowedOrigins = getAllowedOrigins();
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      const err = new Error(`Origin ${origin} not allowed by CORS policy`);
      err.statusCode = 403;
      err.code = 'CORS_ERROR';
      return callback(err, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token', 'X-Requested-With']
  })
);

// 5. Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: (req) => ({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later.',
      details: [],
      requestId: req.id
    }
  })
});
app.use('/api', limiter);

// 6. Body parser with strict size limit
app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

// 7. CSRF Protection for cookie-authenticated state changes
app.use(csrfProtection);

// 8. Root & Base Routes
const getApiOverview = (req, res) => {
  res.status(200).json({
    success: true,
    name: 'Education Committee Competition Management System API',
    version: '1.0.0',
    status: 'ONLINE',
    message: 'Backend API service is running successfully. Web frontend portal is available at http://localhost:5174',
    frontendUrl: 'http://localhost:5174',
    endpoints: {
      health: `${config.apiPrefix}/health`,
      auth: `${config.apiPrefix}/auth`,
      competitions: `${config.apiPrefix}/competitions`,
      studentRegistrations: `${config.apiPrefix}/me/registrations`,
      studentAttempts: `${config.apiPrefix}/attempts`,
      admin: `${config.apiPrefix}/admin`
    }
  });
};

app.get('/', getApiOverview);
app.get(config.apiPrefix, getApiOverview);
app.get(`${config.apiPrefix}/`, getApiOverview);

app.use(config.apiPrefix, healthRoutes);
app.use(`${config.apiPrefix}/auth`, authRoutes);
app.use(`${config.apiPrefix}/competitions`, competitionRoutes);
app.use(`${config.apiPrefix}/me`, registrationRoutes);
app.use(`${config.apiPrefix}/attempts`, attemptRoutes);
app.use(`${config.apiPrefix}/admin`, adminRoutes);

// 9. 404 & Centralized Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
