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
import { ingestOmrFile, computeFileHash, resolveSafeStoragePath } from '../src/services/omrUpload.service.js';
import { generateGenericOmrPdf } from '../src/services/omrPdfGenerator.service.js';
import { detectOmrBubbles } from '../src/services/omrClient.service.js';

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

test('=== PHASE 6.5: OMR BUBBLE DETECTION AND ANSWER EXTRACTION ===', async (suite) => {
  let pyProcess = null;
  let adminUser = null;
  let studentUser = null;
  let adminCookie = null;
  let studentCookie = null;
  let competition = null;
  let registration = null;

  suite.before(async () => {
    try {
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
          env: { ...process.env, PYTHONPATH: omrAppDir },
          stdio: ['ignore', 'inherit', 'inherit']
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

      console.log('isServiceUp:', isServiceUp);
      assert.ok(isServiceUp, 'Python OMR Microservice must be running and healthy on 127.0.0.1:8001');

      // 2. Connect to Database & Seed
      if (mongoose.connection.readyState !== 1) {
        if (mongoose.connection.readyState !== 0) {
          await mongoose.disconnect();
        }
        await mongoose.connect(MONGODB_URI);
      }

      await User.deleteMany({ mobileNormalized: { $regex: /^9999655/ } });
      await Competition.deleteMany({ title: { $regex: /^P65Test_/ } });
      await OmrSubmission.deleteMany({});
      await OmrSubmission.syncIndexes();

      const passwordHash = await bcrypt.hash('Phase65Pass@123', 8);

      adminUser = await User.create({
        fullName: 'Phase 6.5 Admin Examiner',
        mobile: '+91 9999655001',
        mobileNormalized: '9999655001',
        role: 'admin',
        passwordHash,
        isActive: true,
        classOrGrade: 'HQ Admin',
        school: 'Admin HQ'
      });

      studentUser = await User.create({
        fullName: 'Candidate Vikram',
        mobile: '+91 9999655002',
        mobileNormalized: '9999655002',
        role: 'student',
        passwordHash,
        isActive: true,
        classOrGrade: 'Class 12',
        school: 'Delhi Public School'
      });

      const login = async (mobile) => {
        const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
          body: { mobile, password: 'Phase65Pass@123' }
        });
        const cookieHeader = res.headers.get('set-cookie');
        return cookieHeader ? cookieHeader.split(';')[0] : null;
      };

      adminCookie = await login('9999655001');
      studentCookie = await login('9999655002');

      console.log('adminCookie:', Boolean(adminCookie), 'studentCookie:', Boolean(studentCookie));
      assert.ok(adminCookie, 'Admin session cookie must be established');
      assert.ok(studentCookie, 'Student session cookie must be established');

      // Create test competition
      const now = new Date();
      competition = await Competition.create({
        title: `P65Test_Exam_${Date.now()}`,
        titleEn: 'OMR Bubble Detection Test 2026',
        titleHi: 'ओएमआर बबल पहचान २०२६',
        description: 'Phase 6.5 Bubble Detection Testing',
        category: 'Science',
        examDate: new Date(now.getTime() + 86400000),
        examStartsAt: new Date(now.getTime() - 60000),
        examEndsAt: new Date(now.getTime() + 86400000),
        registrationOpensAt: new Date(now.getTime() - 86400000),
        registrationClosesAt: new Date(now.getTime() + 43200000),
        durationMinutes: 60,
        totalMarks: 100,
        passingMarks: 40,
        marksPerQuestion: 2,
        status: 'PUBLISHED',
        mode: 'BOTH',
        eligibleClasses: ['Class 12'],
        isPublished: true,
        resultsPublished: false,
        scoringVersion: 1
      });

      registration = await Registration.create({
        competitionId: competition._id,
        studentId: studentUser._id,
        rollNumber: `EC-2026-P6501`,
        examMode: 'OMR',
        status: 'registered',
        omrSheetToken: 'tok_p65_valid_secret_1234567890'
      });
      console.log('Setup finished successfully!');
    } catch (err) {
      console.error('BEFORE HOOK ERROR:', err);
      throw err;
    }
  });

  suite.after(async () => {
    if (pyProcess) {
      pyProcess.kill();
    }
  });

  // Helper to ingest and set up aligned submission directly
  let fixtureSeq = 0;
  async function createSubmissionWithAlignedFixture(fixtureFilename) {
    const fixturePath = path.resolve(fixturesDir, fixtureFilename);
    const rawBuf = fs.readFileSync(fixturePath);
    // Append unique comment trailer to ensure unique SHA-256 hash per test run
    fixtureSeq++;
    const uniqueSuffix = Buffer.from(`\x00TRAILER_${Date.now()}_${fixtureSeq}_${Math.random()}`);
    const buf = Buffer.concat([rawBuf, uniqueSuffix]);
    const sub = await ingestOmrFile({
      file: { originalname: `${fixtureSeq}_${fixtureFilename}`, buffer: buf },
      competitionId: competition._id,
      actor: adminUser
    });

    // Copy to aligned storage path to simulate completed Phase 6.4 alignment
    const alignedFilename = `aligned_${sub.id}.png`;
    const alignedStoragePath = resolveSafeStoragePath(alignedFilename);
    fs.copyFileSync(fixturePath, alignedStoragePath);

    const subDoc = await OmrSubmission.findById(sub.id);
    subDoc.alignedFilename = alignedFilename;
    subDoc.alignedStoragePath = alignedStoragePath;
    subDoc.alignedAt = new Date();
    subDoc.status = 'PROCESSING';
    await subDoc.save();

    return subDoc;
  }

  // --- UNIT / DIRECT MICROSERVICE TESTS ---

  await suite.test('Unit: Microservice detects clean single marks with high confidence (Q1:A, Q2:B, Q3:C, Q4:D, Q5:A)', async () => {
    const fixturePath = path.resolve(fixturesDir, 'bubble_clean_sheet.png');
    const result = await detectOmrBubbles({ alignedPath: fixturePath, totalQuestions: 50 });

    assert.equal(result.success, true);
    assert.equal(result.totalQuestions, 50);
    assert.equal(result.summary.singleMarked, 5);
    assert.equal(result.summary.blank, 45);
    assert.equal(result.summary.multipleMarked, 0);
    assert.equal(result.summary.uncertain, 0);
    assert.equal(result.summary.needsReview, false);
    assert.ok(result.summary.overallConfidence >= 0.85);

    // Verify individual answers
    const q1 = result.answers.find(a => a.questionNumber === 1);
    const q2 = result.answers.find(a => a.questionNumber === 2);
    const q3 = result.answers.find(a => a.questionNumber === 3);
    const q4 = result.answers.find(a => a.questionNumber === 4);
    const q5 = result.answers.find(a => a.questionNumber === 5);
    const q6 = result.answers.find(a => a.questionNumber === 6);

    assert.equal(q1.classification, 'SINGLE_MARKED');
    assert.equal(q1.detectedOption, 'A');
    assert.ok(q1.confidence >= 0.85);

    assert.equal(q2.classification, 'SINGLE_MARKED');
    assert.equal(q2.detectedOption, 'B');

    assert.equal(q3.classification, 'SINGLE_MARKED');
    assert.equal(q3.detectedOption, 'C');

    assert.equal(q4.classification, 'SINGLE_MARKED');
    assert.equal(q4.detectedOption, 'D');

    assert.equal(q5.classification, 'SINGLE_MARKED');
    assert.equal(q5.detectedOption, 'A');

    assert.equal(q6.classification, 'BLANK');
    assert.equal(q6.detectedOption, null);
    assert.ok(q6.confidence >= 0.85);
  });

  await suite.test('Unit: Microservice detects multiple marked bubbles on same question (MULTIPLE_MARKED, needsReview: true)', async () => {
    const fixturePath = path.resolve(fixturesDir, 'bubble_multi_sheet.png');
    const result = await detectOmrBubbles({ alignedPath: fixturePath, totalQuestions: 50 });

    assert.equal(result.success, true);
    assert.equal(result.summary.multipleMarked, 1);
    assert.equal(result.summary.needsReview, true);
    assert.ok(result.summary.reviewReasons.some(r => r.includes('Multiple bubbles filled')));

    const q1 = result.answers.find(a => a.questionNumber === 1);
    assert.equal(q1.classification, 'MULTIPLE_MARKED');
    assert.equal(q1.detectedOption, null);
    assert.equal(q1.needsReview, true);
    assert.deepEqual(q1.markedOptions, ['A', 'B']);
  });

  await suite.test('Unit: Microservice detects light pencil and erased marks (UNCERTAIN, needsReview: true)', async () => {
    const fixturePath = path.resolve(fixturesDir, 'bubble_uncertain_sheet.png');
    const result = await detectOmrBubbles({ alignedPath: fixturePath, totalQuestions: 50 });

    assert.equal(result.success, true);
    assert.ok(result.summary.uncertain >= 1);
    assert.equal(result.summary.needsReview, true);

    const q1 = result.answers.find(a => a.questionNumber === 1);
    assert.equal(q1.classification, 'UNCERTAIN');
    assert.equal(q1.needsReview, true);
    assert.ok(q1.reviewReason.length > 0);
  });

  await suite.test('Unit: Microservice handles slight bubble shift (+2px) without misclassification', async () => {
    const fixturePath = path.resolve(fixturesDir, 'bubble_shifted_sheet.png');
    const result = await detectOmrBubbles({ alignedPath: fixturePath, totalQuestions: 50 });

    assert.equal(result.success, true);
    const q1 = result.answers.find(a => a.questionNumber === 1);
    assert.equal(q1.classification, 'SINGLE_MARKED');
    assert.equal(q1.detectedOption, 'C');
  });

  await suite.test('Unit: Microservice handles 100-question fourColumn layout correctly', async () => {
    const fixturePath = path.resolve(fixturesDir, 'bubble_100q_sheet.png');
    const result = await detectOmrBubbles({ alignedPath: fixturePath, totalQuestions: 100 });

    assert.equal(result.success, true);
    assert.equal(result.totalQuestions, 100);
    assert.equal(result.layoutType, 'fourColumn');
    assert.equal(result.summary.singleMarked, 3);
    assert.equal(result.summary.blank, 97);

    const q1 = result.answers.find(a => a.questionNumber === 1);
    const q55 = result.answers.find(a => a.questionNumber === 55);
    const q100 = result.answers.find(a => a.questionNumber === 100);

    assert.equal(q1.detectedOption, 'A');
    assert.equal(q55.detectedOption, 'C');
    assert.equal(q100.detectedOption, 'D');
  });

  await suite.test('Unit: Non-existent aligned file fails safely with error', async () => {
    await assert.rejects(
      async () => {
        await detectOmrBubbles({ alignedPath: 'non_existent_aligned_file.png', totalQuestions: 50 });
      },
      (err) => {
        assert.ok(err.message.includes('not found') || err.message.includes('400') || err.message.includes('ALIGNED_FILE_NOT_FOUND'));
        return true;
      }
    );
  });

  // --- BACKEND API INTEGRATION TESTS ---

  await suite.test('Integration: Admin executes bubble detection on clean sheet (status PROCESSING, high confidence)', async () => {
    const subDoc = await createSubmissionWithAlignedFixture('bubble_clean_sheet.png');

    const res = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${subDoc.id}/detect-bubbles`,
      { cookie: adminCookie }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'PROCESSING');
    assert.ok(res.body.data.rawDetections);
    assert.equal(res.body.data.rawDetections.totalQuestions, 50);
    assert.equal(res.body.data.rawDetections.summary.singleMarked, 5);
    assert.equal(res.body.data.rawDetections.summary.blank, 45);
    assert.equal(res.body.data.rawDetections.summary.needsReview, false);

    // Verify audit trail recorded
    const updated = await OmrSubmission.findById(subDoc.id);
    const bubbleAudit = updated.auditTrail.find(a => a.action === 'OMR_BUBBLE_DETECTION_PROCESSED');
    assert.ok(bubbleAudit);
    assert.equal(bubbleAudit.details.singleMarked, 5);
    assert.equal(bubbleAudit.details.blank, 45);
  });

  await suite.test('Integration: Ambiguous sheet triggers NEEDS_REVIEW status with rejectionReason set', async () => {
    const subDoc = await createSubmissionWithAlignedFixture('bubble_multi_sheet.png');

    const res = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${subDoc.id}/detect-bubbles`,
      { cookie: adminCookie }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'NEEDS_REVIEW');
    assert.ok(res.body.data.rejectionReason.includes('Multiple bubbles filled'));
    assert.equal(res.body.data.rawDetections.summary.multipleMarked, 1);
    assert.equal(res.body.data.rawDetections.summary.needsReview, true);
  });

  await suite.test('Integration: Submission without aligned image returns 400 ALIGNED_IMAGE_REQUIRED', async () => {
    // Ingest submission without alignment
    const fixturePath = path.resolve(fixturesDir, 'bubble_clean_sheet.png');
    const rawBuf = fs.readFileSync(fixturePath);
    const buf = Buffer.concat([rawBuf, Buffer.from(`\x00UNALIGNED_${Date.now()}`)]);
    const sub = await ingestOmrFile({
      file: { originalname: 'unaligned_test.png', buffer: buf },
      competitionId: competition._id,
      actor: adminUser
    });

    const res = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/detect-bubbles`,
      { cookie: adminCookie }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'ALIGNED_IMAGE_REQUIRED');
  });

  await suite.test('Integration: Reprocessing bubble detection NEVER overwrites confirmedAnswers', async () => {
    const subDoc = await createSubmissionWithAlignedFixture('bubble_clean_sheet.png');

    // Simulate existing human confirmed answers from manual verification
    subDoc.confirmedAnswers = {
      verifiedBy: adminUser._id,
      verifiedAt: new Date(),
      answers: { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A' },
      notes: 'Human verified'
    };
    await subDoc.save();

    // Re-run bubble detection
    const res = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${subDoc.id}/detect-bubbles`,
      { cookie: adminCookie }
    );

    assert.equal(res.status, 200);

    // Verify in database that confirmedAnswers is intact and unaltered
    const reloaded = await OmrSubmission.findById(subDoc.id);
    assert.ok(reloaded.confirmedAnswers, 'confirmedAnswers must still exist');
    assert.equal(reloaded.confirmedAnswers.notes, 'Human verified');
    assert.deepEqual(reloaded.confirmedAnswers.answers, { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A' });

    // And rawDetections was updated
    assert.ok(reloaded.rawDetections.detectedAt);
    assert.equal(reloaded.rawDetections.summary.singleMarked, 5);
  });

  await suite.test('Integration: Real generated Phase 6.2 OMR PDF end-to-end alignment and bubble detection', async () => {
    // Generate real PDF from Phase 6.2 service
    const pdfBuffer = await generateGenericOmrPdf({ competition, totalQuestions: 50 });
    const sub = await ingestOmrFile({
      file: { originalname: 'generic_generated.pdf', buffer: pdfBuffer },
      competitionId: competition._id,
      actor: adminUser
    });

    // 1. Process Alignment
    const alignRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/process-alignment`,
      { cookie: adminCookie }
    );
    assert.equal(alignRes.status, 200);
    assert.equal(alignRes.body.success, true);

    // 2. Process Bubble Detection
    const bubbleRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/detect-bubbles`,
      { cookie: adminCookie }
    );
    assert.equal(bubbleRes.status, 200);
    assert.equal(bubbleRes.body.success, true);
    console.log('PDF DETECTION SUMMARY:', bubbleRes.body.data?.rawDetections?.summary);
    assert.equal(bubbleRes.body.data.rawDetections.totalQuestions, 50);
    // Unmarked blank template should have 50 blank questions
    assert.equal(bubbleRes.body.data.rawDetections.summary.blank, 50);
    assert.equal(bubbleRes.body.data.rawDetections.summary.singleMarked, 0);
    assert.equal(bubbleRes.body.data.rawDetections.summary.multipleMarked, 0);
    assert.equal(bubbleRes.body.data.rawDetections.summary.needsReview, false);
  });

  // --- SECURITY TESTS ---

  await suite.test('Security: Student cannot trigger bubble detection (HTTP 403 Forbidden)', async () => {
    const subDoc = await createSubmissionWithAlignedFixture('bubble_clean_sheet.png');

    const res = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${subDoc.id}/detect-bubbles`,
      { cookie: studentCookie }
    );

    assert.equal(res.status, 403);
  });

  await suite.test('Security: Unauthenticated request is rejected (HTTP 401 Unauthorized)', async () => {
    const subDoc = await createSubmissionWithAlignedFixture('bubble_clean_sheet.png');

    const res = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${subDoc.id}/detect-bubbles`
    );

    assert.equal(res.status, 401);
  });

  await suite.test('Security: JSON responses never expose server filesystem paths', async () => {
    const subDoc = await createSubmissionWithAlignedFixture('bubble_clean_sheet.png');

    const res = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${subDoc.id}`,
      { cookie: adminCookie }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.storagePath, undefined);
    assert.equal(res.body.data.alignedStoragePath, undefined);
  });
});
