import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root or workspace root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback to current working directory

const DEFAULT_DEV_JWT_SECRET = 'dev_secret_key_change_in_production_education_committee_2026';
const DEFAULT_DEV_OMR_KEY = 'edu_omr_internal_secret_key_2026';

export const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:5174',
  apiPrefix: '/api/v1',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/education_committee',
  mongodbMaxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE, 10) || 50,
  mongodbMinPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE, 10) || 5,
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100, // max 100 requests per window
  bodyLimit: process.env.BODY_LIMIT || '1mb',
  jwtSecret: process.env.JWT_SECRET || DEFAULT_DEV_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieName: process.env.COOKIE_NAME || 'auth_token',
  cookieSameSite: process.env.COOKIE_SAME_SITE || (process.env.COOKIE_CROSS_SITE === 'true' ? 'none' : 'lax'),
  omrServiceUrl: process.env.OMR_SERVICE_URL || 'http://127.0.0.1:8001',
  omrInternalKey: process.env.OMR_INTERNAL_KEY || process.env.OMR_SERVICE_SECRET || DEFAULT_DEV_OMR_KEY,
  omrStorageDir: process.env.OMR_STORAGE_DIR || path.resolve(__dirname, '../../storage/omr_private'),
  storageProvider: process.env.STORAGE_PROVIDER || 'local',
  s3Bucket: process.env.S3_BUCKET || '',
  s3Endpoint: process.env.S3_ENDPOINT || '',
  s3Region: process.env.S3_REGION || 'auto',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ''
};

// Safe origins parser
export const getAllowedOrigins = () => {
  return config.clientOrigin
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
};

/**
 * Validates operational environment variables for production readiness.
 * Strictly blocks startup if default secrets or insecure wildcards are detected.
 *
 * @param {Object} [overrideEnv] Optional environment map (for testing)
 * @throws {Error} If production configuration violates security constraints
 */
export const validateProductionEnv = (overrideEnv = null) => {
  const currentEnv = overrideEnv || {
    NODE_ENV: config.nodeEnv,
    JWT_SECRET: config.jwtSecret,
    OMR_INTERNAL_KEY: config.omrInternalKey,
    CLIENT_ORIGIN: config.clientOrigin,
    MONGODB_URI: config.mongodbUri
  };

  const isProduction = currentEnv.NODE_ENV === 'production';
  if (!isProduction) {
    return { valid: true, warnings: [] };
  }

  const errors = [];

  // 1. JWT Secret strength and default rejection
  const jwtSecret = currentEnv.JWT_SECRET || '';
  if (!jwtSecret || jwtSecret === DEFAULT_DEV_JWT_SECRET) {
    errors.push('JWT_SECRET cannot use the default development key in production mode.');
  } else if (jwtSecret.length < 32) {
    errors.push(`JWT_SECRET is insufficiently strong (${jwtSecret.length} chars). Must be at least 32 characters in production.`);
  }

  // 2. OMR Internal Microservice Key
  const omrKey = currentEnv.OMR_INTERNAL_KEY || '';
  if (!omrKey || omrKey === DEFAULT_DEV_OMR_KEY) {
    errors.push('OMR_INTERNAL_KEY cannot use default development key in production mode.');
  } else if (omrKey.length < 16) {
    errors.push(`OMR_INTERNAL_KEY must be at least 16 characters in production.`);
  }

  // 3. CORS Wildcard restriction
  const origins = (currentEnv.CLIENT_ORIGIN || '').split(',').map(s => s.trim());
  if (origins.includes('*')) {
    errors.push("CLIENT_ORIGIN contains wildcard '*'. Wildcard origins with credentials:true are forbidden in production.");
  }

  // 4. MongoDB URI validation
  const mongoUri = currentEnv.MONGODB_URI || '';
  if (!mongoUri || (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://'))) {
    errors.push('MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection URI.');
  }

  if (errors.length > 0) {
    const message = `[FATAL] Production Environment Security Validation Failed:\n  - ${errors.join('\n  - ')}`;
    const err = new Error(message);
    err.code = 'INVALID_PRODUCTION_CONFIG';
    err.details = errors;
    throw err;
  }

  return { valid: true, warnings: [] };
};
