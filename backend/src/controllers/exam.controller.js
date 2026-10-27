import mongoose from 'mongoose';
import { Attempt } from '../models/attempt.model.js';
import { Competition } from '../models/competition.model.js';
import { Question } from '../models/question.model.js';
import { Registration } from '../models/registration.model.js';
import { OmrSubmission } from '../models/omrSubmission.model.js';
import { sweepExpiredAttempts } from '../services/examSweeper.service.js';

/**
 * 1. Start or Resume an Online Examination Attempt
 * POST /api/v1/competitions/:id/attempts
 */
export const startOrResumeAttempt = async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;
    const studentId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(competitionId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid competition ID format.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 1. Fetch Competition
    const competition = await Competition.findById(competitionId);
    if (!competition) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Competition not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    if (competition.status !== 'PUBLISHED') {
      return res.status(400).json({
        error: {
          code: 'COMPETITION_NOT_OPEN',
          message: 'This competition is not currently published or open for examination.',
          details: [`Status is ${competition.status}`],
          requestId: req.id
        }
      });
    }

    // 2. Verify Registration
    const registration = await Registration.findOne({
      competitionId: competition._id,
      studentId,
      status: 'registered'
    });

    if (!registration) {
      return res.status(403).json({
        error: {
          code: 'NOT_REGISTERED',
          message: 'You are not registered for this competition. Please register before starting the exam.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 3. Exam Mode Check (OMR vs Online MCQ) & Atomic Mode Lock
    if (registration.examMode === 'OMR') {
      return res.status(403).json({
        error: {
          code: 'OMR_MODE_ONLY',
          message: 'Your registration is configured for paper OMR sheet examination. Online MCQ examination is not available for OMR candidates.',
          details: ['Your exam will be conducted physically on paper OMR sheet at the designated exam center.'],
          requestId: req.id
        }
      });
    }

    const omrSubmissionExists = await OmrSubmission.exists({
      competitionId: competition._id,
      registrationId: registration._id,
      status: { $ne: 'FAILED' }
    });

    if (omrSubmissionExists) {
      return res.status(403).json({
        error: {
          code: 'ATOMIC_MODE_LOCK_VIOLATION',
          message: 'An OMR examination sheet has already been submitted for this registration. Online examination attempt cannot be started.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 4. Server-Authoritative Schedule Verification
    const now = new Date();

    if (competition.examStartsAt && now < new Date(competition.examStartsAt)) {
      return res.status(400).json({
        error: {
          code: 'EXAM_NOT_STARTED',
          message: `The examination has not started yet. Scheduled start time: ${competition.startTime} on ${competition.examDate ? competition.examDate.toISOString().split('T')[0] : 'scheduled date'}.`,
          details: [
            `Current server time: ${now.toISOString()}`,
            `Exam starts at: ${competition.examStartsAt.toISOString()}`
          ],
          requestId: req.id
        }
      });
    }

    if (competition.examEndsAt && now > new Date(competition.examEndsAt)) {
      return res.status(400).json({
        error: {
          code: 'EXAM_CONCLUDED',
          message: 'The examination window for this competition has concluded.',
          details: [`Exam ended at: ${competition.examEndsAt.toISOString()}`],
          requestId: req.id
        }
      });
    }

    // 5. Existing Attempt Check (Idempotent Resume or Conflict)
    let existingAttempt = await Attempt.findOne({
      competitionId: competition._id,
      studentId
    });

    if (existingAttempt) {
      // If already submitted or timed out, reject restart
      if (['SUBMITTED', 'AUTO_SUBMITTED'].includes(existingAttempt.status)) {
        return res.status(409).json({
          error: {
            code: 'ALREADY_SUBMITTED',
            message: 'You have already completed and submitted your examination attempt for this competition.',
            details: [
              `Status: ${existingAttempt.status}`,
              `Submitted at: ${existingAttempt.submittedAt?.toISOString()}`
            ],
            requestId: req.id
          }
        });
      }

      // If IN_PROGRESS, check if server time has exceeded endsAt
      if (now >= new Date(existingAttempt.endsAt)) {
        existingAttempt.status = 'AUTO_SUBMITTED';
        existingAttempt.submittedAt = existingAttempt.endsAt;
        await existingAttempt.save();

        return res.status(400).json({
          error: {
            code: 'EXAM_EXPIRED',
            message: 'The examination duration has ended. Your responses have been automatically submitted.',
            details: [`Ended at: ${existingAttempt.endsAt.toISOString()}`],
            requestId: req.id
          }
        });
      }

      // Resume in-progress attempt seamlessly
      return res.status(200).json({
        success: true,
        message: 'Resuming your active examination attempt.',
        isResumed: true,
        attempt: existingAttempt.toStudentJSON()
      });
    }

    // 6. Create New Attempt with Question Snapshot
    const questions = await Question.find({
      competitionId: competition._id,
      isActive: true
    }).sort({ order: 1, createdAt: 1 });

    if (questions.length === 0) {
      return res.status(400).json({
        error: {
          code: 'NO_QUESTIONS',
          message: 'No questions have been configured for this competition yet. Please contact the administrator.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Snapshot questions WITHOUT correctOption or explanation
    const questionSnapshot = questions.map((q) => ({
      questionId: q._id,
      order: q.order,
      prompt: q.prompt,
      options: q.options.map((o) => ({ key: o.key, text: o.text })),
      marks: q.marks,
      subject: q.subject,
      topic: q.topic
    }));

    // Server-Authoritative Duration & Expiry Rule:
    // Earlier of:
    // (a) startedAt + durationMinutes
    // (b) competition.examEndsAt
    const startedAt = now;
    const durationMs = (competition.durationMinutes || 120) * 60 * 1000;
    const calculatedEndsAt = new Date(startedAt.getTime() + durationMs);

    let endsAt = calculatedEndsAt;
    if (competition.examEndsAt) {
      const compEndsAt = new Date(competition.examEndsAt);
      if (compEndsAt < calculatedEndsAt) {
        endsAt = compEndsAt;
      }
    }

    // Initialize answer blanks
    const initialAnswers = questionSnapshot.map((q) => ({
      questionId: q.questionId,
      selectedOption: null,
      isMarkedForReview: false,
      clientVersion: 0,
      clientTimestamp: null,
      savedAt: startedAt
    }));

    try {
      const newAttempt = await Attempt.create({
        competitionId: competition._id,
        studentId,
        registrationId: registration._id,
        status: 'IN_PROGRESS',
        startedAt,
        endsAt,
        questionSnapshot,
        answers: initialAnswers
      });

      return res.status(201).json({
        success: true,
        message: 'Examination started successfully.',
        isResumed: false,
        attempt: newAttempt.toStudentJSON()
      });
    } catch (createErr) {
      // Concurrency race: another request created the attempt at the exact same millisecond
      if (createErr.code === 11000) {
        const found = await Attempt.findOne({ competitionId: competition._id, studentId });
        if (found) {
          return res.status(200).json({
            success: true,
            message: 'Resuming your active examination attempt.',
            isResumed: true,
            attempt: found.toStudentJSON()
          });
        }
      }
      throw createErr;
    }
  } catch (err) {
    next(err);
  }
};

/**
 * 2. Get Current Student's Active Attempt Details
 * GET /api/v1/attempts/:attemptId
 */
export const getAttemptDetails = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const studentId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid attempt ID format.',
          details: [],
          requestId: req.id
        }
      });
    }

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Examination attempt not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Strict Ownership Enforcement: Student can only view their own attempt
    if (attempt.studentId.toString() !== studentId.toString()) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to view another student’s examination attempt.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Expiry check
    const now = new Date();
    if (attempt.status === 'IN_PROGRESS' && now >= new Date(attempt.endsAt)) {
      attempt.status = 'AUTO_SUBMITTED';
      attempt.submittedAt = attempt.endsAt;
      await attempt.save();
    }

    return res.status(200).json({
      success: true,
      attempt: attempt.toStudentJSON()
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 3. Answer Autosave (Real-time single or batch save)
 * PATCH /api/v1/attempts/:attemptId/answers
 */
export const autosaveAnswers = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const studentId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid attempt ID format.',
          details: [],
          requestId: req.id
        }
      });
    }

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Examination attempt not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 1. Strict Ownership Enforcement
    if (attempt.studentId.toString() !== studentId.toString()) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You cannot save answers to another student’s examination attempt.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 2. Status Enforcement: Prevent updates after submission
    if (['SUBMITTED', 'AUTO_SUBMITTED'].includes(attempt.status)) {
      return res.status(400).json({
        error: {
          code: 'ATTEMPT_CLOSED',
          message: 'Answers cannot be modified after final submission.',
          details: [`Attempt status is ${attempt.status}`],
          requestId: req.id
        }
      });
    }

    // 3. Server-Authoritative Timer Expiry Check
    const now = new Date();
    if (now >= new Date(attempt.endsAt)) {
      attempt.status = 'AUTO_SUBMITTED';
      attempt.submittedAt = attempt.endsAt;
      await attempt.save();

      return res.status(400).json({
        error: {
          code: 'EXAM_EXPIRED',
          message: 'The examination time limit has expired. Responses have been auto-submitted and cannot be modified.',
          details: [`Ended at: ${attempt.endsAt.toISOString()}`],
          requestId: req.id
        }
      });
    }

    // 4. Parse incoming answers (array or single object)
    let incomingList = [];
    if (Array.isArray(req.body.answers)) {
      incomingList = req.body.answers;
    } else if (req.body.questionId) {
      incomingList = [req.body];
    } else {
      return res.status(400).json({
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'Payload must include an answers array or question response object.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Build lookup set of valid question IDs in the snapshot
    const validQuestionIds = new Set(
      attempt.questionSnapshot.map((q) => q.questionId.toString())
    );

    // Validate all incoming answers and apply atomic positional updates
    for (const item of incomingList) {
      if (!item.questionId || !validQuestionIds.has(item.questionId.toString())) {
        return res.status(400).json({
          error: {
            code: 'INVALID_QUESTION_ID',
            message: `Question ID '${item.questionId}' is not part of this examination attempt.`,
            details: [],
            requestId: req.id
          }
        });
      }

      // Normalize selected option
      let opt = item.selectedOption;
      if (opt !== null && opt !== undefined && opt !== '') {
        opt = opt.toString().trim().toUpperCase();
        if (!['A', 'B', 'C', 'D'].includes(opt)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_OPTION',
              message: `Option value '${opt}' is invalid. Allowed options are 'A', 'B', 'C', 'D', or null.`,
              details: [],
              requestId: req.id
            }
          });
        }
      } else {
        opt = null; // Clear response
      }

      const clientVersion = typeof item.clientVersion === 'number' ? item.clientVersion : 0;
      const clientTimestamp = item.clientTimestamp ? new Date(item.clientTimestamp) : null;
      const isMarked = typeof item.isMarkedForReview === 'boolean' ? item.isMarkedForReview : false;

      // Atomic Positional Update per question with $elemMatch for accurate subdocument versioning:
      // Condition 1: status must be IN_PROGRESS
      // Condition 2: timer must not be expired (endsAt > now)
      // Condition 3: EXACT question subdocument must have clientVersion <= incoming clientVersion (out-of-order protection)
      const updateResult = await Attempt.updateOne(
        {
          _id: attempt._id,
          status: 'IN_PROGRESS',
          endsAt: { $gt: now },
          answers: {
            $elemMatch: {
              questionId: item.questionId,
              $or: [
                { clientVersion: { $lte: clientVersion } },
                { clientVersion: { $exists: false } }
              ]
            }
          }
        },
        {
          $set: {
            'answers.$.selectedOption': opt,
            'answers.$.isMarkedForReview': isMarked,
            'answers.$.clientVersion': clientVersion,
            'answers.$.clientTimestamp': clientTimestamp,
            'answers.$.savedAt': now,
            lastSavedAt: now
          }
        }
      );

      // If matchedCount === 0, verify why it didn't match:
      // (a) attempt was closed / submitted
      // (b) exam expired
      // (c) stale update (older clientVersion arrived late)
      if (updateResult.matchedCount === 0) {
        const current = await Attempt.findById(attempt._id);
        if (['SUBMITTED', 'AUTO_SUBMITTED'].includes(current?.status)) {
          return res.status(400).json({
            error: {
              code: 'ATTEMPT_CLOSED',
              message: 'Answers cannot be modified after final submission.',
              details: [`Attempt status is ${current.status}`],
              requestId: req.id
            }
          });
        }
        if (now >= new Date(current?.endsAt)) {
          return res.status(400).json({
            error: {
              code: 'EXAM_EXPIRED',
              message: 'The examination time limit has expired. Responses have been auto-submitted and cannot be modified.',
              details: [],
              requestId: req.id
            }
          });
        }
        // Stale update (already has higher clientVersion): safely ignored, preserving newer answer
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Answers saved successfully.',
      savedAt: now,
      serverTime: now.toISOString()
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 4. Final Submission of Exam Attempt
 * POST /api/v1/attempts/:attemptId/submit
 */
export const submitAttempt = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const studentId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid attempt ID format.',
          details: [],
          requestId: req.id
        }
      });
    }

    // First check existing status for idempotency and ownership
    const existing = await Attempt.findOne({ _id: attemptId, studentId });
    if (!existing) {
      const anyAttempt = await Attempt.findById(attemptId);
      if (anyAttempt) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'You cannot submit another student’s examination attempt.',
            details: [],
            requestId: req.id
          }
        });
      }
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Examination attempt not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Idempotent submission: if already submitted, return existing state
    if (['SUBMITTED', 'AUTO_SUBMITTED'].includes(existing.status)) {
      return res.status(200).json({
        success: true,
        message: 'Examination attempt was already submitted.',
        status: existing.status,
        submittedAt: existing.submittedAt,
        alreadySubmitted: true
      });
    }

    const now = new Date();
    const isAuto = now >= new Date(existing.endsAt);
    const targetStatus = isAuto ? 'AUTO_SUBMITTED' : 'SUBMITTED';
    const submittedAt = isAuto ? existing.endsAt : now;

    // Atomic transition from IN_PROGRESS -> SUBMITTED/AUTO_SUBMITTED
    const finalized = await Attempt.findOneAndUpdate(
      {
        _id: attemptId,
        studentId,
        status: 'IN_PROGRESS'
      },
      {
        $set: {
          status: targetStatus,
          submittedAt: submittedAt
        }
      },
      { returnDocument: 'after' }
    );

    if (!finalized) {
      const current = await Attempt.findById(attemptId);
      return res.status(200).json({
        success: true,
        message: 'Examination attempt was already submitted.',
        status: current?.status || targetStatus,
        submittedAt: current?.submittedAt || submittedAt,
        alreadySubmitted: true
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Examination submitted successfully.',
      status: finalized.status,
      submittedAt: finalized.submittedAt,
      alreadySubmitted: false
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 5. Admin: List All Examination Attempts for a Competition (Monitoring)
 * GET /api/v1/admin/competitions/:id/attempts
 */
export const listAdminAttempts = async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(competitionId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid competition ID format.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Server-Side Expiry Sweeper: Automatically sweep any expired attempts
    await sweepExpiredAttempts();

    const attempts = await Attempt.find({ competitionId })
      .populate('studentId', 'fullName mobile mobileNormalized school classOrGrade')
      .populate('registrationId', 'rollNumber examMode')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: attempts.length,
      attempts: attempts.map((a) => a.toAdminJSON())
    });
  } catch (err) {
    next(err);
  }
};
