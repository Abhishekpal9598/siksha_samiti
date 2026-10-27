import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { OmrSubmission } from '../models/omrSubmission.model.js';
import { Registration } from '../models/registration.model.js';
import { Attempt } from '../models/attempt.model.js';
import { User } from '../models/user.model.js';
import { verifyOmrTokenPayload } from './omrToken.service.js';

// Maximum limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
export const MAX_BATCH_SIZE = 100 * 1024 * 1024; // 100 MB total batch

/**
 * Ensure private storage directory exists
 */
export function ensureStorageDir() {
  const dir = path.resolve(config.omrStorageDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

/**
 * Validate true file signatures (magic bytes)
 * Never rely solely on user-supplied MIME type or extension.
 * 
 * @param {Buffer} buffer 
 * @returns {{ valid: boolean, format?: 'JPEG'|'PNG'|'PDF', mimeType?: string, ext?: string, error?: string }}
 */
export function validateMagicBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) {
    return { valid: false, error: 'FILE_EMPTY_OR_CORRUPT' };
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return {
      valid: true,
      format: 'JPEG',
      mimeType: 'image/jpeg',
      ext: '.jpg'
    };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return {
      valid: true,
      format: 'PNG',
      mimeType: 'image/png',
      ext: '.png'
    };
  }

  // 3. PDF: %PDF- (25 50 44 46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    // Additional validation for PDF: ensure minimum size and valid structure
    if (buffer.length < 32) {
      return { valid: false, error: 'CORRUPTED_PDF_TRUNCATED' };
    }

    const header = buffer.toString('utf8', 0, 8);
    if (!header.startsWith('%PDF-')) {
      return { valid: false, error: 'INVALID_PDF_HEADER' };
    }

    return {
      valid: true,
      format: 'PDF',
      mimeType: 'application/pdf',
      ext: '.pdf'
    };
  }

  return { valid: false, error: 'INVALID_FILE_SIGNATURE' };
}

/**
 * Compute SHA-256 hash of a file buffer
 */
export function computeFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Sanitize filename and prevent path traversal
 */
export function generateSafeStoredFilename(competitionId, ext) {
  const safeCompId = competitionId.toString().replace(/[^a-zA-Z0-9]/g, '');
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  return `omr_${safeCompId}_${timestamp}_${randomSuffix}${ext}`;
}

/**
 * Verify destination path stays strictly inside private storage dir
 */
export function resolveSafeStoragePath(filename) {
  const baseDir = ensureStorageDir();
  const sanitizedName = path.basename(filename);
  const resolved = path.resolve(baseDir, sanitizedName);

  if (!resolved.startsWith(baseDir)) {
    throw new Error('PATH_TRAVERSAL_DETECTED');
  }

  return resolved;
}

/**
 * Atomic Exam Mode Locking & Registration Verification
 * 
 * Enforces:
 * 1. ONLINE_MCQ registrations CANNOT accept OMR uploads.
 * 2. OMR candidates who have started/submitted an online attempt cannot be uploaded.
 * 3. Duplicate active OMR submissions for the same candidate are rejected.
 * 4. QR HMAC cryptographic signature verification if token is provided.
 */
