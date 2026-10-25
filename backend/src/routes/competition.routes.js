import { Router } from 'express';
import { 
  listPublishedCompetitions, 
  getPublishedCompetitionDetails, 
  registerStudentForCompetition 
} from '../controllers/competition.controller.js';
import { startOrResumeAttempt } from '../controllers/exam.controller.js';
import { 
  getMyResultHandler, 
  getPublicMeritListHandler 
} from '../controllers/scoring.controller.js';
import { authenticate, requireStudent } from '../middlewares/auth.middleware.js';

const router = Router();

// Public / Student: List published competitions
router.get('/', listPublishedCompetitions);

// Public / Student: Get details of a single published competition
router.get('/:id', getPublishedCompetitionDetails);

// Authenticated Student: Register for a competition
router.post('/:id/registrations', authenticate, requireStudent, registerStudentForCompetition);
router.post('/:id/register', authenticate, requireStudent, registerStudentForCompetition);

// Phase 4: Authenticated Student: Start or resume an examination attempt
router.post('/:id/attempts', authenticate, requireStudent, startOrResumeAttempt);

// Phase 5: Authenticated Student: View own private scorecard for published competition
router.get('/:id/my-result', authenticate, requireStudent, getMyResultHandler);

// Phase 5: Public / Student: View approved public merit list (if enabled by Committee Head)
router.get('/:id/public-merit-list', getPublicMeritListHandler);

export default router;
