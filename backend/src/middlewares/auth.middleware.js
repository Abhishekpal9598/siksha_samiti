import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { User } from '../models/user.model.js';
import { RevokedToken } from '../models/revokedToken.model.js';

/**
 * Authentication Middleware:
 * Validates session token from HttpOnly cookie or Authorization Bearer header.
 * Verifies token signature, expiration, active status, server-side revocation list, and tokenVersion.
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

    // 2. Check Server-Side Revocation (Blacklist)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const isRevoked = await RevokedToken.exists({ tokenHash });
    if (isRevoked) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'This session has been logged out and is no longer valid. Please log in again.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 3. Verify JWT signature & expiration
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

    // 4. Find user in database
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

    // 5. Reject inactive accounts
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

    // 6. Check tokenVersion (invalidates all older tokens if password rotated)
    if (
      decoded.tokenVersion !== undefined &&
      user.tokenVersion !== undefined &&
      decoded.tokenVersion !== user.tokenVersion
    ) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Session has been invalidated due to a security update or password rotation. Please log in again.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 7. Attach safe user & token info to request
    req.user = user;
    req.token = token;
    req.tokenHash = tokenHash;
    req.tokenExp = decoded.exp;
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
export const requireCommitteeHead = requireRole('committee_head');
export const requireAdminOrHead = requireRole('admin', 'committee_head');