export async function verifyAndLockRegistration({ competitionId, registrationId, qrToken, studentId }) {
  let targetRegId = registrationId;

  // 1. If QR token payload is provided, cryptographically verify it
  let qrVerifiedData = null;
  if (qrToken) {
    const verified = verifyOmrTokenPayload(qrToken);
    if (!verified.valid) {
      const err = new Error(`INVALID_QR_TOKEN: ${verified.error}`);
      err.code = 'INVALID_QR_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    if (verified.competitionId !== competitionId.toString()) {
      const err = new Error('QR_COMPETITION_MISMATCH: The QR code belongs to a different competition.');
      err.code = 'QR_COMPETITION_MISMATCH';
      err.statusCode = 400;
      throw err;
    }

    targetRegId = verified.registrationId;
    qrVerifiedData = verified;
  }

  if (!targetRegId) {
    return { registration: null, student: null, qrData: qrVerifiedData };
  }

  // 2. Fetch Registration record
  const registration = await Registration.findOne({
    _id: targetRegId,
    competitionId
  });

  if (!registration) {
    const err = new Error('REGISTRATION_NOT_FOUND: Candidate registration does not exist for this competition.');
    err.code = 'REGISTRATION_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  // 3. Verify Registration Status
  if (registration.status !== 'registered') {
    const err = new Error(`REGISTRATION_NOT_ACTIVE: Candidate registration status is ${registration.status}.`);
    err.code = 'REGISTRATION_NOT_ACTIVE';
    err.statusCode = 400;
    throw err;
  }

  // 4. Verify QR Sheet Token matches registration
  if (qrVerifiedData && registration.omrSheetToken && qrVerifiedData.omrSheetToken !== registration.omrSheetToken) {
    const err = new Error('QR_TOKEN_MISMATCH: Sheet token does not match active registration record.');
    err.code = 'QR_TOKEN_MISMATCH';
    err.statusCode = 400;
    throw err;
  }

  // 5. ATOMIC MODE LOCKING - Check 1: Must NOT be ONLINE_MCQ
  if (registration.examMode === 'ONLINE_MCQ') {
    const err = new Error('ATOMIC_MODE_LOCK_VIOLATION: Registration is locked to ONLINE_MCQ mode. Paper OMR uploads are prohibited.');
    err.code = 'ATOMIC_MODE_LOCK_VIOLATION';
    err.statusCode = 400;
    throw err;
  }

  // 6. ATOMIC MODE LOCKING - Check 2: Must NOT have any active/submitted online Attempt
  const existingAttempt = await Attempt.findOne({
    competitionId,
    studentId: registration.studentId,
    status: { $in: ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED'] }
  });

  if (existingAttempt) {
    const err = new Error('ATOMIC_MODE_LOCK_VIOLATION: Candidate already has an online MCQ attempt. Concurrent OMR upload is forbidden.');
    err.code = 'ATOMIC_MODE_LOCK_VIOLATION';
    err.statusCode = 400;
    throw err;
  }

  // 7. Check for duplicate active OMR submission for this candidate
  const existingSubmission = await OmrSubmission.findOne({
    competitionId,
    registrationId: registration._id,
    status: { $in: ['UPLOADED', 'QUEUED', 'PROCESSING', 'NEEDS_REVIEW', 'VERIFIED'] }
  });

  if (existingSubmission) {
    const err = new Error('DUPLICATE_CANDIDATE_SUBMISSION: An active OMR submission already exists for this candidate.');
    err.code = 'DUPLICATE_CANDIDATE_SUBMISSION';
    err.statusCode = 409;
    throw err;
  }

  const student = await User.findById(registration.studentId);

  return { registration, student, qrData: qrVerifiedData };
}

/**
 * Ingest, validate, store and index a single uploaded OMR file
 */
export async function ingestOmrFile({
  file,
  competitionId,
  actor,
  registrationId = null,
  qrToken = null,
  clientIp = 'unknown'
}) {
  if (!file || !file.buffer) {
    const err = new Error('NO_FILE_PROVIDED: No file buffer received.');
    err.code = 'NO_FILE_PROVIDED';
    err.statusCode = 400;
    throw err;
  }

  // 1. File size check
  if (file.buffer.length > MAX_FILE_SIZE) {
    const err = new Error(`FILE_TOO_LARGE: Upload size (${(file.buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 10 MB.`);
    err.code = 'FILE_TOO_LARGE';
    err.statusCode = 413;
    throw err;
  }

  // 2. Validate magic bytes
  const magicValidation = validateMagicBytes(file.buffer);
  if (!magicValidation.valid) {
    const err = new Error(`INVALID_FILE_SIGNATURE: File does not have a valid JPEG, PNG, or PDF signature. (${magicValidation.error})`);
    err.code = magicValidation.error || 'INVALID_FILE_SIGNATURE';
    err.statusCode = 400;
    throw err;
  }

  // 3. Compute SHA-256 for deduplication
  const fileHash = computeFileHash(file.buffer);

  // 4. Duplicate submission check by SHA-256 hash in this competition
  const duplicateHash = await OmrSubmission.findOne({
    competitionId,
    fileHash,
    status: { $ne: 'FAILED' }
  });

  if (duplicateHash) {
    const err = new Error('DUPLICATE_FILE_DETECTED: An identical OMR file has already been uploaded for this competition.');
    err.code = 'DUPLICATE_FILE_DETECTED';
    err.statusCode = 409;
    throw err;
  }

  // 5. Atomic Mode Locking & Registration Validation (if registrationId or qrToken provided)
  let verifiedReg = null;
  let verifiedStudent = null;
  let verifiedQr = null;

  if (registrationId || qrToken) {
    const check = await verifyAndLockRegistration({
      competitionId,
      registrationId,
      qrToken,
      actorId: actor._id
    });
    verifiedReg = check.registration;
    verifiedStudent = check.student;
    verifiedQr = check.qrData;
  }

  // 6. Generate safe filename and write to private storage
  const storedFilename = generateSafeStoredFilename(competitionId, magicValidation.ext);
  const storagePath = resolveSafeStoragePath(storedFilename);

  fs.writeFileSync(storagePath, file.buffer, { mode: 0o600 });

  try {
    // 7. Create OmrSubmission record in MongoDB
    const submission = new OmrSubmission({
      competitionId,
      registrationId: verifiedReg ? verifiedReg._id : null,
      studentId: verifiedStudent ? verifiedStudent._id : (verifiedReg ? verifiedReg.studentId : null),
      rollNumber: verifiedReg ? verifiedReg.rollNumber : null,
      uploadedBy: actor._id,
      originalFilename: path.basename(file.originalname || 'omr_upload'),
      storedFilename,
      storagePath,
      fileSizeBytes: file.buffer.length,
      mimeType: magicValidation.mimeType,
      fileFormat: magicValidation.format,
      fileHash,
      status: 'UPLOADED',
      qrData: verifiedQr ? {
        raw: typeof qrToken === 'string' ? qrToken : JSON.stringify(qrToken),
        verified: true,
        competitionId: verifiedQr.competitionId,
        registrationId: verifiedQr.registrationId,
        omrSheetToken: verifiedQr.omrSheetToken,
        verifiedAt: new Date()
      } : {
        raw: null,
        verified: false
      },
      qualityChecks: {
        magicBytesValid: true,
        sha256Matched: true,
        notes: `Ingested ${magicValidation.format} (${file.buffer.length} bytes)`
      },
      auditTrail: [
        {
          action: 'UPLOAD_INGESTED',
          performedBy: actor._id,
          timestamp: new Date(),
          details: {
            actorRole: actor.role,
            actorName: actor.fullName || actor.name || 'Admin',
            originalFilename: file.originalname,
            fileHash,
            format: magicValidation.format,
            sizeBytes: file.buffer.length,
            clientIp,
            registeredCandidate: verifiedReg ? verifiedReg.rollNumber : 'UNASSIGNED_BATCH'
          }
        }
      ]
    });

    await submission.save();
    return submission;
  } catch (dbErr) {
    // Clean up private file on disk if database insertion fails
    if (fs.existsSync(storagePath)) {
      try {
        fs.unlinkSync(storagePath);
      } catch (cleanErr) {
        // ignore disk cleanup error
      }
    }
    throw dbErr;
  }
}
