import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../models/user.model.js';

/**
 * Authentication Middleware:
 * Validates session token from HttpOnly cookie or Authorization Bearer header.
 * Rejects expired, invalid, missing, or inactive accounts.
 */
export const authenticate = async (req, res, next) => {
  try {
    // 1. Extract token from HttpOnly cookie or Bearer header
    let token = req.cookies?.[config.cookieName];

    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required. Please log in.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 2. Verify JWT signature & expiration
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (jwtErr) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: jwtErr.name === 'TokenExpiredError' 
            ? 'Session has expired. Please log in again.' 
            : 'Invalid authentication session. Please log in again.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 3. Find user in database
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'User account not found. Please log in again.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 4. Reject inactive accounts
    if (!user.isActive) {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Your account has been deactivated. Please contact the committee administrator.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 5. Attach safe user to request
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role-based Authorization Middleware:
 * Verifies that the authenticated user has one of the allowed roles.
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required.',
          details: [],
          requestId: req.id
        }
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. ${roles.join('/')} privileges required.`,
          details: [`Current role '${req.user.role}' is not authorized for this resource`],
          requestId: req.id
        }
      });
    }

    next();
  };
};

// Convenience role helpers
export const requireAdmin = requireRole('admin');
export const requireStudent = requireRole('student');
