import { Competition } from '../models/competition.model.js';
import { Question } from '../models/question.model.js';
import { Attempt } from '../models/attempt.model.js';
import { OmrSubmission } from '../models/omrSubmission.model.js';
import { Result } from '../models/result.model.js';
import { EvaluationAuditLog } from '../models/evaluationAuditLog.model.js';
import { sweepExpiredAttempts } from './examSweeper.service.js';

/**
 * Decimal-Safe Rounding Helper (2 decimal places)
 * Prevents IEEE-754 floating-point inaccuracies (e.g. 0.1 + 0.2 = 0.30000000000000004).
 */
export const round2 = (val) => {
  if (val == null || isNaN(val)) return 0;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
};

/**
 * Trusted Single Attempt / OMR Answer-Set Scoring Pipeline
 * Pure, decoupled calculation function.
 * 
 * Precedence Rules:
 * 1. Positive Marks:
 *    - Question document marks (if > 0).
 *    - Fallback: competition.marksPerQuestion (if > 0).
 *    - Fallback default: 1.0.
 * 2. Negative Deduction:
 *    - If competition.negativeMarking.enabled is false: deduction = 0.
 *    - If competition.negativeMarking.enabled is true:
 *        - Question-level negativeMarks (if > 0).
 *        - Fallback: competition negativeMarking.deduction or perWrongMark.
 *        - Fallback default: 0.25.
 * 3. Unanswered Questions:
 *    - Awarded 0 marks, 0 deduction.
 * 4. Score Floor:
 *    - Default: 0 (no negative final score).
 *    - If scoreFloorZero is false: raw score is preserved.
 *
 * @param {Object} params
 * @param {Array<Object>} params.questions - Authoritative question definitions with correctOption
 * @param {Array<Object>} params.answers - Selected options from attempt or OMR scanner [{ questionId, selectedOption }]
 * @param {Object} params.competitionConfig - Marking configuration
 * @returns {Object} Calculated metrics
 */
export function scoreAnswerSheet({ questions, answers = [], competitionConfig = {} }) {
  const totalQuestions = questions.length;
  let attemptedQuestions = 0;
  let correctAnswers = 0;
  let incorrectAnswers = 0;
  let unansweredQuestions = 0;
  let positiveMarks = 0;
  let negativeDeduction = 0;
  let maximumMarks = 0;

  const itemBreakdown = [];

  // Map answers by questionId string for O(1) lookup
  const answerMap = new Map();
  for (const ans of answers) {
    if (ans && ans.questionId) {
      answerMap.set(ans.questionId.toString(), ans.selectedOption);
    }
  }

  const negEnabled = Boolean(competitionConfig.negativeMarking?.enabled);
  const compNegDeduction = competitionConfig.negativeMarking?.deduction ?? 
                           competitionConfig.negativeMarking?.perWrongMark ?? 0;
  const compMarksPerQ = competitionConfig.marksPerQuestion != null && competitionConfig.marksPerQuestion > 0
    ? Number(competitionConfig.marksPerQuestion)
    : 1;

  for (const q of questions) {
    const qIdStr = (q._id || q.id || q.questionId).toString();
    const correctOpt = q.correctOption;

    // 1. Authoritative Question Marks
    const qMarks = q.marks != null && q.marks > 0 ? Number(q.marks) : compMarksPerQ;
    const roundedQMarks = round2(qMarks);
    maximumMarks = round2(maximumMarks + roundedQMarks);

    // 2. Authoritative Negative Marks
    let qNeg = 0;
    if (negEnabled) {
      if (q.negativeMarks != null && q.negativeMarks > 0) {
        qNeg = Number(q.negativeMarks);
      } else if (compNegDeduction > 0) {
        qNeg = Number(compNegDeduction);
      }
    }
    const roundedQNeg = round2(qNeg);

    // 3. Evaluate Student / OMR Response
    const selectedOpt = answerMap.has(qIdStr) ? answerMap.get(qIdStr) : null;
    const hasAttempted = selectedOpt !== null && selectedOpt !== undefined && selectedOpt !== '' && selectedOpt !== 'BLANK';

    if (hasAttempted) {
      attemptedQuestions++;
      if (selectedOpt === correctOpt) {
        correctAnswers++;
        positiveMarks = round2(positiveMarks + roundedQMarks);
        itemBreakdown.push({
          questionId: q._id || q.id || q.questionId,
          selectedOption: selectedOpt,
          correctOption: correctOpt,
          isCorrect: true,
          isAttempted: true,
          marksAwarded: roundedQMarks,
          marksDeducted: 0
        });
      } else {
        incorrectAnswers++;
        negativeDeduction = round2(negativeDeduction + roundedQNeg);
        itemBreakdown.push({
          questionId: q._id || q.id || q.questionId,
          selectedOption: selectedOpt,
          correctOption: correctOpt,
          isCorrect: false,
          isAttempted: true,
          marksAwarded: 0,
          marksDeducted: roundedQNeg
        });
      }
    } else {
      unansweredQuestions++;
      itemBreakdown.push({
        questionId: q._id || q.id || q.questionId,
        selectedOption: null,
        correctOption: correctOpt,
        isCorrect: false,
        isAttempted: false,
        marksAwarded: 0,
        marksDeducted: 0
      });
    }
  }

  // 4. Score Floor application
  const rawScore = round2(positiveMarks - negativeDeduction);
  let finalScore = rawScore;
  const scoreFloorZero = competitionConfig.scoreFloorZero !== false;

  if (scoreFloorZero && rawScore < 0) {
    finalScore = 0;
  }

  return {
    totalQuestions,
    attemptedQuestions,
    correctAnswers,
    incorrectAnswers,
    unansweredQuestions,
    positiveMarks: round2(positiveMarks),
    negativeDeduction: round2(negativeDeduction),
    finalScore: round2(finalScore),
    maximumMarks: round2(maximumMarks),
    itemBreakdown
  };
}

