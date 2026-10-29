import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { Competition } from '../models/competition.model.js';
import { OmrSubmission } from '../models/omrSubmission.model.js';
import { Result } from '../models/result.model.js';
import {
  ingestOmrFile,
  verifyAndLockRegistration,
  resolveSafeStoragePath,
  MAX_FILE_SIZE,
  MAX_BATCH_SIZE
} from '../services/omrUpload.service.js';
import { alignOmrScan, detectOmrBubbles } from '../services/omrClient.service.js';
import { storage as objectStorage } from '../services/storage.service.js';

// Multer memory storage configuration for secure pre-ingestion validation
const storage = multer.memoryStorage();

const multerUpload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 20 // At most 20 files per multipart batch
  }
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: 20 },
  { name: 'omrSheet', maxCount: 1 }
]);

export const omrUploadMiddleware = (req, res, next) => {
  multerUpload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: {
              code: 'FILE_TOO_LARGE',
              message: `Upload file size exceeds maximum limit of 10 MB per file.`,
              details: [err.message],
              requestId: req.id
            }
          });
        }
        return res.status(400).json({
          error: {
            code: err.code || 'MULTER_UPLOAD_ERROR',
            message: err.message,
            details: [],
            requestId: req.id
          }
        });
      }
      return next(err);
    }
    next();
  });
};

/**
 * Handle multipart upload of OMR scan(s)
 * POST /api/v1/admin/competitions/:id/omr/upload
 */
