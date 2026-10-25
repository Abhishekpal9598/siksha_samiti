import { Router } from 'express';
import { getMyRegistrations } from '../controllers/competition.controller.js';
import { getMyAllResultsHandler } from '../controllers/scoring.controller.js';
import { authenticate, requireStudent } from '../middlewares/auth.middleware.js';

const router = Router();

// Authenticated Student: Get all competitions registered by the logged in student
router.get('/registrations', authenticate, requireStudent, getMyRegistrations);

// Phase 5: Authenticated Student: Get all published results/scorecards for the logged in student
router.get('/results', authenticate, requireStudent, getMyAllResultsHandler);

export default router;
