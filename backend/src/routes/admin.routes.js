import { Router } from 'express';
import { 
  listAdminCompetitions, 
  createCompetition, 
  getAdminCompetitionById, 
  updateCompetition, 
  updateCompetitionStatus 
} from '../controllers/competition.controller.js';
import { 
  listAdminQuestions, 
  createQuestion, 
  updateQuestion, 
  deleteQuestion 
} from '../controllers/question.controller.js';
import { listAdminAttempts } from '../controllers/exam.controller.js';
import {
  evaluateCompetitionHandler,
  updateTieBreakerRulesHandler,
  requestApprovalHandler,
  approveResultsHandler,
  rejectResultsHandler,
  publishResultsHandler,
  unpublishResultsHandler,
  togglePublicMeritListHandler,
  getInternalMeritListHandler
} from '../controllers/scoring.controller.js';
import { 
  authenticate, 
  requireAdminOrHead, 
  requireCommitteeHead 
} from '../middlewares/auth.middleware.js';
import { checkOmrServiceHealth } from '../services/omrClient.service.js';

const router = Router();

// Enforce Authentication and Admin or Committee Head role on all admin routes
router.use(authenticate, requireAdminOrHead);

// Competition Management
router.get('/competitions', listAdminCompetitions);
router.post('/competitions', createCompetition);
router.get('/competitions/:id', getAdminCompetitionById);
router.put('/competitions/:id', updateCompetition);
router.patch('/competitions/:id', updateCompetition);
router.patch('/competitions/:id/status', updateCompetitionStatus);

// Question Bank Management
router.get('/competitions/:competitionId/questions', listAdminQuestions);
router.post('/competitions/:competitionId/questions', createQuestion);
router.put('/questions/:questionId', updateQuestion);
router.delete('/questions/:questionId', deleteQuestion);

// Phase 4: Exam Attempt Monitoring
router.get('/competitions/:id/attempts', listAdminAttempts);

// Phase 5: Central Scoring & Evaluation (Admin or Committee Head)
router.post('/competitions/:id/evaluate', evaluateCompetitionHandler);
router.patch('/competitions/:id/tie-breaker', updateTieBreakerRulesHandler);
router.post('/competitions/:id/request-approval', requestApprovalHandler);
router.get('/competitions/:id/merit-list', getInternalMeritListHandler);

// Phase 5: Committee Head Formal Approval & Publication Gate (Strictly Committee Head Only)
router.post('/competitions/:id/approve', requireCommitteeHead, approveResultsHandler);
router.post('/competitions/:id/reject', requireCommitteeHead, rejectResultsHandler);
router.post('/competitions/:id/publish', requireCommitteeHead, publishResultsHandler);
router.post('/competitions/:id/unpublish', requireCommitteeHead, unpublishResultsHandler);
router.patch('/competitions/:id/public-merit-list', requireCommitteeHead, togglePublicMeritListHandler);

// Phase 6: OMR Service Foundation & Health Check
router.get('/omr/health', async (req, res, next) => {
  try {
    const diagnostic = await checkOmrServiceHealth();
    const statusCode = diagnostic.status === 'HEALTHY' ? 200 : 503;
    res.status(statusCode).json({
      success: diagnostic.status === 'HEALTHY',
      diagnostic
    });
  } catch (error) {
    next(error);
  }
});

export default router;
