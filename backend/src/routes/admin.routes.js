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
import { Competition } from '../models/competition.model.js';
import { Registration } from '../models/registration.model.js';
import { User } from '../models/user.model.js';
import { Question } from '../models/question.model.js';
import { generateGenericOmrPdf, generatePersonalizedOmrPdf } from '../services/omrPdfGenerator.service.js';
import {
  omrUploadMiddleware,
  uploadOmrSubmissions,
  listOmrSubmissions,
  getOmrSubmissionById,
  downloadPrivateOmrScan,
  verifySubmissionQr,
  processOmrAlignment,
  downloadAlignedOmrScan,
  processOmrBubbleDetection,
  startOmrReview,
  updateOmrQuestionAnswer,
  finalizeOmrVerification,
  reopenOmrVerification
} from '../controllers/omr.controller.js';

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

// Phase 6.2: Printable Generic OMR Answer Sheet PDF
router.get('/competitions/:id/omr/template-generic-pdf', async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;
    const competition = await Competition.findById(competitionId);
    if (!competition) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Competition not found.', details: [], requestId: req.id }
      });
    }

    const questionCount = await Question.countDocuments({ competitionId, isActive: true });
    const totalQuestions = parseInt(req.query.totalQuestions, 10) || questionCount || 50;

    const pdfBuffer = await generateGenericOmrPdf({ competition, totalQuestions });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="omr_generic_${competition._id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.status(200).send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

// Phase 6.2: Printable Personalized OMR Answer Sheet PDF with Secure QR Code
router.get('/competitions/:id/omr/template-personalized-pdf/:registrationId', async (req, res, next) => {
  try {
    const { id: competitionId, registrationId } = req.params;

    const competition = await Competition.findById(competitionId);
    if (!competition) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Competition not found.', details: [], requestId: req.id }
      });
    }

    const registration = await Registration.findOne({ _id: registrationId, competitionId });
    if (!registration) {
      return res.status(404).json({
        error: { code: 'REGISTRATION_NOT_FOUND', message: 'Student registration not found for this competition.', details: [], requestId: req.id }
      });
    }

    const student = await User.findById(registration.studentId);
    if (!student) {
      return res.status(404).json({
        error: { code: 'STUDENT_NOT_FOUND', message: 'Student account not found.', details: [], requestId: req.id }
      });
    }

    const questionCount = await Question.countDocuments({ competitionId, isActive: true });
    const totalQuestions = parseInt(req.query.totalQuestions, 10) || questionCount || 50;

    const pdfBuffer = await generatePersonalizedOmrPdf({ competition, registration, student, totalQuestions });

    // Record audit metadata on registration
    registration.omrSheetGeneratedAt = new Date();
    registration.omrSheetGeneratedBy = req.user._id;
    await registration.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="omr_${registration.rollNumber}_${competition._id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.status(200).send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

// Phase 6.3: Secure Multipart OMR Ingestion, Validation & Storage
router.post('/competitions/:id/omr/upload', omrUploadMiddleware, uploadOmrSubmissions);
router.get('/competitions/:id/omr/submissions', listOmrSubmissions);
router.get('/competitions/:id/omr/submissions/:submissionId', getOmrSubmissionById);
router.get('/competitions/:id/omr/submissions/:submissionId/file', downloadPrivateOmrScan);
router.post('/competitions/:id/omr/submissions/:submissionId/verify-qr', verifySubmissionQr);

// Phase 6.4: OMR Alignment, Marker Detection, Perspective Rectification & Quality Validation
router.post('/competitions/:id/omr/submissions/:submissionId/process-alignment', processOmrAlignment);
router.get('/competitions/:id/omr/submissions/:submissionId/aligned-file', downloadAlignedOmrScan);

// Phase 6.5: OMR Bubble Detection, Fill Measurement & Answer Classification
router.post('/competitions/:id/omr/submissions/:submissionId/detect-bubbles', processOmrBubbleDetection);

// Phase 6.6: OMR Admin Manual Answer Verification
router.post('/competitions/:id/omr/submissions/:submissionId/start-review', startOmrReview);
router.put('/competitions/:id/omr/submissions/:submissionId/answers/:questionNumber', updateOmrQuestionAnswer);
router.post('/competitions/:id/omr/submissions/:submissionId/finalize-verification', finalizeOmrVerification);
router.post('/competitions/:id/omr/submissions/:submissionId/reopen-verification', reopenOmrVerification);

export default router;
