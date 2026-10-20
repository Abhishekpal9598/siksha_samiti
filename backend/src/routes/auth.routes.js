import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { 
  registerStudent, 
  login, 
  logout, 
  getMe 
} from '../controllers/auth.controller.js';
import { 
  authenticate, 
  requireAdmin, 
  requireStudent 
} from '../middlewares/auth.middleware.js';

const router = Router();

// Login rate limiter: 10 attempts per 15 min in production, higher in test environment
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: (req) => ({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many login attempts. Please try again after 15 minutes.',
      details: [],
      requestId: req.id
    }
  })
});

// 1. Public Student Registration
router.post('/register', registerStudent);

// 2. Authentication (Student & Admin)
router.post('/login', loginLimiter, login);

// 3. Logout (Invalidates cookie)
router.post('/logout', logout);

// 4. Current User Safe Profile
router.get('/me', authenticate, getMe);

// 5. Protected Role Test Endpoints
router.get('/student-only', authenticate, requireStudent, (req, res) => {
  res.json({
    success: true,
    message: 'Student area accessible.',
    user: req.user.toSafeObject()
  });
});

router.get('/admin-only', authenticate, requireAdmin, (req, res) => {
  res.json({
    success: true,
    message: 'Admin area accessible.',
    user: req.user.toSafeObject()
  });
});

export default router;
