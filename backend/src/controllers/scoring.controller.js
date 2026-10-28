import { Competition } from '../models/competition.model.js';
import { Result } from '../models/result.model.js';
import { EvaluationAuditLog } from '../models/evaluationAuditLog.model.js';
import { evaluateCompetition, assignStandardRanks } from '../services/scoring.service.js';

/**
 * Admin / Committee Head: Trigger evaluation of submitted exam attempts
 */
export const evaluateCompetitionHandler = async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;
    const { reason, isReEvaluation, allowUnverifiedOmr } = req.body;

    const evaluation = await evaluateCompetition({
      competitionId,
      actor: req.user,
      reason: reason || '',
      isReEvaluation: Boolean(isReEvaluation),
      allowUnverifiedOmr: Boolean(allowUnverifiedOmr)
    });

    res.status(200).json({
      success: true,
      message: evaluation.evaluatedCount > 0
        ? `Successfully evaluated ${evaluation.evaluatedCount} candidate submission(s) (${evaluation.evaluatedOnlineCount || 0} online, ${evaluation.evaluatedOmrCount || 0} OMR).`
        : 'Competition evaluation completed. No submitted attempts or verified OMR sheets were found to evaluate.',
      evaluation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin / Committee Head: Configure tie-breaker criteria order
 */
export const updateTieBreakerRulesHandler = async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;
    const { tieBreakerRules } = req.body;

    const allowedCriteria = ['FINAL_SCORE', 'CORRECT_ANSWERS', 'INCORRECT_ANSWERS', 'SUBMISSION_TIME'];

    if (!Array.isArray(tieBreakerRules) || tieBreakerRules.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_CRITERIA',
          message: 'tieBreakerRules must be a non-empty array of criteria.',
          details: [`Allowed criteria: ${allowedCriteria.join(', ')}`],
          requestId: req.id
        }
      });
    }

    const invalidRules = tieBreakerRules.filter((r) => !allowedCriteria.includes(r));
    if (invalidRules.length > 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_CRITERIA',
          message: `Invalid tie-breaker criteria: ${invalidRules.join(', ')}`,
          details: [`Allowed criteria: ${allowedCriteria.join(', ')}`],
          requestId: req.id
        }
      });
    }

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

    if (competition.resultStatus === 'PUBLISHED') {
      return res.status(400).json({
        error: {
          code: 'CANNOT_MUTATE_PUBLISHED',
          message: 'Cannot change tie-breaking rules on a published competition. Request revision first.',
          details: [],
          requestId: req.id
        }
      });
    }

    competition.tieBreakerRules = tieBreakerRules;
    await competition.save();

    // Re-rank existing evaluated results if present
    const existingResults = await Result.find({ competitionId });
    if (existingResults.length > 0) {
      assignStandardRanks(existingResults, tieBreakerRules);
      const bulkOps = existingResults.map((r) => ({
        updateOne: {
          filter: { _id: r._id },
          update: { $set: { rank: r.rank } }
        }
      }));
      await Result.bulkWrite(bulkOps);
    }

    await EvaluationAuditLog.create({
      competitionId: competition._id,
      actorId: req.user._id,
      actorRole: req.user.role,
      actorName: req.user.fullName,
      action: 'UPDATE_TIE_BREAKER',
      scoringVersion: competition.scoringVersion || 1,
      reason: req.body.reason || 'Tie-breaker criteria updated',
      details: { tieBreakerRules },
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Tie-breaker criteria updated successfully and ranks recalculated.',
      tieBreakerRules: competition.tieBreakerRules
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin / Committee Head: Move result status to PENDING_APPROVAL
 */
export const requestApprovalHandler = async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;

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

    if (competition.resultStatus === 'NOT_EVALUATED') {
      return res.status(400).json({
        error: {
          code: 'NOT_EVALUATED',
          message: 'Cannot request approval for an unevaluated competition. Please trigger evaluation first.',
          details: [],
          requestId: req.id
        }
      });
    }

    const resultCount = await Result.countDocuments({ competitionId });
    if (resultCount === 0) {
      return res.status(400).json({
        error: {
          code: 'NO_RESULTS',
          message: 'Cannot request approval: No evaluated results exist for this competition.',
          details: [],
          requestId: req.id
        }
      });
    }

    competition.resultStatus = 'PENDING_APPROVAL';
    await competition.save();

    await EvaluationAuditLog.create({
      competitionId: competition._id,
      actorId: req.user._id,
      actorRole: req.user.role,
      actorName: req.user.fullName,
      action: 'REQUEST_APPROVAL',
      scoringVersion: competition.scoringVersion || 1,
      reason: req.body.reason || 'Evaluation submitted for Committee Head review and approval',
      details: { resultCount },
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Results have been submitted for Committee Head approval.',
      resultStatus: competition.resultStatus
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Committee Head ONLY: Approve results
 */
export const approveResultsHandler = async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;

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

    if (competition.resultStatus !== 'PENDING_APPROVAL' && competition.resultStatus !== 'EVALUATED') {
      return res.status(400).json({
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot approve results in '${competition.resultStatus}' state. Must be PENDING_APPROVAL or EVALUATED.`,
          details: [],
          requestId: req.id
        }
      });
    }

    const resultCount = await Result.countDocuments({ competitionId });
    if (resultCount === 0) {
      return res.status(400).json({
        error: {
          code: 'NO_RESULTS',
          message: 'Cannot approve results: No evaluated student results exist for this competition.',
          details: [],
          requestId: req.id
        }
      });
    }

    const approvedAt = new Date();
    competition.resultStatus = 'APPROVED';
    competition.approvedAt = approvedAt;
    competition.approvedBy = req.user._id;
    await competition.save();

    await EvaluationAuditLog.create({
      competitionId: competition._id,
      actorId: req.user._id,
      actorRole: req.user.role,
      actorName: req.user.fullName,
      action: 'APPROVE',
      scoringVersion: competition.scoringVersion || 1,
      reason: req.body.reason || 'Formal approval granted by Committee Head',
      details: { resultCount, approvedAt },
      timestamp: approvedAt
    });

    res.status(200).json({
      success: true,
      message: 'Results and merit list have been formally approved by Committee Head.',
      resultStatus: competition.resultStatus,
      approvedAt
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Committee Head ONLY: Reject results / Request revision
 */
export const rejectResultsHandler = async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({
        error: {
          code: 'REASON_REQUIRED',
          message: 'A detailed reason (at least 3 characters) is required when rejecting or requesting revision.',
          details: [],
          requestId: req.id
        }
      });
    }

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

    competition.resultStatus = 'REVISION_REQUIRED';
    competition.revisionReason = reason.trim();
    await competition.save();

    await EvaluationAuditLog.create({
      competitionId: competition._id,
      actorId: req.user._id,
      actorRole: req.user.role,
      actorName: req.user.fullName,
      action: 'REVISION_REQUIRED',
      scoringVersion: competition.scoringVersion || 1,
      reason: reason.trim(),
      details: { previousStatus: competition.resultStatus },
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Results rejected and marked as REVISION_REQUIRED. Revision reason recorded.',
      resultStatus: competition.resultStatus,
      revisionReason: competition.revisionReason
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Committee Head ONLY: Publish results
 */
export const publishResultsHandler = async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;
    const { isPublicMeritListEnabled } = req.body;

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

    // Gated: Can only publish if APPROVED by Committee Head!
    if (competition.resultStatus !== 'APPROVED') {
      return res.status(400).json({
        error: {
          code: 'CANNOT_PUBLISH_UNAPPROVED',
          message: `Cannot publish results in '${competition.resultStatus}' state. Prior Committee Head approval is strictly required.`,
          details: [],
          requestId: req.id
        }
      });
    }

    const publishedAt = new Date();
    competition.resultStatus = 'PUBLISHED';
    competition.resultsPublishedAt = publishedAt;
    competition.resultsPublishedBy = req.user._id;

    if (isPublicMeritListEnabled !== undefined) {
      competition.isPublicMeritListEnabled = Boolean(isPublicMeritListEnabled);
    }

    await competition.save();

    await EvaluationAuditLog.create({
      competitionId: competition._id,
      actorId: req.user._id,
      actorRole: req.user.role,
      actorName: req.user.fullName,
      action: 'PUBLISH',
      scoringVersion: competition.scoringVersion || 1,
      reason: req.body.reason || 'Official publication authorized by Committee Head',
      details: {
        isPublicMeritListEnabled: competition.isPublicMeritListEnabled,
        publishedAt
      },
      timestamp: publishedAt
    });

    res.status(200).json({
      success: true,
      message: 'Results have been officially published. Students can now view their scorecards.',
      resultStatus: competition.resultStatus,
      isPublicMeritListEnabled: competition.isPublicMeritListEnabled,
      resultsPublishedAt: publishedAt
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Committee Head ONLY: Unpublish results / Request correction on published results
 */
export const unpublishResultsHandler = async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({
        error: {
          code: 'REASON_REQUIRED',
          message: 'A mandatory reason (at least 3 characters) is required to unpublish or revise published results.',
          details: [],
          requestId: req.id
        }
      });
    }

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

    competition.resultStatus = 'REVISION_REQUIRED';
    competition.revisionReason = reason.trim();
    competition.scoringVersion = (competition.scoringVersion || 1) + 1;
    await competition.save();

    await EvaluationAuditLog.create({
      competitionId: competition._id,
      actorId: req.user._id,
      actorRole: req.user.role,
      actorName: req.user.fullName,
      action: 'UNPUBLISH',
      scoringVersion: competition.scoringVersion,
      reason: reason.trim(),
      details: { unpublishTimestamp: new Date() },
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Published results have been recalled. Status transitioned to REVISION_REQUIRED for controlled re-evaluation.',
      resultStatus: competition.resultStatus,
      scoringVersion: competition.scoringVersion
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Committee Head ONLY: Toggle public merit list visibility
 */
export const togglePublicMeritListHandler = async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;
    const { isPublicMeritListEnabled } = req.body;

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

    competition.isPublicMeritListEnabled = Boolean(isPublicMeritListEnabled);
    await competition.save();

    await EvaluationAuditLog.create({
      competitionId: competition._id,
      actorId: req.user._id,
      actorRole: req.user.role,
      actorName: req.user.fullName,
      action: 'TOGGLE_PUBLIC_MERIT_LIST',
      scoringVersion: competition.scoringVersion || 1,
      reason: req.body.reason || `Public merit list visibility set to ${competition.isPublicMeritListEnabled}`,
      details: { isPublicMeritListEnabled: competition.isPublicMeritListEnabled },
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      message: `Public merit list visibility has been ${competition.isPublicMeritListEnabled ? 'enabled' : 'disabled'}.`,
      isPublicMeritListEnabled: competition.isPublicMeritListEnabled
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin / Committee Head: Get internal comprehensive merit list
 */
export const getInternalMeritListHandler = async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;

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

    const results = await Result.find({ competitionId }).sort({ rank: 1, finalScore: -1 });
    const auditLogs = await EvaluationAuditLog.find({ competitionId })
      .sort({ timestamp: -1 })
      .limit(20);

    res.status(200).json({
      success: true,
      competition: {
        id: competition._id.toString(),
        title: competition.title,
        resultStatus: competition.resultStatus,
        scoringVersion: competition.scoringVersion,
        tieBreakerRules: competition.tieBreakerRules,
        isPublicMeritListEnabled: Boolean(competition.isPublicMeritListEnabled),
        evaluatedAt: competition.evaluatedAt,
        approvedAt: competition.approvedAt,
        resultsPublishedAt: competition.resultsPublishedAt,
        revisionReason: competition.revisionReason
      },
      meritList: results.map((r) => r.toAdminMeritJSON()),
      auditLogs: auditLogs.map((log) => ({
        id: log._id.toString(),
        actorRole: log.actorRole,
        actorName: log.actorName,
        action: log.action,
        scoringVersion: log.scoringVersion,
        reason: log.reason,
        details: log.details,
        timestamp: log.timestamp
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Student ONLY: Get own verified scorecard
 * Strictly privacy-preserving: 403 / 404 if not published.
 */
export const getMyResultHandler = async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;
    const studentId = req.user._id;

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

    // Zero-Leak Gate: Results MUST be PUBLISHED
    if (competition.resultStatus !== 'PUBLISHED') {
      return res.status(403).json({
        error: {
          code: 'RESULT_NOT_PUBLISHED',
          message: 'Exam results for this competition are currently under committee review and have not been published yet.',
          details: [],
          requestId: req.id
        }
      });
    }

    const result = await Result.findOne({ competitionId, studentId });
    if (!result) {
      return res.status(404).json({
        error: {
          code: 'RESULT_NOT_FOUND',
          message: 'No evaluated result found for your account in this competition.',
          details: [],
          requestId: req.id
        }
      });
    }

    res.status(200).json({
      success: true,
      result: result.toStudentJSON(competition.title, competition.isPublicMeritListEnabled)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Student ONLY: List all published results for current student
 */
export const getMyAllResultsHandler = async (req, res, next) => {
  try {
    const studentId = req.user._id;

    // Find all results for this student
    const results = await Result.find({ studentId }).populate('competitionId', 'title resultStatus isPublicMeritListEnabled resultsPublishedAt');

    // Filter ONLY those whose competition is officially PUBLISHED
    const publishedResults = results.filter((r) => r.competitionId && r.competitionId.resultStatus === 'PUBLISHED');

    res.status(200).json({
      success: true,
      results: publishedResults.map((r) => r.toStudentJSON(r.competitionId?.title || 'Competition', r.competitionId?.isPublicMeritListEnabled))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Public / Student: View approved public merit list
 * Exposes ONLY safe public fields when explicitly enabled by Committee Head and PUBLISHED.
 */
export const getPublicMeritListHandler = async (req, res, next) => {
  try {
    const { id: competitionId } = req.params;

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

    // Strict Gate: Must be PUBLISHED and isPublicMeritListEnabled must be true
    if (competition.resultStatus !== 'PUBLISHED' || !competition.isPublicMeritListEnabled) {
      return res.status(403).json({
        error: {
          code: 'MERIT_LIST_NOT_PUBLIC',
          message: 'The public merit list for this competition is not available or has not been enabled by the committee.',
          details: [],
          requestId: req.id
        }
      });
    }

    const results = await Result.find({ competitionId }).sort({ rank: 1, finalScore: -1 });

    res.status(200).json({
      success: true,
      competition: {
        id: competition._id.toString(),
        title: competition.title,
        resultsPublishedAt: competition.resultsPublishedAt,
        totalCandidates: results.length
      },
      meritList: results.map((r) => r.toPublicMeritJSON())
    });
  } catch (error) {
    next(error);
  }
};
