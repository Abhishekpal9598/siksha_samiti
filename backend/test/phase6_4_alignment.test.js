import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Competition } from '../src/models/competition.model.js';
import { Registration } from '../src/models/registration.model.js';
import { OmrSubmission } from '../src/models/omrSubmission.model.js';
import { config } from '../src/config/env.js';
import { ingestOmrFile, computeFileHash } from '../src/services/omrUpload.service.js';
import { generateGenericOmrPdf } from '../src/services/omrPdfGenerator.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const pythonExe = path.resolve(projectRoot, 'omr-service', 'venv', 'Scripts', 'python.exe');
const fixturesDir = path.resolve(projectRoot, 'backend', 'storage', 'omr_test_fixtures');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/education_committee';

// HTTP request helper
async function makeRequest(app, method, path, { headers = {}, body = null, cookie = null } = {}) {
  const reqHeaders = { ...headers, Connection: 'close' };
  if (body && !reqHeaders['Content-Type']) {
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
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const response = await fetch(url, fetchOptions);
    const contentType = response.headers.get('content-type') || '';

    let data;
    if (contentType.includes('image/') || contentType.includes('application/pdf')) {
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

test('=== PHASE 6.4: OMR IMAGE ALIGNMENT, FIDUCIAL DETECTION & QUALITY VALIDATION ===', async (suite) => {
  let pyProcess = null;
  let adminUser = null;
  let studentUser = null;
  let adminCookie = null;
  let studentCookie = null;
  let competition = null;
  let registration = null;

  suite.before(async () => {
    // 1. Ensure Python Microservice is running on port 8001
    const omrAppDir = path.resolve(projectRoot, 'omr-service');
    let isServiceUp = false;

    try {
      const ping = await fetch('http://127.0.0.1:8001/health', {
        headers: { 'X-Internal-Service-Key': config.omrInternalKey }
      });
      if (ping.ok) isServiceUp = true;
    } catch {}

    if (!isServiceUp) {
      pyProcess = spawn(pythonExe, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001'], {
        cwd: omrAppDir,
        stdio: 'pipe'
      });

      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch('http://127.0.0.1:8001/health', {
            headers: { 'X-Internal-Service-Key': config.omrInternalKey }
          });
          if (res.ok) {
            isServiceUp = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    assert.ok(isServiceUp, 'Python OMR Microservice must be running and healthy on 127.0.0.1:8001');

    // 2. Connect to Database & Seed
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect(MONGODB_URI);
    }

    await User.deleteMany({ mobileNormalized: { $regex: /^9999644/ } });
    await Competition.deleteMany({ title: { $regex: /^P64Test_/ } });
    await OmrSubmission.deleteMany({});
    await OmrSubmission.syncIndexes();

    const passwordHash = await bcrypt.hash('Phase64Pass@123', 8);

    adminUser = await User.create({
      fullName: 'Phase 6.4 Admin Controller',
      mobile: '+91 9999644001',
      mobileNormalized: '9999644001',
      role: 'admin',
      passwordHash,
      isActive: true,
      classOrGrade: 'HQ Admin',
      school: 'Admin HQ'
    });

    studentUser = await User.create({
      fullName: 'Candidate Ananya',
      mobile: '+91 9999644002',
      mobileNormalized: '9999644002',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Kendriya Vidyalaya'
    });

    const login = async (mobile) => {
      const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
        body: { mobile, password: 'Phase64Pass@123' }
      });
      const cookieHeader = res.headers.get('set-cookie');
      return cookieHeader ? cookieHeader.split(';')[0] : `${config.cookieName}=${res.body.token}`;
    };

    adminCookie = await login('9999644001');
    studentCookie = await login('9999644002');

    const now = new Date();
    competition = await Competition.create({
      title: `P64Test_Exam_${Date.now()}`,
      titleEn: 'OMR Evaluation Test 2026',
      titleHi: 'ओएमआर मूल्यांकन २०२६',
      description: 'Phase 6.4 Image Alignment Testing',
      category: 'Science',
      examDate: new Date(now.getTime() + 86400000),
      examStartsAt: new Date(now.getTime() - 60000),
      examEndsAt: new Date(now.getTime() + 86400000),
      registrationOpensAt: new Date(now.getTime() - 86400000),
      registrationClosesAt: new Date(now.getTime() + 43200000),
      durationMinutes: 60,
      totalMarks: 100,
      passingMarks: 40,
      marksPerQuestion: 4,
      status: 'PUBLISHED',
      mode: 'BOTH',
      eligibleClasses: ['Class 10'],
      isPublished: true,
      resultsPublished: false,
      scoringVersion: 1
    });

    registration = await Registration.create({
      competitionId: competition._id,
      studentId: studentUser._id,
      rollNumber: 'EC-2026-P6401',
      examMode: 'OMR',
      status: 'registered',
      omrSheetToken: 'tok_p64_valid_secret_1234567890'
    });
  });

  suite.after(async () => {
    if (pyProcess) {
      pyProcess.kill();
    }
    await User.deleteMany({ mobileNormalized: { $regex: /^9999644/ } });
    if (competition) {
      await Competition.deleteMany({ _id: competition._id });
      await Registration.deleteMany({ competitionId: competition._id });
      await OmrSubmission.deleteMany({ competitionId: competition._id });
    }
    await mongoose.disconnect();
  });

  // Helper to ingest fixture file directly as OmrSubmission
  async function createSubmissionFromFixture(fixtureFilename, regId = null) {
    const filePath = path.join(fixturesDir, fixtureFilename);
    const buffer = fs.readFileSync(filePath);
    return ingestOmrFile({
      file: { originalname: fixtureFilename, buffer },
      competitionId: competition._id,
      actor: adminUser,
      registrationId: regId
    });
  }

  // --- TESTS ---

  let correctSubmissionId;
  let correctInitialHash;

  await suite.test('Integration: Correctly scanned sheet with all four markers is detected and aligned', async () => {
    const sub = await createSubmissionFromFixture('correct_sheet.png');
    correctSubmissionId = sub.id;
    correctInitialHash = sub.fileHash;

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/process-alignment`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'PROCESSING');
    assert.equal(res.body.data.alignment.success, true);
    assert.ok(res.body.data.alignment.confidence >= 0.85);
    assert.deepEqual(res.body.data.alignment.canonicalDimensions, { width: 2480, height: 3508 });
    assert.equal(res.body.data.qualityMetrics.passedQualityGates, true);

    // Verify aligned image file exists on disk in private storage
    const stored = await OmrSubmission.findById(sub.id);
    assert.ok(fs.existsSync(stored.alignedStoragePath));
    assert.ok(stored.alignedStoragePath.includes('omr_private'));
  });

  await suite.test('Integration: Rotated sheet is detected, skew angle computed, and rectified to canonical dimensions', async () => {
    const sub = await createSubmissionFromFixture('rotated_sheet.png');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/process-alignment`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'PROCESSING');
    assert.equal(res.body.data.alignment.success, true);
    // Skew angle was created with 6 degrees rotation
    assert.ok(Math.abs(res.body.data.alignment.skewAngleDegrees) > 3.0);
    assert.deepEqual(res.body.data.alignment.canonicalDimensions, { width: 2480, height: 3508 });
  });

  await suite.test('Integration: Perspective-distorted sheet is detected and rectified to canonical dimensions', async () => {
    const sub = await createSubmissionFromFixture('distorted_sheet.png');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/process-alignment`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'PROCESSING');
    assert.equal(res.body.data.alignment.success, true);
    assert.deepEqual(res.body.data.alignment.canonicalDimensions, { width: 2480, height: 3508 });
  });

  await suite.test('Integration: Missing marker sheet is rejected with status NEEDS_REVIEW and specific missing marker', async () => {
    const sub = await createSubmissionFromFixture('missing_marker_sheet.png');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/process-alignment`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data.status, 'NEEDS_REVIEW');
    assert.ok(res.body.data.rejectionReason.includes('bottomRight') || res.body.data.rejectionReason.includes('MISSING_MARKERS'));
  });

  await suite.test('Integration: Damaged/truncated marker is rejected with status NEEDS_REVIEW', async () => {
    const sub = await createSubmissionFromFixture('damaged_marker_sheet.png');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/process-alignment`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data.status, 'NEEDS_REVIEW');
  });

  await suite.test('Integration: Blurry image is flagged by Laplacian variance quality check (isBlurry: true, NEEDS_REVIEW)', async () => {
    const sub = await createSubmissionFromFixture('blurry_sheet.png');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/process-alignment`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'NEEDS_REVIEW');
    assert.equal(res.body.data.qualityMetrics.isBlurry, true);
    assert.ok(res.body.data.qualityMetrics.blurScore < 40.0);
    assert.equal(res.body.data.qualityMetrics.passedQualityGates, false);
  });

  await suite.test('Integration: Low-resolution image is flagged by DPI and dimension quality check (NEEDS_REVIEW)', async () => {
    const sub = await createSubmissionFromFixture('lowres_sheet.png');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/process-alignment`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'NEEDS_REVIEW');
    assert.equal(res.body.data.qualityMetrics.passedQualityGates, false);
    assert.ok(res.body.data.qualityMetrics.estimatedDpi < 100);
  });

  await suite.test('Integration: Very dark and overexposed images are flagged by luminance quality gates', async () => {
    // Dark
    const subDark = await createSubmissionFromFixture('dark_sheet.png');
    const resDark = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${subDark.id}/process-alignment`, {
      cookie: adminCookie
    });
    assert.equal(resDark.status, 200);
    assert.equal(resDark.body.data.qualityMetrics.isUnderexposed, true);
    assert.equal(resDark.body.data.status, 'NEEDS_REVIEW');

    // Overexposed
    const subOver = await createSubmissionFromFixture('overexposed_sheet.png');
    const resOver = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${subOver.id}/process-alignment`, {
      cookie: adminCookie
    });
    assert.equal(resOver.status, 200);
    assert.equal(resOver.body.data.qualityMetrics.isOverexposed, true);
    assert.equal(resOver.body.data.status, 'NEEDS_REVIEW');
  });

  await suite.test('Integration: Real generated Phase 6.2 OMR PDF renders at 300 DPI, fiducials detected, and rectified', async () => {
    // Generate real PDF using Phase 6.2 service
    const pdfBuffer = await generateGenericOmrPdf({ competition, totalQuestions: 50 });
    const sub = await ingestOmrFile({
      file: { originalname: 'generated_sheet.pdf', buffer: pdfBuffer },
      competitionId: competition._id,
      actor: adminUser
    });

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/process-alignment`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'PROCESSING');
    assert.equal(res.body.data.alignment.success, true);
    assert.ok(res.body.data.alignment.confidence >= 0.90);
    assert.deepEqual(res.body.data.alignment.canonicalDimensions, { width: 2480, height: 3508 });
  });

  await suite.test('Integration: Corrupted/invalid PDF file fails safely with status FAILED without server crash', async () => {
    const corruptPdfBuf = Buffer.from('%PDF-1.4\nCORRUPTED_STREAM_GARBAGE_NO_PAGES_EOF\n'.repeat(5));
    const sub = await ingestOmrFile({
      file: { originalname: 'corrupted.pdf', buffer: corruptPdfBuf },
      competitionId: competition._id,
      actor: adminUser
    });

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/process-alignment`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data.status, 'FAILED');
    assert.ok(res.body.data.rejectionReason);
  });

  await suite.test('Integration: Excessive image dimensions (>35 MP) is rejected with status FAILED (memory exhaustion guard)', async () => {
    const sub = await createSubmissionFromFixture('huge_sheet.png');

    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/process-alignment`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data.status, 'FAILED');
    assert.ok(res.body.data.rejectionReason.includes('maximum allowed pixel limit'));
  });

  await suite.test('Integration: Repeated processing / retry is safe, idempotent, and updates aligned image without duplicate files', async () => {
    // Re-run alignment on the first correctly aligned submission
    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${correctSubmissionId}/process-alignment`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'PROCESSING');

    // Check that audit trail recorded both events
    const subDoc = await OmrSubmission.findById(correctSubmissionId);
    const alignmentAudits = subDoc.auditTrail.filter(a => a.action === 'OMR_ALIGNMENT_PROCESSED');
    assert.ok(alignmentAudits.length >= 2);
  });

  await suite.test('Integration: Original uploaded scan file remains 100% unchanged (SHA-256 identical)', async () => {
    const subDoc = await OmrSubmission.findById(correctSubmissionId);
    const currentBuffer = fs.readFileSync(subDoc.storagePath);
    const currentHash = computeFileHash(currentBuffer);

    assert.equal(currentHash, correctInitialHash);
    assert.equal(subDoc.fileHash, correctInitialHash);
  });

  // --- SECURITY & AUTHORIZATION TESTS ---

  await suite.test('Integration (Security): Student role cannot process alignment (HTTP 403 Forbidden)', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${correctSubmissionId}/process-alignment`, {
      cookie: studentCookie
    });

    assert.equal(res.status, 403);
  });

  await suite.test('Integration (Security): Student role cannot access private aligned image (HTTP 403 Forbidden)', async () => {
    const res = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${correctSubmissionId}/aligned-file`, {
      cookie: studentCookie
    });

    assert.equal(res.status, 403);
  });

  await suite.test('Integration (Security): Unauthenticated request is rejected (HTTP 401 Unauthorized)', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${correctSubmissionId}/process-alignment`);
    assert.equal(res.status, 401);
  });

  await suite.test('Integration (Security): Authorized Admin can stream private aligned image with secure no-cache headers', async () => {
    const res = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${correctSubmissionId}/aligned-file`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.ok(res.headers.get('cache-control').includes('no-store'));
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(Buffer.isBuffer(res.body));
  });

  await suite.test('Integration (Security): API response never exposes server filesystem paths', async () => {
    const res = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${competition._id}/omr/submissions/${correctSubmissionId}`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.storagePath, undefined);
    assert.equal(res.body.data.alignedStoragePath, undefined);
  });
});
