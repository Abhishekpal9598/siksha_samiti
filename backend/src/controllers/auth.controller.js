import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/user.model.js';
import { RevokedToken } from '../models/revokedToken.model.js';
import { config } from '../config/env.js';
import { validateStudentRegistration, validateLogin } from '../validators/auth.validator.js';

/**
 * Public Student Registration:
 * Always assigns role 'student'. Never trusts client-supplied role.
 */
export const registerStudent = async (req, res, next) => {
  try {
    // 1. Validate request payload
    const { isValid, errors, sanitized } = validateStudentRegistration(req.body);
    if (!isValid) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: errors[0] || 'Please correct the highlighted fields.',
          details: errors,
          requestId: req.id
        }
      });
    }

    // 2. Check for duplicate mobile registration
    const existingUser = await User.findOne({ mobileNormalized: sanitized.mobileNormalized });
    if (existingUser) {
      return res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'A student account with this mobile number already exists. Please log in.',
          details: ['mobile'],
          requestId: req.id
        }
      });
    }

    // 3. Hash password securely
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(req.body.password, saltRounds);

    // 4. Create user with strictly enforced 'student' role (never trust client role)
    const newUser = await User.create({
      fullName: sanitized.fullName,
      mobile: sanitized.mobile,
      mobileNormalized: sanitized.mobileNormalized,
      school: sanitized.school,
      classOrGrade: sanitized.classOrGrade,
      passwordHash,
      role: 'student', // Security rule: public registration cannot create admin
      isActive: true
    });

    // 5. Return safe response (no passwordHash)
    return res.status(201).json({
      success: true,
      message: 'Student registration successful.',
      user: newUser.toSafeObject()
    });
  } catch (error) {
    // Graceful error handling for unique constraint race condition
    if (error.code === 11000) {
      return res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'A student account with this mobile number already exists. Please log in.',
          details: ['mobile'],
          requestId: req.id
        }
      });
    }
    next(error);
  }
};

/**
 * Unified Login Endpoint (Student & Admin):
 * Authenticates via normalized mobile number & bcrypt password check.
 * Rejects inactive accounts and returns generic 401 on bad credentials.
 * Sets secure HttpOnly cookie.
 */
export const login = async (req, res, next) => {
  try {
    // 1. Validate payload
    const { isValid, errors, sanitized } = validateLogin(req.body);
    if (!isValid) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: errors[0] || 'Please provide valid login credentials.',
          details: errors,
          requestId: req.id
        }
      });
    }

    // 2. Lookup user by normalized mobile (explicitly include passwordHash)
    const user = await User.findOne({ mobileNormalized: sanitized.mobileNormalized }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Invalid mobile number or password.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 3. Verify active status
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

    // 4. Verify password with bcrypt
    const isMatch = await user.comparePassword(sanitized.password);
    if (!isMatch) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Invalid mobile number or password.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 5. Generate JWT token with tokenVersion
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role,
        tokenVersion: user.tokenVersion || 0
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    // 6. Generate cryptographic CSRF token
    const csrfToken = crypto.randomBytes(24).toString('hex');

    // 7. Set secure cookies
    const isProd = config.nodeEnv === 'production';
    const sameSitePolicy = config.cookieSameSite || 'lax';
    
    // Primary session cookie (HttpOnly, inaccessible to JavaScript)
    res.cookie(config.cookieName, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: sameSitePolicy,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    // CSRF Double-Submit cookie (readable by frontend client to send in X-CSRF-Token header)
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      secure: isProd,
      sameSite: sameSitePolicy,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    // 8. Return safe user profile and tokens
    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      csrfToken,
      user: user.toSafeObject()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout Endpoint:
 * Server-side Token Invalidation: Adds token to RevokedToken blacklist.
 * Clears both session and CSRF cookies.
 */
export const logout = async (req, res, next) => {
  try {
    // 1. Extract token from cookie or Authorization header
    let token = req.cookies?.[config.cookieName];
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    // 2. Invalidate token on server-side if present
    if (token) {
      try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        
        let decoded = null;
        try {
          decoded = jwt.decode(token);
        } catch {}

        const expDate = decoded?.exp 
          ? new Date(decoded.exp * 1000) 
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await RevokedToken.findOneAndUpdate(
          { tokenHash },
          {
            tokenHash,
            userId: req.user?._id || decoded?.userId || new mongoose.Types.ObjectId(),
            reason: 'logout',
            expiresAt: expDate
          },
          { upsert: true, returnDocument: 'after' }
        );
      } catch (err) {
        console.warn('Could not record revoked token in blacklist:', err.message);
      }
    }

    // 3. Clear session and CSRF cookies
    const isProd = config.nodeEnv === 'production';
    const sameSitePolicy = config.cookieSameSite || 'lax';
    res.clearCookie(config.cookieName, {
      httpOnly: true,
      secure: isProd,
      sameSite: sameSitePolicy,
      path: '/'
    });

    res.clearCookie('csrf_token', {
      httpOnly: false,
      secure: isProd,
      sameSite: sameSitePolicy,
      path: '/'
    });

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully. Session invalidated.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Current User Profile (GET /api/v1/auth/me):
 * Returns safe profile of authenticated user.
 */
export const getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user.toSafeObject()
  });
};