export async function uploadOmrSubmissions(req, res, next) {
  try {
    const { id: competitionId } = req.params;

    // 1. Verify Competition exists
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

    // 2. Extract uploaded files from multer fields
    const files = [];
    if (req.files) {
      if (req.files.file) files.push(...req.files.file);
      if (req.files.files) files.push(...req.files.files);
      if (req.files.omrSheet) files.push(...req.files.omrSheet);
    } else if (req.file) {
      files.push(req.file);
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        error: {
          code: 'NO_FILES_UPLOADED',
          message: 'Please provide at least one OMR image or PDF file in "file" or "files" field.',
          details: [],
          requestId: req.id
        }
      });
    }

    // 3. Validate total batch size
    const totalBatchBytes = files.reduce((acc, f) => acc + (f.buffer?.length || 0), 0);
    if (totalBatchBytes > MAX_BATCH_SIZE) {
      return res.status(413).json({
        error: {
          code: 'BATCH_TOO_LARGE',
          message: `Total upload batch size (${(totalBatchBytes / (1024 * 1024)).toFixed(2)} MB) exceeds maximum 100 MB limit.`,
          details: [],
          requestId: req.id
        }
      });
    }

    // 4. Ingest each file with atomic mode locking & deduplication
    const results = [];
    const errors = [];

    // Optional parameters from request body for single/sheet upload
    const { registrationId, qrToken } = req.body;

    for (const file of files) {
      try {
        const submission = await ingestOmrFile({
          file,
          competitionId,
          actor: req.user,
          registrationId,
          qrToken,
          clientIp: req.ip
        });

        results.push(submission);
      } catch (err) {
        errors.push({
          filename: file.originalname,
          code: err.code || 'UPLOAD_FAILED',
          message: err.message,
          statusCode: err.statusCode || 500
        });
      }
    }

    // If all files in a single-file request failed, return appropriate error status
    if (results.length === 0 && errors.length > 0) {
      const primaryErr = errors[0];
      return res.status(primaryErr.statusCode).json({
        error: {
          code: primaryErr.code,
          message: primaryErr.message,
          details: errors,
          requestId: req.id
        }
      });
    }

    // Return created submission(s)
    res.status(201).json({
      success: true,
      data: {
        totalUploaded: results.length,
        totalFailed: errors.length,
        submissions: results,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List OMR Submissions for a competition
 * GET /api/v1/admin/competitions/:id/omr/submissions
 */
export async function listOmrSubmissions(req, res, next) {
  try {
    const { id: competitionId } = req.params;
    const { status, page = 1, limit = 20, rollNumber } = req.query;

    const query = { competitionId };

    if (status) {
      query.status = status;
    }

    if (rollNumber) {
      query.rollNumber = new RegExp(rollNumber.trim(), 'i');
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [submissions, total] = await Promise.all([
      OmrSubmission.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('studentId', 'fullName mobile rollNumber')
        .populate('registrationId', 'rollNumber status examMode')
        .populate('uploadedBy', 'fullName mobile role'),
      OmrSubmission.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: {
        submissions,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get single OMR Submission details
 * GET /api/v1/admin/competitions/:id/omr/submissions/:submissionId
 */
export async function getOmrSubmissionById(req, res, next) {
  try {
    const { id: competitionId, submissionId } = req.params;

    const submission = await OmrSubmission.findOne({
      _id: submissionId,
      competitionId
    })
      .populate('studentId', 'fullName mobile rollNumber')
      .populate('registrationId', 'rollNumber status examMode omrSheetToken')
      .populate('uploadedBy', 'fullName mobile role');

    if (!submission) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'OMR Submission not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    res.status(200).json({
      success: true,
      data: submission
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Securely stream private OMR scan image/PDF to authorized administrators
 * GET /api/v1/admin/competitions/:id/omr/submissions/:submissionId/file
 */
export async function downloadPrivateOmrScan(req, res, next) {
  try {
    const { id: competitionId, submissionId } = req.params;

    const submission = await OmrSubmission.findOne({
      _id: submissionId,
      competitionId
    });

    if (!submission) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'OMR Submission not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Retrieve file buffer safely via object storage abstraction or local filesystem fallback
    let fileBuffer = null;
    const absoluteFilePath = resolveSafeStoragePath(submission.storedFilename);

    if (config.storageProvider === 's3') {
      fileBuffer = await objectStorage.getFileBuffer(submission.storedFilename);
    } else if (fs.existsSync(absoluteFilePath)) {
      fileBuffer = fs.readFileSync(absoluteFilePath);
    } else if (await objectStorage.fileExists(submission.storedFilename)) {
      fileBuffer = await objectStorage.getFileBuffer(submission.storedFilename);
    }

    if (!fileBuffer) {
      return res.status(404).json({
        error: {
          code: 'FILE_NOT_FOUND_ON_DISK',
          message: 'The physical file for this submission was not found in private storage.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Set secure headers (no caching of sensitive exam scans)
    res.setHeader('Content-Type', submission.mimeType);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(submission.originalFilename)}"`);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.send(fileBuffer);
  } catch (error) {
    next(error);
  }
}

/**
 * Verify and link QR token to an existing unlinked OMR submission
 * POST /api/v1/admin/competitions/:id/omr/submissions/:submissionId/verify-qr
 */
export async function verifySubmissionQr(req, res, next) {
  try {
    const { id: competitionId, submissionId } = req.params;
    const { qrToken } = req.body;

    if (!qrToken) {
      return res.status(400).json({
        error: {
          code: 'QR_TOKEN_REQUIRED',
          message: 'QR token payload string or object is required.',
          details: [],
          requestId: req.id
        }
      });
    }

    const submission = await OmrSubmission.findOne({
      _id: submissionId,
      competitionId
    });

    if (!submission) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'OMR Submission not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Perform atomic mode locking & registration validation
    const { registration, student, qrData } = await verifyAndLockRegistration({
      competitionId,
      qrToken,
      actorId: req.user._id
    });

    submission.registrationId = registration._id;
    submission.studentId = student._id;
    submission.rollNumber = registration.rollNumber;
    submission.qrData = {
      raw: typeof qrToken === 'string' ? qrToken : JSON.stringify(qrToken),
      verified: true,
      competitionId: qrData.competitionId,
      registrationId: qrData.registrationId,
      omrSheetToken: qrData.omrSheetToken,
      verifiedAt: new Date()
    };
    submission.auditTrail.push({
      action: 'QR_VERIFIED_AND_LINKED',
      performedBy: req.user._id,
      timestamp: new Date(),
      details: {
        registrationId: registration._id,
        rollNumber: registration.rollNumber,
        studentName: student.fullName || student.name
      }
    });

    await submission.save();

    res.status(200).json({
      success: true,
      data: submission
    });
  } catch (error) {
    if (error.code) {
      return res.status(error.statusCode || 400).json({
        error: {
          code: error.code,
          message: error.message,
          details: [],
          requestId: req.id
        }
      });
    }
    next(error);
  }
}

/**
 * Phase 6.4: Execute Fiducial Marker Detection, Alignment & Quality Assessment
 * POST /api/v1/admin/competitions/:id/omr/submissions/:submissionId/process-alignment
 */
export async function processOmrAlignment(req, res, next) {
  try {
    const { id: competitionId, submissionId } = req.params;

    const submission = await OmrSubmission.findOne({
      _id: submissionId,
      competitionId
    });

    if (!submission) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'OMR Submission not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Verify source file exists on disk
    if (!fs.existsSync(submission.storagePath)) {
      return res.status(404).json({
        error: {
          code: 'FILE_NOT_FOUND_ON_DISK',
          message: 'Original scan file not found in private storage.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Safe aligned filename and destination
    const alignedFilename = `aligned_${submission._id}.png`;
    const alignedStoragePath = resolveSafeStoragePath(alignedFilename);

    // Call Python OMR microservice
    const result = await alignOmrScan({
      inputPath: submission.storagePath,
      outputPath: alignedStoragePath
    });

    // Update submission document
    submission.status = result.status || (result.success ? 'PROCESSING' : 'NEEDS_REVIEW');
    submission.rejectionReason = result.rejectionReason || result.error || null;
    submission.qualityMetrics = result.qualityMetrics || null;
    submission.alignment = result.alignment || null;

    if (result.success) {
      submission.alignedFilename = alignedFilename;
      submission.alignedStoragePath = alignedStoragePath;
      submission.alignedAt = new Date();
    }

    submission.auditTrail.push({
      action: result.success ? 'OMR_ALIGNMENT_PROCESSED' : 'OMR_ALIGNMENT_REJECTED',
      performedBy: req.user._id,
      timestamp: new Date(),
      details: {
        status: submission.status,
        confidence: result.alignment?.confidence,
        skewAngleDegrees: result.alignment?.skewAngleDegrees,
        passedQualityGates: result.qualityMetrics?.passedQualityGates,
        rejectionReason: submission.rejectionReason
      }
    });

    await submission.save();

    res.status(200).json({
      success: result.success,
      data: submission
    });
  } catch (error) {
    if (error.code) {
      return res.status(error.statusCode || 500).json({
        error: {
          code: error.code,
          message: error.message,
          details: [],
          requestId: req.id
        }
      });
    }
    next(error);
  }
}

/**
 * Phase 6.4: Download/Stream Private Aligned OMR Scan (Admin/Head only)
 * GET /api/v1/admin/competitions/:id/omr/submissions/:submissionId/aligned-file
 */
export async function downloadAlignedOmrScan(req, res, next) {
  try {
    const { id: competitionId, submissionId } = req.params;

    const submission = await OmrSubmission.findOne({
      _id: submissionId,
      competitionId
    });

    if (!submission || !submission.alignedStoragePath) {
      return res.status(404).json({
        error: {
          code: 'ALIGNED_FILE_NOT_FOUND',
          message: 'Aligned image has not been generated for this submission.',
          details: [],
          requestId: req.id
        }
      });
    }

    let fileBuffer = null;
    const absoluteFilePath = resolveSafeStoragePath(submission.alignedFilename);

    if (config.storageProvider === 's3') {
      fileBuffer = await objectStorage.getFileBuffer(submission.alignedFilename);
    } else if (fs.existsSync(absoluteFilePath)) {
      fileBuffer = fs.readFileSync(absoluteFilePath);
    } else if (await objectStorage.fileExists(submission.alignedFilename)) {
      fileBuffer = await objectStorage.getFileBuffer(submission.alignedFilename);
    }

    if (!fileBuffer) {
      return res.status(404).json({
        error: {
          code: 'FILE_NOT_FOUND_ON_DISK',
          message: 'Physical aligned image file not found in private storage.',
          details: [],
          requestId: req.id
        }
      });
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="aligned_${submission._id}.png"`);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.send(fileBuffer);
  } catch (error) {
    next(error);
  }
}

/**
 * Phase 6.5: Execute Bubble Detection, Fill Measurement & Answer Classification
 * POST /api/v1/admin/competitions/:id/omr/submissions/:submissionId/detect-bubbles
 */
export async function processOmrBubbleDetection(req, res, next) {
  try {
    const { id: competitionId, submissionId } = req.params;

    const submission = await OmrSubmission.findOne({
      _id: submissionId,
      competitionId
    });

    if (!submission) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'OMR Submission not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Require aligned image
    if (!submission.alignedStoragePath || !fs.existsSync(submission.alignedStoragePath)) {
      return res.status(400).json({
        error: {
          code: 'ALIGNED_IMAGE_REQUIRED',
          message: 'OMR submission must have a valid aligned image before bubble detection.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Determine question count (from query, body, or competition)
    let totalQuestions = 50;
    if (req.body?.totalQuestions) {
      totalQuestions = parseInt(req.body.totalQuestions, 10);
    } else {
      const competition = await Competition.findById(competitionId);
      if (competition?.totalQuestions) {
        totalQuestions = competition.totalQuestions;
      }
    }
    totalQuestions = Math.max(1, Math.min(100, totalQuestions || 50));

    // Call Python microservice
    const result = await detectOmrBubbles({
      alignedPath: submission.alignedStoragePath,
      totalQuestions
    });

    // Immutable Machine Detection: update rawDetections
    // CRITICAL: submission.confirmedAnswers is NEVER overwritten
    submission.rawDetections = {
      detectedAt: new Date(),
      totalQuestions: result.totalQuestions,
      layoutType: result.layoutType,
      answers: result.answers,
      summary: result.summary
    };

    if (result.summary?.needsReview) {
      submission.status = 'NEEDS_REVIEW';
      submission.rejectionReason = result.summary.reviewReasons?.join('; ') || 'Requires manual review';
    } else {
      submission.status = 'PROCESSING';
      submission.rejectionReason = null;
    }

    submission.auditTrail.push({
      action: 'OMR_BUBBLE_DETECTION_PROCESSED',
      performedBy: req.user._id,
      timestamp: new Date(),
      details: {
        totalQuestions: result.totalQuestions,
        layoutType: result.layoutType,
        singleMarked: result.summary?.singleMarked,
        blank: result.summary?.blank,
        multipleMarked: result.summary?.multipleMarked,
        uncertain: result.summary?.uncertain,
        overallConfidence: result.summary?.overallConfidence,
        needsReview: result.summary?.needsReview,
        preservedExistingConfirmedAnswers: Boolean(submission.confirmedAnswers)
      }
    });

    await submission.save();

    res.status(200).json({
      success: true,
      data: submission
    });
  } catch (error) {
    if (error.code) {
      return res.status(error.statusCode || 500).json({
        error: {
          code: error.code,
          message: error.message,
          details: [],
          requestId: req.id
        }
      });
    }
    next(error);
  }
}

/**
 * Phase 6.6: Start / Resume OMR Verification Review
 * POST /api/v1/admin/competitions/:id/omr/submissions/:submissionId/start-review
 */
export async function startOmrReview(req, res, next) {
  try {
    const { id: competitionId, submissionId } = req.params;

    const submission = await OmrSubmission.findOne({
      _id: submissionId,
      competitionId
    });

    if (!submission) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'OMR Submission not found.', details: [], requestId: req.id }
      });
    }

    if (!submission.rawDetections || !submission.rawDetections.answers) {
      return res.status(400).json({
        error: {
          code: 'RAW_DETECTIONS_REQUIRED',
          message: 'OMR submission must have completed bubble detection before manual review can begin.',
          details: [],
          requestId: req.id
        }
      });
    }

    if (!submission.confirmedAnswers) {
      submission.confirmedAnswers = {
        status: 'IN_REVIEW',
        answers: {},
        correctionHistory: [],
        reviewNotes: '',
        verifiedBy: req.user._id,
        verifiedAt: null,
        isFullyVerified: false,
        version: 1
      };
    } else if (submission.confirmedAnswers.status !== 'VERIFIED') {
      submission.confirmedAnswers.status = 'IN_REVIEW';
    }

    if (['NEEDS_REVIEW', 'PROCESSING', 'UPLOADED'].includes(submission.status)) {
      submission.status = 'IN_REVIEW';
    }

    submission.auditTrail.push({
      action: 'OMR_REVIEW_STARTED',
      performedBy: req.user._id,
      timestamp: new Date(),
      details: {
        reviewer: req.user._id,
        currentStatus: submission.status,
        version: submission.confirmedAnswers?.version || 1
      }
    });

    submission.markModified('confirmedAnswers');
    await submission.save();

    res.status(200).json({
      success: true,
      data: submission
    });
  } catch (error) {
    if (error.code) {
      return res.status(error.statusCode || 500).json({
        error: { code: error.code, message: error.message, details: [], requestId: req.id }
      });
    }
    next(error);
  }
}

/**
 * Phase 6.6: Question-wise Answer Verification & Manual Correction
 * PUT /api/v1/admin/competitions/:id/omr/submissions/:submissionId/answers/:questionNumber
 */
export async function updateOmrQuestionAnswer(req, res, next) {
  try {
    const { id: competitionId, submissionId, questionNumber } = req.params;
    const { selectedOption, reason, expectedVersion } = req.body;

    const qNum = parseInt(questionNumber, 10);
    if (isNaN(qNum) || qNum < 1) {
      return res.status(400).json({
        error: { code: 'INVALID_QUESTION_NUMBER', message: 'Question number must be a positive integer.', details: [], requestId: req.id }
      });
    }

    const ALLOWED_OPTIONS = ['A', 'B', 'C', 'D', 'BLANK'];
    if (!selectedOption || !ALLOWED_OPTIONS.includes(selectedOption)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_OPTION',
          message: `selectedOption must be one of: ${ALLOWED_OPTIONS.join(', ')}`,
          details: [],
          requestId: req.id
        }
      });
    }

    const submission = await OmrSubmission.findOne({
      _id: submissionId,
      competitionId
    });

    if (!submission) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'OMR Submission not found.', details: [], requestId: req.id }
      });
    }

    if (!submission.rawDetections || !submission.rawDetections.answers) {
      return res.status(400).json({
        error: { code: 'RAW_DETECTIONS_REQUIRED', message: 'OMR bubble detection must be performed first.', details: [], requestId: req.id }
      });
    }

    if (qNum > submission.rawDetections.totalQuestions) {
      return res.status(400).json({
        error: {
          code: 'QUESTION_OUT_OF_BOUNDS',
          message: `Question number Q${qNum} exceeds total sheet questions (${submission.rawDetections.totalQuestions}).`,
          details: [],
          requestId: req.id
        }
      });
    }

    if (submission.status === 'VERIFIED') {
      return res.status(400).json({
        error: {
          code: 'SUBMISSION_ALREADY_VERIFIED',
          message: 'Cannot modify answers on a verified submission. Reopen the verification first.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Initialize confirmedAnswers if not already present
    if (!submission.confirmedAnswers) {
      submission.confirmedAnswers = {
        status: 'IN_REVIEW',
        answers: {},
        correctionHistory: [],
        reviewNotes: '',
        verifiedBy: req.user._id,
        verifiedAt: null,
        isFullyVerified: false,
        version: 1
      };
    }

    // Optimistic Concurrency Control Check
    if (expectedVersion !== undefined && expectedVersion !== null) {
      const currentVersion = submission.confirmedAnswers.version || 1;
      if (expectedVersion !== currentVersion) {
        return res.status(409).json({
          error: {
            code: 'CONCURRENT_REVIEW_CONFLICT',
            message: 'Conflict: This submission has been updated by another reviewer. Please refresh to load latest changes.',
            details: [`Expected version ${expectedVersion}, but found version ${currentVersion}`],
            requestId: req.id
          }
        });
      }
    }

    // Identify machine detection for comparison
    const machineAnswer = submission.rawDetections.answers.find(a => a.questionNumber === qNum);
    const machineOption = machineAnswer?.detectedOption || (machineAnswer?.classification === 'BLANK' ? 'BLANK' : null);
    const isCorrected = selectedOption !== machineOption;

    if (isCorrected && (!reason || typeof reason !== 'string' || reason.trim().length < 3)) {
      return res.status(400).json({
        error: {
          code: 'REASON_REQUIRED',
          message: `A descriptive reason (min 3 characters) is required when correcting machine detection for Q${qNum}.`,
          details: [],
          requestId: req.id
        }
      });
    }

    const previousOption = submission.confirmedAnswers.answers?.[qNum]?.selectedOption || null;

    // Record correction history entry
    if (!Array.isArray(submission.confirmedAnswers.correctionHistory)) {
      submission.confirmedAnswers.correctionHistory = [];
    }
    submission.confirmedAnswers.correctionHistory.push({
      questionNumber: qNum,
      previousOption,
      newOption: selectedOption,
      reason: reason?.trim() || (isCorrected ? 'Manual correction' : 'Manual confirmation'),
      correctedBy: req.user._id,
      timestamp: new Date()
    });

    // Update confirmed answer map
    if (!submission.confirmedAnswers.answers) {
      submission.confirmedAnswers.answers = {};
    }
    submission.confirmedAnswers.answers[qNum] = {
      selectedOption,
      isConfirmed: true,
      confirmedBy: req.user._id,
      confirmedAt: new Date(),
      isCorrected,
      machineDetection: machineAnswer?.detectedOption || null,
      machineClassification: machineAnswer?.classification || 'UNCERTAIN',
      reason: reason?.trim() || null
    };

    // Increment optimistic version and transition state
    submission.confirmedAnswers.version = (submission.confirmedAnswers.version || 1) + 1;
    submission.confirmedAnswers.status = 'PARTIALLY_VERIFIED';
    submission.status = 'PARTIALLY_VERIFIED';

    submission.auditTrail.push({
      action: isCorrected ? 'OMR_ANSWER_CORRECTED' : 'OMR_ANSWER_CONFIRMED',
      performedBy: req.user._id,
      timestamp: new Date(),
      details: {
        questionNumber: qNum,
        previousOption,
        newOption: selectedOption,
        machineDetection: machineAnswer?.detectedOption || null,
        machineClassification: machineAnswer?.classification || 'UNCERTAIN',
        reason: reason?.trim() || null,
        version: submission.confirmedAnswers.version
      }
    });

    const versionCondition = (expectedVersion !== undefined && expectedVersion !== null)
      ? {
          $or: [
            { 'confirmedAnswers.version': expectedVersion },
            ...(expectedVersion === 1 ? [{ 'confirmedAnswers.version': { $exists: false } }] : [])
          ]
        }
      : {};

    const updated = await OmrSubmission.findOneAndUpdate(
      {
        _id: submissionId,
        competitionId,
        status: { $ne: 'VERIFIED' },
        ...versionCondition
      },
      {
        $set: {
          confirmedAnswers: submission.confirmedAnswers,
          status: 'PARTIALLY_VERIFIED'
        },
        $push: {
          auditTrail: submission.auditTrail[submission.auditTrail.length - 1]
        }
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(409).json({
        error: {
          code: 'CONCURRENT_REVIEW_CONFLICT',
          message: 'Conflict: This submission has been updated by another reviewer. Please refresh to load latest changes.',
          details: [`Expected version ${expectedVersion} does not match current database state`],
          requestId: req.id
        }
      });
    }

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    if (error.code) {
      return res.status(error.statusCode || 500).json({
        error: { code: error.code, message: error.message, details: [], requestId: req.id }
      });
    }
    next(error);
  }
}

/**
 * Phase 6.6: Finalize Verification (Explicit Reviewer Confirmation)
 * POST /api/v1/admin/competitions/:id/omr/submissions/:submissionId/finalize-verification
 */
export async function finalizeOmrVerification(req, res, next) {
  try {
    const { id: competitionId, submissionId } = req.params;
    const { reviewNotes, confirmRemainingClean, expectedVersion } = req.body;

    const submission = await OmrSubmission.findOne({
      _id: submissionId,
      competitionId
    });

    if (!submission) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'OMR Submission not found.', details: [], requestId: req.id }
      });
    }

    if (submission.status === 'VERIFIED') {
      return res.status(400).json({
        error: { code: 'ALREADY_VERIFIED', message: 'This OMR submission is already fully verified.', details: [], requestId: req.id }
      });
    }

    if (!submission.rawDetections || !submission.rawDetections.answers) {
      return res.status(400).json({
        error: { code: 'RAW_DETECTIONS_REQUIRED', message: 'Cannot verify submission without machine bubble detections.', details: [], requestId: req.id }
      });
    }

    // Initialize confirmedAnswers if empty
    if (!submission.confirmedAnswers) {
      submission.confirmedAnswers = {
        status: 'IN_REVIEW',
        answers: {},
        correctionHistory: [],
        reviewNotes: '',
        verifiedBy: req.user._id,
        verifiedAt: null,
        isFullyVerified: false,
        version: 1
      };
    }

    // Concurrency check
    if (expectedVersion !== undefined && expectedVersion !== null) {
      const currentVersion = submission.confirmedAnswers.version || 1;
      if (expectedVersion !== currentVersion) {
        return res.status(409).json({
          error: {
            code: 'CONCURRENT_REVIEW_CONFLICT',
            message: 'Conflict: This submission was updated by another reviewer. Please refresh and try again.',
            details: [],
            requestId: req.id
          }
        });
      }
    }

    const totalQuestions = submission.rawDetections.totalQuestions;
    const answersMap = submission.confirmedAnswers.answers || {};
    const unresolvedQuestions = [];

    for (let q = 1; q <= totalQuestions; q++) {
      const confirmed = answersMap[q];
      if (confirmed && confirmed.isConfirmed) {
        continue;
      }

      // Check machine detection
      const mach = submission.rawDetections.answers.find(a => a.questionNumber === q);
      const isClean = mach && (mach.classification === 'SINGLE_MARKED' || mach.classification === 'BLANK') && mach.confidence >= 0.70;

      if (isClean && confirmRemainingClean) {
        // Explicitly confirm under reviewer's identity
        const selectedOption = mach.classification === 'BLANK' ? 'BLANK' : mach.detectedOption;
        answersMap[q] = {
          selectedOption,
          isConfirmed: true,
          confirmedBy: req.user._id,
          confirmedAt: new Date(),
          isCorrected: false,
          machineDetection: mach.detectedOption || null,
          machineClassification: mach.classification,
          reason: 'Confirmed clean machine detection'
        };
      } else {
        unresolvedQuestions.push({
          questionNumber: q,
          classification: mach?.classification || 'UNCERTAIN',
          reviewReason: mach?.reviewReason || 'Unconfirmed question'
        });
      }
    }

    if (unresolvedQuestions.length > 0) {
      const unresolvedSummary = unresolvedQuestions.map(u => `Q${u.questionNumber} (${u.classification})`).slice(0, 10).join(', ');
      return res.status(400).json({
        error: {
          code: 'UNRESOLVED_QUESTIONS_REMAIN',
          message: `Cannot finalize verification. ${unresolvedQuestions.length} question(s) remain unresolved: ${unresolvedSummary}${unresolvedQuestions.length > 10 ? '...' : ''}`,
          details: unresolvedQuestions,
          requestId: req.id
        }
      });
    }

    submission.confirmedAnswers.answers = answersMap;
    submission.confirmedAnswers.status = 'VERIFIED';
    submission.confirmedAnswers.isFullyVerified = true;
    submission.confirmedAnswers.verifiedBy = req.user._id;
    submission.confirmedAnswers.verifiedAt = new Date();
    submission.confirmedAnswers.reviewNotes = reviewNotes || submission.confirmedAnswers.reviewNotes || '';
    submission.confirmedAnswers.version = (submission.confirmedAnswers.version || 1) + 1;

    submission.status = 'VERIFIED';
    submission.rejectionReason = null;

    submission.auditTrail.push({
      action: 'OMR_VERIFICATION_FINALIZED',
      performedBy: req.user._id,
      timestamp: new Date(),
      details: {
        totalQuestions,
        verifiedBy: req.user._id,
        correctionsCount: submission.confirmedAnswers.correctionHistory?.length || 0,
        reviewNotes: submission.confirmedAnswers.reviewNotes,
        version: submission.confirmedAnswers.version
      }
    });

    const versionCondition = (expectedVersion !== undefined && expectedVersion !== null)
      ? {
          $or: [
            { 'confirmedAnswers.version': expectedVersion },
            ...(expectedVersion === 1 ? [{ 'confirmedAnswers.version': { $exists: false } }] : [])
          ]
        }
      : {};

    const updated = await OmrSubmission.findOneAndUpdate(
      {
        _id: submissionId,
        competitionId,
        status: { $ne: 'VERIFIED' },
        ...versionCondition
      },
      {
        $set: {
          confirmedAnswers: submission.confirmedAnswers,
          status: 'VERIFIED',
          rejectionReason: null
        },
        $push: {
          auditTrail: submission.auditTrail[submission.auditTrail.length - 1]
        }
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      if (expectedVersion !== undefined && expectedVersion !== null) {
        return res.status(409).json({
          error: {
            code: 'CONCURRENT_REVIEW_CONFLICT',
            message: 'Conflict: This submission was updated by another reviewer. Please refresh and try again.',
            details: [`Expected version ${expectedVersion} does not match current database state`],
            requestId: req.id
          }
        });
      }
      return res.status(400).json({
        error: { code: 'UPDATE_FAILED', message: 'Failed to finalize verification.', details: [], requestId: req.id }
      });
    }

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    if (error.code) {
      return res.status(error.statusCode || 500).json({
        error: { code: error.code, message: error.message, details: [], requestId: req.id }
      });
    }
    next(error);
  }
}

/**
 * Phase 6.6: Reopen Verification for Authorized Correction
 * POST /api/v1/admin/competitions/:id/omr/submissions/:submissionId/reopen-verification
 */
export async function reopenOmrVerification(req, res, next) {
  try {
    const { id: competitionId, submissionId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({
        error: {
          code: 'REOPEN_REASON_REQUIRED',
          message: 'A descriptive reason (min 5 characters) is required to reopen a verified submission.',
          details: [],
          requestId: req.id
        }
      });
    }

    const submission = await OmrSubmission.findOne({
      _id: submissionId,
      competitionId
    });

    if (!submission) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'OMR Submission not found.', details: [], requestId: req.id }
      });
    }

    const competition = await Competition.findById(competitionId);
    if (competition && competition.resultStatus === 'PUBLISHED') {
      return res.status(400).json({
        error: {
          code: 'CANNOT_REOPEN_PUBLISHED',
          message: 'Cannot reopen verification while competition results are PUBLISHED. The Committee Head must unpublish results first.',
          details: [],
          requestId: req.id
        }
      });
    }

    if (submission.status !== 'VERIFIED') {
      return res.status(400).json({
        error: {
          code: 'SUBMISSION_NOT_VERIFIED',
          message: 'Only fully VERIFIED submissions can be reopened.',
          details: [],
          requestId: req.id
        }
      });
    }

    submission.status = 'REOPENED';
    if (!submission.confirmedAnswers) {
      submission.confirmedAnswers = {};
    }
    submission.confirmedAnswers.status = 'REOPENED';
    submission.confirmedAnswers.isFullyVerified = false;
    submission.confirmedAnswers.version = (submission.confirmedAnswers.version || 1) + 1;

    // Invalidate any previously evaluated Result so reopened submissions never retain stale scoring
    if (submission.studentId) {
      await Result.deleteMany({ competitionId, studentId: submission.studentId });
    }

    // If competition results were previously APPROVED, revert to EVALUATED to require re-approval
    if (competition && competition.resultStatus === 'APPROVED') {
      competition.resultStatus = 'EVALUATED';
      await competition.save();
    }

    submission.auditTrail.push({
      action: 'OMR_VERIFICATION_REOPENED',
      performedBy: req.user._id,
      timestamp: new Date(),
      details: {
        reason: reason.trim(),
        reopenedBy: req.user._id,
        version: submission.confirmedAnswers.version
      }
    });

    submission.markModified('confirmedAnswers');
    await submission.save();

    res.status(200).json({
      success: true,
      data: submission
    });
  } catch (error) {
    if (error.code) {
      return res.status(error.statusCode || 500).json({
        error: { code: error.code, message: error.message, details: [], requestId: req.id }
      });
    }
    next(error);
  }
}


