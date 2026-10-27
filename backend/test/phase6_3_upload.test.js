import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Competition } from '../src/models/competition.model.js';
import { Registration } from '../src/models/registration.model.js';
import { Attempt } from '../src/models/attempt.model.js';
import { Question } from '../src/models/question.model.js';
import { OmrSubmission } from '../src/models/omrSubmission.model.js';
import { config } from '../src/config/env.js';
import {
  validateMagicBytes,
  computeFileHash,
  resolveSafeStoragePath,
  MAX_FILE_SIZE
} from '../src/services/omrUpload.service.js';
import {
  createOmrTokenPayload,
  computeOmrSignature
} from '../src/services/omrToken.service.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/education_committee';

// Synthetic Valid Buffers
function createFakeJpeg() {
  const header = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const body = crypto.randomBytes(64);
  const eoi = Buffer.from([0xFF, 0xD9]);
  return Buffer.concat([header, body, eoi]);
}

function createFakePng() {
  const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const body = crypto.randomBytes(64);
  return Buffer.concat([header, body]);
}

function createFakePdf() {
  const content = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`;
  return Buffer.from(content, 'utf8');
}

// HTTP request helper supporting JSON and multipart FormData
async function makeRequest(app, method, path, { headers = {}, body = null, cookie = null } = {}) {
  const reqHeaders = { ...headers, Connection: 'close' };
  
  if (body && !(body instanceof FormData) && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }
  if (cookie) {
    reqHeaders['Cookie'] = cookie;
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    if (!reqHeaders['X-Requested-With']) {
      reqHeaders['X-Requested-With'] = 'XMLHttpRequest';
    }
  }

  const server = app.listen(0);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}${path}`;

  try {
    const fetchOptions = { method, headers: reqHeaders };
    if (body) {
      if (body instanceof FormData) {
        fetchOptions.body = body;
      } else {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
    }
    const response = await fetch(url, fetchOptions);
    const contentType = response.headers.get('content-type') || '';

    let data;
    if (contentType.includes('application/pdf') || contentType.includes('image/')) {
      const arrayBuffer = await response.arrayBuffer();
      data = Buffer.from(arrayBuffer);
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return {
      status: response.status,
      headers: response.headers,
      body: data
    };
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
}

test('=== PHASE 6.3: SECURE OMR INGESTION & REGISTRATION VALIDATION ===', async (suite) => {
  let adminCookie = null;
  let studentOnlineCookie = null;
  let studentOmrCookie = null;
  let competition = null;
  let regOnline = null;
  let regOmr = null;
  let studentOmr = null;

  suite.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect(MONGODB_URI);
    }

    // Clean test artifacts
    await User.deleteMany({ mobileNormalized: { $regex: /^9999633/ } });
    await Competition.deleteMany({ title: { $regex: /^P63Test_/ } });
    await OmrSubmission.deleteMany({});
    await OmrSubmission.syncIndexes();

    const passwordHash = await bcrypt.hash('Phase63Pass@123', 8);

    // 1. Create Users with valid schema
    await User.create({
      fullName: 'Phase 6.3 Admin Controller',
      mobile: '+91 9999633001',
      mobileNormalized: '9999633001',
      role: 'admin',
      passwordHash,
      isActive: true,
      classOrGrade: 'Admin Office',
      school: 'HQ'
    });

    const studentOnline = await User.create({
      fullName: 'Online Candidate Rahul',
      mobile: '+91 9999633002',
      mobileNormalized: '9999633002',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Kendriya Vidyalaya'
    });

    studentOmr = await User.create({
      fullName: 'OMR Candidate Priya',
      mobile: '+91 9999633003',
      mobileNormalized: '9999633003',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Kendriya Vidyalaya'
    });

    // Helper to log in and get auth cookie
    const login = async (mobile) => {
      const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
        body: { mobile, password: 'Phase63Pass@123' }
      });
      const cookieHeader = res.headers.get('set-cookie');
      return cookieHeader ? cookieHeader.split(';')[0] : `${config.cookieName}=${res.body.token}`;
    };

    adminCookie = await login('9999633001');
    studentOnlineCookie = await login('9999633002');
    studentOmrCookie = await login('9999633003');

    // 2. Create Published Competition
    const now = new Date();
    competition = await Competition.create({
      title: `P63Test_Science_Olympiad_${Date.now()}`,
      titleEn: 'Science Olympiad 2026',
      titleHi: 'विज्ञान ओलंपियाड २०२६',
      description: 'Phase 6.3 validation competition',
      category: 'Science',
      examDate: new Date(now.getTime() + 86400000),
      examStartsAt: new Date(now.getTime() - 60000), // starts in past so attempts can start
      examEndsAt: new Date(now.getTime() + 86400000),
      registrationOpensAt: new Date(now.getTime() - 86400000),
      registrationClosesAt: new Date(now.getTime() + 43200000),
      durationMinutes: 60,
      totalMarks: 100,
      passingMarks: 40,
      marksPerQuestion: 4,
      eligibleClasses: ['Class 10'],
      status: 'PUBLISHED',
      mode: 'BOTH',
      isPublished: true,
      resultsPublished: false,
      scoringVersion: 1
    });

    // Create 1 test question
    await Question.create({
      competitionId: competition._id,
      prompt: 'What is the chemical symbol for water?',
      options: [
        { key: 'A', text: 'H2O' },
        { key: 'B', text: 'CO2' },
        { key: 'C', text: 'O2' },
        { key: 'D', text: 'NaCl' }
      ],
      correctOption: 'A',
      marks: 4,
      negativeMarks: 1,
      order: 1,
      isActive: true
    });

    // 3. Create Registrations
    regOnline = await Registration.create({
      competitionId: competition._id,
      studentId: studentOnline._id,
      rollNumber: 'EC-2026-ONL01',
      examMode: 'ONLINE_MCQ',
      status: 'registered'
    });

    regOmr = await Registration.create({
      competitionId: competition._id,
      studentId: studentOmr._id,
      rollNumber: 'EC-2026-OMR01',
      examMode: 'OMR',
      status: 'registered',
      omrSheetToken: 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
    });
  });

  suite.after(async () => {
    await User.deleteMany({ mobileNormalized: { $regex: /^9999633/ } });
    if (competition) {
      await Competition.deleteMany({ _id: competition._id });
      await Registration.deleteMany({ competitionId: competition._id });
      await Attempt.deleteMany({ competitionId: competition._id });
      await OmrSubmission.deleteMany({ competitionId: competition._id });
      await Question.deleteMany({ competitionId: competition._id });
    }
    await mongoose.disconnect();
  });

  // --- UNIT TESTS ---
  await suite.test('Unit: Magic bytes inspection recognizes authentic JPEG, PNG, and PDF', () => {
    const jpeg = createFakeJpeg();
    const png = createFakePng();
    const pdf = createFakePdf();

    assert.equal(validateMagicBytes(jpeg).valid, true);
    assert.equal(validateMagicBytes(jpeg).format, 'JPEG');

    assert.equal(validateMagicBytes(png).valid, true);
    assert.equal(validateMagicBytes(png).format, 'PNG');

    assert.equal(validateMagicBytes(pdf).valid, true);
    assert.equal(validateMagicBytes(pdf).format, 'PDF');
  });

  await suite.test('Unit: Magic bytes inspection strictly rejects disguised text files', () => {
    const fakeJpg = Buffer.from('hello this is malicious shell disguised as jpg');
    const result = validateMagicBytes(fakeJpg);
    assert.equal(result.valid, false);
    assert.equal(result.error, 'INVALID_FILE_SIGNATURE');

    const fakePdf = Buffer.from('%PDF-corrupt'); // < 32 bytes
    const pdfResult = validateMagicBytes(fakePdf);
    assert.equal(pdfResult.valid, false);
    assert.equal(pdfResult.error, 'CORRUPTED_PDF_TRUNCATED');
  });

  await suite.test('Unit: SHA-256 calculation produces deterministic 64-char hex', () => {
    const buf = Buffer.from('test buffer content');
    const hash1 = computeFileHash(buf);
    const hash2 = computeFileHash(buf);
    assert.equal(hash1.length, 64);
    assert.equal(hash1, hash2);
  });

  await suite.test('Unit: resolveSafeStoragePath guarantees private path and blocks path traversal', () => {
    const safeName = 'valid_sheet_123.jpg';
    const resolved = resolveSafeStoragePath(safeName);
    assert.ok(resolved.endsWith(safeName));

    const traversal = resolveSafeStoragePath('../../../windows/system32/cmd.exe');
    assert.ok(!traversal.includes('system32'));
    assert.ok(traversal.endsWith('cmd.exe'));
    assert.ok(resolved.includes('omr_private'));
  });

  // --- INTEGRATION TESTS ---
  let uploadedJpegSubmissionId;
  let uploadedFileBuffer;

  await suite.test('Integration: Admin successfully uploads valid JPEG OMR scan', async () => {
    uploadedFileBuffer = createFakeJpeg();
    const form = new FormData();
    const blob = new Blob([uploadedFileBuffer], { type: 'image/jpeg' });
    form.append('file', blob, 'candidate_omr_sheet.jpg');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      cookie: adminCookie,
      body: form
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.totalUploaded, 1);
    const sub = res.body.data.submissions[0];
    assert.equal(sub.status, 'UPLOADED');
    assert.equal(sub.fileFormat, 'JPEG');
    assert.equal(sub.fileHash, computeFileHash(uploadedFileBuffer));
    // storagePath must NEVER be leaked in JSON response
    assert.equal(sub.storagePath, undefined);

    uploadedJpegSubmissionId = sub.id;

    // Check physical file on disk in private storage
    const storedDoc = await OmrSubmission.findById(sub.id);
    assert.ok(fs.existsSync(storedDoc.storagePath));
    assert.ok(storedDoc.storagePath.includes('omr_private'));
  });

  await suite.test('Integration: Admin successfully uploads valid PNG and PDF scans', async () => {
    // PNG
    const pngBuf = createFakePng();
    const formPng = new FormData();
    formPng.append('file', new Blob([pngBuf], { type: 'image/png' }), 'scan.png');

    const resPng = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      cookie: adminCookie,
      body: formPng
    });
    assert.equal(resPng.status, 201);
    assert.equal(resPng.body.data.submissions[0].fileFormat, 'PNG');

    // PDF
    const pdfBuf = createFakePdf();
    const formPdf = new FormData();
    formPdf.append('file', new Blob([pdfBuf], { type: 'application/pdf' }), 'sheet.pdf');

    const resPdf = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      cookie: adminCookie,
      body: formPdf
    });
    assert.equal(resPdf.status, 201);
    assert.equal(resPdf.body.data.submissions[0].fileFormat, 'PDF');
  });

  await suite.test('Integration: Reject upload of text file disguised as .jpg (Magic Bytes Guard)', async () => {
    const maliciousText = Buffer.from('console.log("malicious code");'.repeat(10));
    const form = new FormData();
    form.append('file', new Blob([maliciousText], { type: 'image/jpeg' }), 'trojan.jpg');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      cookie: adminCookie,
      body: form
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_FILE_SIGNATURE');
  });

  await suite.test('Integration: Deduplication Guard rejects uploading duplicate file in same competition', async () => {
    // Attempt re-uploading the exact same JPEG buffer uploaded in test 1
    const form = new FormData();
    form.append('file', new Blob([uploadedFileBuffer], { type: 'image/jpeg' }), 'duplicate.jpg');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      cookie: adminCookie,
      body: form
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'DUPLICATE_FILE_DETECTED');
  });

  await suite.test('Integration: Reject upload of oversized file (> 10MB)', async () => {
    const bigBuf = Buffer.alloc(MAX_FILE_SIZE + 500 * 1024, 0xFF);
    bigBuf[0] = 0xFF;
    bigBuf[1] = 0xD8;
    bigBuf[2] = 0xFF;

    const form = new FormData();
    form.append('file', new Blob([bigBuf], { type: 'image/jpeg' }), 'huge.jpg');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      cookie: adminCookie,
      body: form
    });

    assert.ok([400, 413].includes(res.status));
    assert.ok(res.body.error.code === 'FILE_TOO_LARGE' || res.body.error.code === 'LIMIT_FILE_SIZE');
  });

  await suite.test('Integration: QR Token HMAC verification on upload with valid token links candidate', async () => {
    const qrPayload = createOmrTokenPayload({
      competitionId: competition._id,
      registrationId: regOmr._id,
      omrSheetToken: regOmr.omrSheetToken
    });

    const form = new FormData();
    form.append('file', new Blob([createFakeJpeg()], { type: 'image/jpeg' }), 'personalized_sheet.jpg');
    form.append('qrToken', JSON.stringify(qrPayload));

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      cookie: adminCookie,
      body: form
    });

    assert.equal(res.status, 201);
    const sub = res.body.data.submissions[0];
    assert.equal(sub.registrationId, regOmr._id.toString());
    assert.equal(sub.studentId, studentOmr._id.toString());
    assert.equal(sub.rollNumber, regOmr.rollNumber);
    assert.equal(sub.qrData.verified, true);
  });

  await suite.test('Integration: QR Token HMAC verification rejects tampered signature', async () => {
    const tamperedPayload = {
      v: 1,
      cid: competition._id.toString(),
      rid: regOmr._id.toString(),
      tok: regOmr.omrSheetToken,
      sig: 'tampered_fake_sig'
    };

    const form = new FormData();
    form.append('file', new Blob([createFakeJpeg()], { type: 'image/jpeg' }), 'tampered.jpg');
    form.append('qrToken', JSON.stringify(tamperedPayload));

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      cookie: adminCookie,
      body: form
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_QR_TOKEN');
  });

  await suite.test('Integration: QR Token from a different competition is rejected', async () => {
    const otherCompId = new mongoose.Types.ObjectId();
    const otherPayload = {
      v: 1,
      cid: otherCompId.toString(),
      rid: regOmr._id.toString(),
      tok: regOmr.omrSheetToken,
      sig: computeOmrSignature(otherCompId.toString(), regOmr._id.toString(), regOmr.omrSheetToken)
    };

    const form = new FormData();
    form.append('file', new Blob([createFakeJpeg()], { type: 'image/jpeg' }), 'other_comp.jpg');
    form.append('qrToken', JSON.stringify(otherPayload));

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      cookie: adminCookie,
      body: form
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'QR_COMPETITION_MISMATCH');
  });

  // --- ATOMIC MODE LOCKING TESTS ---
  await suite.test('Integration: Atomic Mode Lock rejects OMR upload for ONLINE_MCQ candidate', async () => {
    const form = new FormData();
    form.append('file', new Blob([createFakeJpeg()], { type: 'image/jpeg' }), 'online_student_omr.jpg');
    form.append('registrationId', regOnline._id.toString());

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      cookie: adminCookie,
      body: form
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'ATOMIC_MODE_LOCK_VIOLATION');
    assert.ok(res.body.error.message.includes('ONLINE_MCQ'));
  });

  await suite.test('Integration: Atomic Mode Lock blocks OMR registration from starting online attempt', async () => {
    // Student in OMR mode attempts to start online MCQ exam
    const res = await makeRequest(app, 'POST', `/api/v1/competitions/${competition._id}/attempts`, {
      cookie: studentOmrCookie
    });

    assert.equal(res.status, 403);
    assert.ok(res.body.error.code === 'OMR_MODE_ONLY' || res.body.error.code === 'ATOMIC_MODE_LOCK_VIOLATION');
  });

  await suite.test('Integration (Concurrency): Promise.all simultaneous online attempt and OMR upload proves only authorized mode wins', async () => {
    // Concurrently trigger online attempt start (by OMR student) and OMR sheet upload (by Admin for same OMR student)
    const form = new FormData();
    form.append('file', new Blob([createFakeJpeg()], { type: 'image/jpeg' }), 'concurrent_omr.jpg');
    form.append('registrationId', regOmr._id.toString());

    const [onlineAttemptRes, omrUploadRes] = await Promise.all([
      makeRequest(app, 'POST', `/api/v1/competitions/${competition._id}/attempts`, {
        cookie: studentOmrCookie
      }),
      makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
        cookie: adminCookie,
        body: form
      })
    ]);

    // Exactly one exam mode can win:
    // Online attempt MUST be rejected with HTTP 403 (OMR_MODE_ONLY or ATOMIC_MODE_LOCK_VIOLATION)
    assert.equal(onlineAttemptRes.status, 403);
    assert.ok(
      onlineAttemptRes.body.error.code === 'OMR_MODE_ONLY' ||
      onlineAttemptRes.body.error.code === 'ATOMIC_MODE_LOCK_VIOLATION'
    );

    // OMR upload MUST either win (201) or safely detect existing candidate submission (409)
    assert.ok([201, 409].includes(omrUploadRes.status));

    // Verify database state: no online attempt was ever created for OMR student
    const createdAttempt = await Attempt.findOne({
      competitionId: competition._id,
      studentId: studentOmr._id
    });
    assert.equal(createdAttempt, null);
  });

  await suite.test('Integration (Concurrency): Promise.all simultaneous OMR uploads for same candidate rejects losing race with HTTP 409', async () => {
    // Create a new fresh candidate in OMR mode to test parallel upload collision
    const studentOmrParallel = await User.create({
      fullName: 'Parallel Candidate Meera',
      mobile: '+91 9999633009',
      mobileNormalized: '9999633009',
      role: 'student',
      passwordHash: await bcrypt.hash('Phase63Pass@123', 8),
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Kendriya Vidyalaya'
    });

    const regParallel = await Registration.create({
      competitionId: competition._id,
      studentId: studentOmrParallel._id,
      rollNumber: 'EC-2026-OMR99',
      examMode: 'OMR',
      status: 'registered',
      omrSheetToken: 'parallel_test_token_12345'
    });

    // Two different file buffers (different SHA-256 hashes) for the SAME candidate
    const form1 = new FormData();
    form1.append('file', new Blob([createFakeJpeg()], { type: 'image/jpeg' }), 'parallel_scan_1.jpg');
    form1.append('registrationId', regParallel._id.toString());

    const form2 = new FormData();
    form2.append('file', new Blob([createFakeJpeg()], { type: 'image/jpeg' }), 'parallel_scan_2.jpg');
    form2.append('registrationId', regParallel._id.toString());

    const [upload1, upload2] = await Promise.all([
      makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
        cookie: adminCookie,
        body: form1
      }),
      makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
        cookie: adminCookie,
        body: form2
      })
    ]);

    const statuses = [upload1.status, upload2.status].sort();
    // Exactly one upload succeeds (201) and the other is safely rejected with HTTP 409
    assert.deepEqual(statuses, [201, 409]);

    const rejected = upload1.status === 409 ? upload1 : upload2;
    assert.equal(rejected.body.error.code, 'DUPLICATE_CANDIDATE_SUBMISSION');

    // Verify database state: exactly ONE submission exists for this registration
    const count = await OmrSubmission.countDocuments({
      competitionId: competition._id,
      registrationId: regParallel._id,
      status: { $ne: 'FAILED' }
    });
    assert.equal(count, 1);
  });

  // --- BATCH UPLOAD TESTS ---
  await suite.test('Integration (Batch): Partial batch resilience - invalid file in batch does not corrupt or discard valid uploads', async () => {
    const validJpeg = createFakeJpeg();
    const invalidText = Buffer.from('plain text not an image');

    const batchForm = new FormData();
    batchForm.append('files', new Blob([validJpeg], { type: 'image/jpeg' }), 'valid_in_batch.jpg');
    batchForm.append('files', new Blob([invalidText], { type: 'image/jpeg' }), 'corrupt_in_batch.jpg');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      cookie: adminCookie,
      body: batchForm
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.totalUploaded, 1);
    assert.equal(res.body.data.totalFailed, 1);
    assert.equal(res.body.data.submissions.length, 1);
    assert.equal(res.body.data.submissions[0].originalFilename, 'valid_in_batch.jpg');
    assert.equal(res.body.data.errors.length, 1);
    assert.equal(res.body.data.errors[0].filename, 'corrupt_in_batch.jpg');
    assert.equal(res.body.data.errors[0].code, 'INVALID_FILE_SIGNATURE');

    // Verify valid file actually exists in MongoDB
    const subDoc = await OmrSubmission.findById(res.body.data.submissions[0].id);
    assert.ok(subDoc);
    assert.equal(subDoc.fileFormat, 'JPEG');
  });

  await suite.test('Integration (Batch): Batch exceeding 100 MB total limit is rejected with HTTP 413', async () => {
    // Create 11 files of 9.5 MB each = ~104.5 MB (> 100 MB MAX_BATCH_SIZE)
    const largeBatchForm = new FormData();
    const chunk = Buffer.alloc(9.5 * 1024 * 1024, 0xFF);
    chunk[0] = 0xFF;
    chunk[1] = 0xD8;
    chunk[2] = 0xFF;

    for (let i = 0; i < 11; i++) {
      largeBatchForm.append('files', new Blob([chunk], { type: 'image/jpeg' }), `large_${i}.jpg`);
    }

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      cookie: adminCookie,
      body: largeBatchForm
    });

    assert.equal(res.status, 413);
    assert.equal(res.body.error.code, 'BATCH_TOO_LARGE');
  });

  // --- SECURITY & AUTHORIZATION TESTS ---
  await suite.test('Integration: Student cannot upload OMR scans (403 Forbidden)', async () => {
    const form = new FormData();
    form.append('file', new Blob([createFakeJpeg()], { type: 'image/jpeg' }), 'student_upload.jpg');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      cookie: studentOnlineCookie,
      body: form
    });

    assert.equal(res.status, 403);
  });

  await suite.test('Integration: Unauthenticated request cannot upload OMR scans (401 Unauthorized)', async () => {
    const form = new FormData();
    form.append('file', new Blob([createFakeJpeg()], { type: 'image/jpeg' }), 'anon.jpg');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/upload`, {
      body: form
    });

    assert.equal(res.status, 401);
  });

  await suite.test('Integration: Student cannot access private OMR stream endpoint (403 Forbidden)', async () => {
    const res = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${uploadedJpegSubmissionId}/file`, {
      cookie: studentOnlineCookie
    });

    assert.equal(res.status, 403);
  });

  await suite.test('Integration: Authorized Admin can stream private OMR scan with secure headers', async () => {
    const res = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${uploadedJpegSubmissionId}/file`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.ok(res.headers.get('cache-control').includes('no-store'));
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.length, uploadedFileBuffer.length);
  });

  await suite.test('Integration: Admin can query submissions list and submission details', async () => {
    const listRes = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${competition._id}/omr/submissions`, {
      cookie: adminCookie
    });

    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.submissions.length >= 3);
    assert.equal(listRes.body.data.pagination.page, 1);

    const getRes = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${uploadedJpegSubmissionId}`, {
      cookie: adminCookie
    });

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.id, uploadedJpegSubmissionId);
    assert.equal(getRes.body.data.storagePath, undefined); // Server path hidden
    assert.ok(getRes.body.data.auditTrail.length >= 1);
  });
});
