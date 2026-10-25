import { Router } from 'express';
import { 
  getAttemptDetails, 
  autosaveAnswers, 
  submitAttempt 
} from '../controllers/exam.controller.js';
import { authenticate, requireStudent } from '../middlewares/auth.middleware.js';

const router = Router();

// Enforce student authentication across attempt interaction routes
router.use(authenticate, requireStudent);

// Get attempt details and status (resilience & resume)
router.get('/:attemptId', getAttemptDetails);

// Answer autosave (debounced real-time / batch updates)
router.patch('/:attemptId/answers', autosaveAnswers);

// Final exam submission
router.post('/:attemptId/submit', submitAttempt);

export default router;