/**
 * Compare two scored result objects based on the configured tie-breaker order.
 * Returns negative if 'a' should rank ahead of 'b', positive if 'b' ahead of 'a', 0 if tied.
 */
export function compareResults(a, b, tieBreakerOrder = ['FINAL_SCORE', 'CORRECT_ANSWERS', 'INCORRECT_ANSWERS', 'SUBMISSION_TIME']) {
  for (const criterion of tieBreakerOrder) {
    if (criterion === 'FINAL_SCORE') {
      if (b.finalScore !== a.finalScore) {
        return b.finalScore - a.finalScore; // Higher score comes first
      }
    } else if (criterion === 'CORRECT_ANSWERS') {
      if (b.correctAnswers !== a.correctAnswers) {
        return b.correctAnswers - a.correctAnswers; // Higher correct answers comes first
      }
    } else if (criterion === 'INCORRECT_ANSWERS') {
      if (a.incorrectAnswers !== b.incorrectAnswers) {
        return a.incorrectAnswers - b.incorrectAnswers; // Lower incorrect answers comes first
      }
    } else if (criterion === 'SUBMISSION_TIME') {
      const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : Infinity;
      const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : Infinity;
      if (timeA !== timeB) {
        return timeA - timeB; // Earlier submission comes first
      }
    }
  }
  return 0; // Exactly tied on all configured criteria
}

/**
 * Standard Competition Ranking (1224 ranking):
 * Ties receive equal rank; the next item receives rank corresponding to its 1-based position.
 * Example: if two students tie for rank 1, both are 1, and the next student is rank 3.
 */
export function assignStandardRanks(results, tieBreakerOrder) {
  if (!results || results.length === 0) return [];

  // Sort according to tie-breaker criteria
  results.sort((a, b) => compareResults(a, b, tieBreakerOrder));

  for (let i = 0; i < results.length; i++) {
    if (i === 0) {
      results[0].rank = 1;
    } else {
      const prev = results[i - 1];
      const curr = results[i];
      if (compareResults(prev, curr, tieBreakerOrder) === 0) {
        curr.rank = prev.rank; // Tied
      } else {
        curr.rank = i + 1; // Standard competition rank (1-based index)
      }
    }
  }

  return results;
}

/**
 * Central Competition Evaluation Orchestrator
 * Evaluates all submitted/auto-submitted online attempts AND verified OMR submissions for a competition,
 * applies scoring and tie-breaking, persists unified results, and updates audit log.
 */
