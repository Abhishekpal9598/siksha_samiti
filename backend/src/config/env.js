import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root or workspace root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback to current working directory

export const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:5174',
  apiPrefix: '/api/v1',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/education_committee',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100, // max 100 requests per window
  bodyLimit: process.env.BODY_LIMIT || '1mb',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_key_change_in_production_education_committee_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieName: process.env.COOKIE_NAME || 'auth_token',
  omrServiceUrl: process.env.OMR_SERVICE_URL || 'http://127.0.0.1:8001',
  omrInternalKey: process.env.OMR_INTERNAL_KEY || 'edu_omr_internal_secret_key_2026',
  omrStorageDir: process.env.OMR_STORAGE_DIR || path.resolve(__dirname, '../../storage/omr_private')
};

// Safe origins parser
export const getAllowedOrigins = () => {
  return config.clientOrigin
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
};
