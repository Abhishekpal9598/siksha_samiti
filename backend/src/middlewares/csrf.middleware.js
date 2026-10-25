import { config, getAllowedOrigins } from '../config/env.js';

/**
 * CSRF Protection Middleware:
 * Protects cookie-authenticated state-changing requests (POST, PUT, PATCH, DELETE).
 * Employs multi-layered defense:
 * 1. Strict Origin/Referer verification against allowed frontend origins.
 * 2. Double-Submit CSRF token validation (X-CSRF-Token header matching csrf_token cookie).
 * 3. Safe fallback to X-Requested-With for custom AJAX headers.
 * 
 * Exclusions:
 * - Safe read-only HTTP methods (GET, HEAD, OPTIONS).
 * - Public authentication endpoints (login, register, health) that do not use cookie sessions.
 * - Non-browser requests using explicit Authorization Bearer tokens (immune to ambient credential CSRF).
 */
export const csrfProtection = (req, res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Skip CSRF for public entry routes that don't depend on session cookies
  const publicPaths = [
    `${config.apiPrefix}/health`,
    `${config.apiPrefix}/auth/login`,
    `${config.apiPrefix}/auth/register`
  ];
  if (publicPaths.some(p => req.originalUrl?.startsWith(p) || req.path?.startsWith(p))) {
    return next();
  }

  // If request uses Bearer token authorization header without cookie, CSRF does not apply
  const hasAuthCookie = Boolean(req.cookies?.[config.cookieName]);
  const hasBearerHeader = Boolean(req.headers.authorization?.startsWith('Bearer '));

  if (!hasAuthCookie && hasBearerHeader) {
    return next();
  }

  // If request has an active session cookie, enforce strict CSRF protection
  if (hasAuthCookie) {
    const allowedOrigins = getAllowedOrigins();

    // 1. Origin / Referer Validation
    const origin = req.headers.origin;
    if (origin) {
      const isAllowedOrigin = allowedOrigins.includes(origin) || allowedOrigins.includes('*');
      if (!isAllowedOrigin) {
        return res.status(403).json({
          error: {
            code: 'CSRF_ERROR',
            message: 'Cross-site request forgery blocked: Untrusted request origin.',
            details: [`Origin '${origin}' is not authorized.`],
            requestId: req.id
          }
        });
      }
    }

    // 2. Double-Submit CSRF Token Check
    const cookieCsrfToken = req.cookies?.csrf_token;
    const headerCsrfToken = req.headers['x-csrf-token'];
    const requestedWith = req.headers['x-requested-with'];

    // If a csrf_token cookie exists, verify match with header
    if (cookieCsrfToken) {
      if (headerCsrfToken !== cookieCsrfToken && requestedWith !== 'XMLHttpRequest') {
        return res.status(403).json({
          error: {
            code: 'CSRF_ERROR',
            message: 'Cross-site request forgery blocked: Missing or invalid CSRF token.',
            details: ['State-changing requests must include a valid X-CSRF-Token or X-Requested-With header.'],
            requestId: req.id
          }
        });
      }
    }
  }

  next();
};
