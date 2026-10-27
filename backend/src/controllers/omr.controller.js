import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { Competition } from '../models/competition.model.js';
import { OmrSubmission } from '../models/omrSubmission.model.js';
import {
  ingestOmrFile,
  verifyAndLockRegistration,
  resolveSafeStoragePath,
  MAX_FILE_SIZE,
  MAX_BATCH_SIZE
} from '../services/omrUpload.service.js';

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

    // Path traversal check
    const absoluteFilePath = resolveSafeStoragePath(submission.storedFilename);

    if (!fs.existsSync(absoluteFilePath)) {
      return res.status(404).json({
        error: {
          code: 'FILE_NOT_FOUND_ON_DISK',
          message: 'The physical file for this submission was not found in private storage.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Set secure headers
    res.setHeader('Content-Type', submission.mimeType);
    res.setHeader('Content-Length', submission.fileSizeBytes);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(submission.originalFilename)}"`);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const readStream = fs.createReadStream(absoluteFilePath);
    readStream.pipe(res);
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