export async function evaluateCompetition({ competitionId, actor, reason = '', isReEvaluation = false, allowUnverifiedOmr = false }) {
  // 1. Startup & pre-scoring reconciliation: sweep expired attempts
  await sweepExpiredAttempts();

  // 2. Fetch Competition
  const competition = await Competition.findById(competitionId);
  if (!competition) {
    const error = new Error('Competition not found');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  // 3. Status Gates
  if (competition.resultStatus === 'PUBLISHED') {
    const error = new Error('Published results cannot be silently overwritten. Request revision first through the Committee Head.');
    error.statusCode = 400;
    error.code = 'CANNOT_OVERWRITE_PUBLISHED';
    throw error;
  }

  if (competition.resultStatus === 'EVALUATED' && !isReEvaluation && !reason) {
    const error = new Error('Competition has already been evaluated. Provide a re-evaluation reason to re-evaluate.');
    error.statusCode = 400;
    error.code = 'ALREADY_EVALUATED';
    throw error;
  }

  if (isReEvaluation && (!reason || reason.trim().length < 3)) {
    const error = new Error('A detailed reason (min 3 characters) is required for re-evaluation.');
    error.statusCode = 400;
    error.code = 'REASON_REQUIRED';
    throw error;
  }

  // 4. Fetch Authoritative Questions with Correct Answer Keys
  const questions = await Question.find({ competitionId, isActive: true })
    .select('+correctOption')
    .sort({ order: 1 });

  if (questions.length === 0) {
    const error = new Error('Cannot evaluate competition: No active questions found in question bank.');
    error.statusCode = 400;
    error.code = 'NO_QUESTIONS';
    throw error;
  }

  // 5. Fetch Valid Submitted Attempts (Strictly exclude IN_PROGRESS)
  const attempts = await Attempt.find({
    competitionId,
    status: { $in: ['SUBMITTED', 'AUTO_SUBMITTED'] }
  }).populate('studentId', 'fullName mobileNormalized school classOrGrade')
    .populate('registrationId', 'rollNumber');

  // 6. Fetch Verified OMR Submissions & Check Pending Unverified Submissions Guard
  const unverifiedOmrCount = await OmrSubmission.countDocuments({
    competitionId,
    status: { $in: ['UPLOADED', 'QUEUED', 'PROCESSING', 'NEEDS_REVIEW', 'IN_REVIEW', 'PARTIALLY_VERIFIED', 'REOPENED'] }
  });

  if (unverifiedOmrCount > 0 && !allowUnverifiedOmr) {
    const error = new Error(`Cannot evaluate competition: ${unverifiedOmrCount} OMR submission(s) are pending review or verification. Please verify all OMR submissions or specify allowUnverifiedOmr: true.`);
    error.statusCode = 400;
    error.code = 'UNVERIFIED_OMR_SUBMISSIONS_REMAIN';
    error.details = { unverifiedCount: unverifiedOmrCount };
    throw error;
  }

  const verifiedOmrSubmissions = await OmrSubmission.find({
    competitionId,
    status: 'VERIFIED'
  }).populate('studentId', 'fullName mobileNormalized school classOrGrade')
    .populate('registrationId', 'rollNumber');

  const scoringVersion = isReEvaluation 
    ? (competition.scoringVersion || 1) + 1 
    : (competition.scoringVersion || 1);

  // 7. Score Each Online Attempt and Verified OMR Submission
  const intermediateResults = [];
  const compConfig = {
    negativeMarking: competition.negativeMarking,
    marksPerQuestion: competition.marksPerQuestion,
    scoreFloorZero: competition.scoreFloorZero !== false
  };

  // Score Online Attempts
  for (const att of attempts) {
    const breakdown = scoreAnswerSheet({
      questions,
      answers: att.answers,
      competitionConfig: compConfig
    });

    intermediateResults.push({
      attempt: att,
      omrSubmission: null,
      competitionId: competition._id,
      studentId: att.studentId?._id || att.studentId,
      registrationId: att.registrationId?._id || att.registrationId,
      rollNumber: att.registrationId?.rollNumber || 'UNKNOWN',
      studentName: att.studentId?.fullName || 'Unknown Student',
      school: att.studentId?.school || '',
      classOrGrade: att.studentId?.classOrGrade || '',
      mode: att.mode || 'ONLINE_MCQ',
      submittedAt: att.submittedAt || att.endsAt,
      scoringVersion,
      ...breakdown
    });
  }

  // Score Verified OMR Submissions
  for (const sub of verifiedOmrSubmissions) {
    if (!sub.confirmedAnswers || !sub.confirmedAnswers.isFullyVerified) {
      const error = new Error(`Cannot score OMR submission ${sub._id}: Submission is not fully verified.`);
      error.statusCode = 400;
      error.code = 'UNVERIFIED_OMR_SUBMISSION';
      throw error;
    }

    const omrAnswers = questions.map((q, idx) => {
      const qNum = q.order || (idx + 1);
      const qNumStr = qNum.toString();

      // STRICT SCORING DATA INTEGRITY: Every answer entering the scoring engine must have an explicit confirmed state
      const conf = sub.confirmedAnswers.answers instanceof Map
        ? sub.confirmedAnswers.answers.get(qNumStr)
        : sub.confirmedAnswers.answers?.[qNumStr];

      if (!conf || !conf.isConfirmed) {
        const error = new Error(`Cannot score OMR submission ${sub._id}: Question ${qNum} has no confirmed answer in confirmedAnswers. All answers must be explicitly verified before scoring.`);
        error.statusCode = 400;
        error.code = 'UNCONFIRMED_ANSWER_REMAINS';
        error.details = { questionNumber: qNum, submissionId: sub._id };
        throw error;
      }

      let selected = conf.selectedOption;
      if (selected === 'BLANK' || !selected) {
        selected = null;
      }

      return {
        questionId: q._id,
        selectedOption: selected
      };
    });

    const breakdown = scoreAnswerSheet({
      questions,
      answers: omrAnswers,
      competitionConfig: compConfig
    });

    intermediateResults.push({
      attempt: null,
      omrSubmission: sub,
      competitionId: competition._id,
      studentId: sub.studentId?._id || sub.studentId,
      registrationId: sub.registrationId?._id || sub.registrationId,
      rollNumber: sub.registrationId?.rollNumber || sub.rollNumber || 'UNKNOWN',
      studentName: sub.studentId?.fullName || 'Unknown Student',
      school: sub.studentId?.school || '',
      classOrGrade: sub.studentId?.classOrGrade || '',
      mode: 'OMR',
      submittedAt: sub.confirmedAnswers?.verifiedAt || sub.createdAt,
      scoringVersion,
      ...breakdown
    });
  }

  // 8. Apply Tie-Breaking and Assign Standard Competition Ranks
  const tieBreakerOrder = competition.tieBreakerRules && competition.tieBreakerRules.length > 0
    ? competition.tieBreakerRules
    : ['FINAL_SCORE', 'CORRECT_ANSWERS', 'INCORRECT_ANSWERS', 'SUBMISSION_TIME'];

  assignStandardRanks(intermediateResults, tieBreakerOrder);

  // 9. Persist Results Atomically (Bulk Upsert) & Purge Stale Results
  const evaluatedAt = new Date();
  const evaluatedStudentIds = intermediateResults.map((r) => r.studentId);
  await Result.deleteMany({
    competitionId: competition._id,
    studentId: { $nin: evaluatedStudentIds }
  });

  if (intermediateResults.length > 0) {
    const bulkOps = intermediateResults.map((item) => ({
      updateOne: {
        filter: { competitionId: item.competitionId, studentId: item.studentId },
        update: {
          $set: {
            competitionId: item.competitionId,
            studentId: item.studentId,
            attemptId: item.attempt ? item.attempt._id : null,
            omrSubmissionId: item.omrSubmission ? item.omrSubmission._id : null,
            registrationId: item.registrationId,
            rollNumber: item.rollNumber,
            studentName: item.studentName,
            school: item.school,
            classOrGrade: item.classOrGrade,
            mode: item.mode,
            totalQuestions: item.totalQuestions,
            attemptedQuestions: item.attemptedQuestions,
            correctAnswers: item.correctAnswers,
            incorrectAnswers: item.incorrectAnswers,
            unansweredQuestions: item.unansweredQuestions,
            positiveMarks: item.positiveMarks,
            negativeDeduction: item.negativeDeduction,
            finalScore: item.finalScore,
            maximumMarks: item.maximumMarks,
            rank: item.rank,
            scoringVersion: item.scoringVersion,
            evaluatedAt,
            submittedAt: item.submittedAt,
            itemBreakdown: item.itemBreakdown
          }
        },
        upsert: true
      }
    }));

    await Result.bulkWrite(bulkOps);
  }

  // 10. Update Competition Status and Metadata
  competition.resultStatus = 'EVALUATED';
  competition.scoringVersion = scoringVersion;
  competition.evaluatedAt = evaluatedAt;
  competition.evaluatedBy = actor._id;
  await competition.save();

  // 11. Audit Log Entry
  await EvaluationAuditLog.create({
    competitionId: competition._id,
    actorId: actor._id,
    actorRole: actor.role,
    actorName: actor.fullName,
    action: isReEvaluation ? 'RE_EVALUATE' : 'EVALUATE',
    scoringVersion,
    reason: reason || (isReEvaluation ? 'Re-evaluation triggered' : 'Initial scoring evaluation'),
    details: {
      evaluatedCount: intermediateResults.length,
      evaluatedOnlineCount: attempts.length,
      evaluatedOmrCount: verifiedOmrSubmissions.length,
      unverifiedOmrCount,
      scoringVersion,
      tieBreakerOrder,
      maxMarks: intermediateResults[0]?.maximumMarks || 0
    },
    timestamp: evaluatedAt
  });

  return {
    competitionId: competition._id,
    resultStatus: competition.resultStatus,
    scoringVersion,
    evaluatedCount: intermediateResults.length,
    evaluatedOnlineCount: attempts.length,
    evaluatedOmrCount: verifiedOmrSubmissions.length,
    tieBreakerRules: tieBreakerOrder,
    evaluatedAt
  };
}
