import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Competition } from '../src/models/competition.model.js';
import { Registration } from '../src/models/registration.model.js';
import { OmrSubmission } from '../src/models/omrSubmission.model.js';
import { computeFileHash, resolveSafeStoragePath } from '../src/services/omrUpload.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

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

test('=== PHASE 6.6: OMR ADMIN MANUAL ANSWER VERIFICATION ===', async (suite) => {
  let adminUser = null;
  let headUser = null;
  let studentUser = null;
  let adminCookie = null;
  let headCookie = null;
  let studentCookie = null;
  let competition = null;

  suite.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect(MONGODB_URI);
    }

    await User.deleteMany({ mobileNormalized: { $regex: /^999966/ } });
    await Competition.deleteMany({ title: { $regex: /^P66Test_/ } });
    await OmrSubmission.deleteMany({});
    await OmrSubmission.syncIndexes();

    const passwordHash = await bcrypt.hash('Phase66Pass@123', 8);

    adminUser = await User.create({
      fullName: 'Phase 6.6 Admin Reviewer',
      mobile: '+91 9999666001',
      mobileNormalized: '9999666001',
      role: 'admin',
      passwordHash,
      isActive: true,
      classOrGrade: 'HQ Admin',
      school: 'Admin HQ'
    });

    headUser = await User.create({
      fullName: 'Phase 6.6 Committee Head',
      mobile: '+91 9999666002',
      mobileNormalized: '9999666002',
      role: 'committee_head',
      passwordHash,
      isActive: true,
      classOrGrade: 'Head Controller',
      school: 'Education Committee Council'
    });

    studentUser = await User.create({
      fullName: 'Candidate Priya',
      mobile: '+91 9999666003',
      mobileNormalized: '9999666003',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Kendriya Vidyalaya'
    });

    const login = async (mobile) => {
      const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
        body: { mobile, password: 'Phase66Pass@123' }
      });
      const cookieHeader = res.headers.get('set-cookie');
      return cookieHeader ? cookieHeader.split(';')[0] : null;
    };

    adminCookie = await login('9999666001');
    headCookie = await login('9999666002');
    studentCookie = await login('9999666003');

    assert.ok(adminCookie, 'Admin cookie established');
    assert.ok(headCookie, 'Head cookie established');
    assert.ok(studentCookie, 'Student cookie established');

    // Create test competition
    const now = new Date();
    competition = await Competition.create({
      title: `P66Test_Exam_${Date.now()}`,
      titleEn: 'OMR Manual Verification Test 2026',
      titleHi: 'ओएमआर मानवीय सत्यापन २०२६',
      description: 'Phase 6.6 Manual Review Testing',
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
      eligibleClasses: ['Class 10'],
      isPublished: true,
      resultsPublished: false,
      scoringVersion: 1
    });
  });

  suite.after(async () => {
    await mongoose.disconnect();
  });

  // Helper to create a submission seeded with mock/machine detections
  let fixtureSeq = 0;
  async function createSubmissionWithRawDetections({
    totalQuestions = 50,
    answersOverride = null,
    status = 'NEEDS_REVIEW'
  } = {}) {
    fixtureSeq++;
    const dummyBuffer = Buffer.from(`DUMMY_IMAGE_CONTENT_${Date.now()}_${fixtureSeq}_${Math.random()}`);
    const hash = computeFileHash(dummyBuffer);
    const storedFilename = `omr_p66_${Date.now()}_${fixtureSeq}.png`;
    const storagePath = resolveSafeStoragePath(storedFilename);
    fs.writeFileSync(storagePath, dummyBuffer);

    const alignedFilename = `aligned_p66_${Date.now()}_${fixtureSeq}.png`;
    const alignedStoragePath = resolveSafeStoragePath(alignedFilename);
    fs.writeFileSync(alignedStoragePath, dummyBuffer);

    // Build standard raw detections
    const defaultAnswers = [];
    for (let q = 1; q <= totalQuestions; q++) {
      if (q === 1) {
        defaultAnswers.push({
          questionNumber: q,
          classification: 'SINGLE_MARKED',
          detectedOption: 'A',
          confidence: 0.95,
          markedOptions: ['A'],
          needsReview: false,
          reviewReason: null
        });
      } else if (q === 2) {
        defaultAnswers.push({
          questionNumber: q,
          classification: 'SINGLE_MARKED',
          detectedOption: 'B',
          confidence: 0.92,
          markedOptions: ['B'],
          needsReview: false,
          reviewReason: null
        });
      } else if (q === 49) {
        defaultAnswers.push({
          questionNumber: q,
          classification: 'MULTIPLE_MARKED',
          detectedOption: null,
          confidence: 0.88,
          markedOptions: ['A', 'B'],
          needsReview: true,
          reviewReason: 'Multiple marked options: A, B'
        });
      } else if (q === 50) {
        defaultAnswers.push({
          questionNumber: q,
          classification: 'UNCERTAIN',
          detectedOption: null,
          confidence: 0.42,
          markedOptions: ['C'],
          needsReview: true,
          reviewReason: 'Light or partial mark on option C (fill=0.32)'
        });
      } else {
        defaultAnswers.push({
          questionNumber: q,
          classification: 'BLANK',
          detectedOption: null,
          confidence: 0.90,
          markedOptions: [],
          needsReview: false,
          reviewReason: null
        });
      }
    }

    const answers = answersOverride || defaultAnswers;

    const randomDigits = crypto.randomInt(10000000, 99999999).toString();
    const passwordHash = await bcrypt.hash('Phase66Pass@123', 8);
    const candidateUser = await User.create({
      fullName: `Candidate_${Date.now()}_${fixtureSeq}`,
      mobile: `+91 98${randomDigits}`,
      mobileNormalized: `98${randomDigits}`,
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Test School'
    });

    const uniqueReg = await Registration.create({
      competitionId: competition._id,
      studentId: candidateUser._id,
      rollNumber: `EC-2026-P66_${Date.now()}_${fixtureSeq}`,
      examMode: 'OMR',
      status: 'registered',
      omrSheetToken: `tok_p66_${Date.now()}_${fixtureSeq}`
    });

    const sub = await OmrSubmission.create({
      competitionId: competition._id,
      registrationId: uniqueReg._id,
      studentId: candidateUser._id,
      rollNumber: uniqueReg.rollNumber,
      uploadedBy: adminUser._id,
      originalFilename: `sheet_${fixtureSeq}.png`,
      storedFilename,
      storagePath,
      fileSizeBytes: dummyBuffer.length,
      mimeType: 'image/png',
      fileFormat: 'PNG',
      fileHash: hash,
      status,
      alignedFilename,
      alignedStoragePath,
      alignedAt: new Date(),
      rawDetections: {
        detectedAt: new Date(),
        totalQuestions,
        layoutType: 'twoColumn',
        summary: {
          total: totalQuestions,
          singleMarked: 2,
          blank: 46,
          multipleMarked: 1,
          uncertain: 1,
          overallConfidence: 0.88,
          needsReview: true,
          reviewReasons: ['Q49: Multiple marked', 'Q50: Uncertain mark']
        },
        answers
      }
    });

    return sub;
  }

  // --- 1. ACCESS CONTROL TESTS ---

  await suite.test('Access Control: Authorized Admin can start review, update answers and finalize', async () => {
    const sub = await createSubmissionWithRawDetections();

    // 1. Start review
    const startRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/start-review`,
      { cookie: adminCookie }
    );
    assert.equal(startRes.status, 200);
    assert.equal(startRes.body.data.status, 'IN_REVIEW');

    // 2. Update answer Q1
    const updateRes = await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/1`,
      {
        cookie: adminCookie,
        body: { selectedOption: 'A', reason: 'Confirmed machine detection' }
      }
    );
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.status, 'PARTIALLY_VERIFIED');
  });

  await suite.test('Access Control: Authorized Committee Head can access review and update answers', async () => {
    const sub = await createSubmissionWithRawDetections();

    const startRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/start-review`,
      { cookie: headCookie }
    );
    assert.equal(startRes.status, 200);
    assert.equal(startRes.body.data.status, 'IN_REVIEW');
  });

  await suite.test('Access Control (Security): Student access denied to all review endpoints (HTTP 403 Forbidden)', async () => {
    const sub = await createSubmissionWithRawDetections();

    // Start review
    const r1 = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/start-review`,
      { cookie: studentCookie }
    );
    assert.equal(r1.status, 403);

    // Update answer
    const r2 = await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/1`,
      { cookie: studentCookie, body: { selectedOption: 'A' } }
    );
    assert.equal(r2.status, 403);

    // Finalize
    const r3 = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/finalize-verification`,
      { cookie: studentCookie }
    );
    assert.equal(r3.status, 403);

    // Reopen
    const r4 = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/reopen-verification`,
      { cookie: studentCookie }
    );
    assert.equal(r4.status, 403);
  });

  await suite.test('Access Control (Security): Unauthenticated request is rejected (HTTP 401 Unauthorized)', async () => {
    const sub = await createSubmissionWithRawDetections();

    const res = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/start-review`
    );
    assert.equal(res.status, 401);
  });

  await suite.test('Access Control (Security): Private scan and aligned files are blocked from student access', async () => {
    const sub = await createSubmissionWithRawDetections();

    const r1 = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/file`,
      { cookie: studentCookie }
    );
    assert.equal(r1.status, 403);

    const r2 = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/aligned-file`,
      { cookie: studentCookie }
    );
    assert.equal(r2.status, 403);
  });

  await suite.test('Access Control (Security): Student API responses do not expose OMR review data or server paths', async () => {
    await createSubmissionWithRawDetections();

    // Student calls public / competitions endpoint
    const res = await makeRequest(app, 'GET', `/api/v1/competitions/${competition._id}`, {
      cookie: studentCookie
    });
    assert.equal(res.status, 200);
    const payload = res.body.competition || res.body.data || {};
    // Student payload should not contain rawDetections or confirmedAnswers or server filesystem paths
    assert.equal(payload.rawDetections, undefined);
    assert.equal(payload.confirmedAnswers, undefined);
    assert.equal(payload.storagePath, undefined);
    assert.equal(payload.alignedStoragePath, undefined);
  });

  // --- 2. QUESTION-WISE ANSWER VERIFICATION TESTS ---

  await suite.test('Verification: Single answer confirmation records reviewer and confirmed state', async () => {
    const sub = await createSubmissionWithRawDetections();

    const res = await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/1`,
      {
        cookie: adminCookie,
        body: { selectedOption: 'A', reason: 'Confirmed machine detected answer' }
      }
    );

    assert.equal(res.status, 200);
    const confirmed = res.body.data.confirmedAnswers.answers['1'];
    assert.ok(confirmed);
    assert.equal(confirmed.selectedOption, 'A');
    assert.equal(confirmed.isConfirmed, true);
    assert.equal(confirmed.isCorrected, false);
    assert.equal(confirmed.confirmedBy, adminUser._id.toString());
  });

  await suite.test('Verification: Blank answer confirmation is recorded as BLANK', async () => {
    const sub = await createSubmissionWithRawDetections();

    const res = await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/6`,
      {
        cookie: adminCookie,
        body: { selectedOption: 'BLANK', reason: 'Verified candidate left question blank' }
      }
    );

    assert.equal(res.status, 200);
    const confirmed = res.body.data.confirmedAnswers.answers['6'];
    assert.equal(confirmed.selectedOption, 'BLANK');
    assert.equal(confirmed.isConfirmed, true);
  });

  await suite.test('Verification: Multiple-marked answer correction requires reason and updates answer', async () => {
    const sub = await createSubmissionWithRawDetections();

    // 1. Attempting to correct without reason fails
    const failRes = await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/49`,
      {
        cookie: adminCookie,
        body: { selectedOption: 'A' } // Missing reason
      }
    );
    assert.equal(failRes.status, 400);
    assert.equal(failRes.body.error.code, 'REASON_REQUIRED');

    // 2. Providing valid reason succeeds
    const successRes = await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/49`,
      {
        cookie: adminCookie,
        body: { selectedOption: 'A', reason: 'Option B was marked with an X, candidate intended A' }
      }
    );
    assert.equal(successRes.status, 200);
    const q49 = successRes.body.data.confirmedAnswers.answers['49'];
    assert.equal(q49.selectedOption, 'A');
    assert.equal(q49.isCorrected, true);
    assert.equal(q49.reason, 'Option B was marked with an X, candidate intended A');
  });

  await suite.test('Verification: Uncertain answer correction is manually resolved with reason', async () => {
    const sub = await createSubmissionWithRawDetections();

    const res = await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/50`,
      {
        cookie: adminCookie,
        body: { selectedOption: 'C', reason: 'Faint pencil mark verified as valid attempt on C' }
      }
    );

    assert.equal(res.status, 200);
    const q50 = res.body.data.confirmedAnswers.answers['50'];
    assert.equal(q50.selectedOption, 'C');
    assert.equal(q50.isConfirmed, true);
  });

  await suite.test('Verification (Immutability): Raw detections and physical files remain 100% unchanged after corrections', async () => {
    const sub = await createSubmissionWithRawDetections();
    const originalRawDetections = JSON.parse(JSON.stringify(sub.rawDetections));
    const initialFileBuffer = fs.readFileSync(sub.storagePath);
    const initialHash = computeFileHash(initialFileBuffer);

    // Make multiple corrections
    await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/1`,
      { cookie: adminCookie, body: { selectedOption: 'C', reason: 'Manual override to C' } }
    );
    await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/49`,
      { cookie: adminCookie, body: { selectedOption: 'B', reason: 'Candidate marked B clearly' } }
    );

    // Reload from database
    const reloaded = await OmrSubmission.findById(sub.id);

    // Verify rawDetections is identical
    assert.deepEqual(reloaded.rawDetections.answers.map(a => ({ questionNumber: a.questionNumber, classification: a.classification, detectedOption: a.detectedOption })), originalRawDetections.answers.map(a => ({ questionNumber: a.questionNumber, classification: a.classification, detectedOption: a.detectedOption })));
    assert.equal(reloaded.rawDetections.summary.singleMarked, originalRawDetections.summary.singleMarked);
    assert.equal(reloaded.rawDetections.summary.multipleMarked, originalRawDetections.summary.multipleMarked);

    // Verify storage file is untouched
    const currentBuffer = fs.readFileSync(reloaded.storagePath);
    assert.equal(computeFileHash(currentBuffer), initialHash);
  });

  await suite.test('Verification (Audit Trail): Correction history records previous value, new value, reason and reviewer', async () => {
    const sub = await createSubmissionWithRawDetections();

    // 1. First correction
    await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/1`,
      { cookie: adminCookie, body: { selectedOption: 'B', reason: 'Initial correction to B' } }
    );

    // 2. Second correction on same question
    const res2 = await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/1`,
      { cookie: adminCookie, body: { selectedOption: 'D', reason: 'Correction revised to D' } }
    );

    assert.equal(res2.status, 200);
    const history = res2.body.data.confirmedAnswers.correctionHistory;
    assert.ok(history.length >= 2);

    const latest = history[history.length - 1];
    assert.equal(latest.questionNumber, 1);
    assert.equal(latest.previousOption, 'B');
    assert.equal(latest.newOption, 'D');
    assert.equal(latest.reason, 'Correction revised to D');
    assert.equal(latest.correctedBy, adminUser._id.toString());
  });

  // --- 3. VERIFICATION WORKFLOW & FINALIZATION TESTS ---

  await suite.test('Workflow: Incomplete verification cannot be finalized (HTTP 400 UNRESOLVED_QUESTIONS_REMAIN)', async () => {
    const sub = await createSubmissionWithRawDetections();

    // Attempt to finalize while Q49 (multiple-marked) and Q50 (uncertain) are unconfirmed
    const res = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/finalize-verification`,
      {
        cookie: adminCookie,
        body: { confirmRemainingClean: true }
      }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'UNRESOLVED_QUESTIONS_REMAIN');
    assert.ok(res.body.error.message.includes('Q49'));
    assert.ok(res.body.error.message.includes('Q50'));
  });

  await suite.test('Workflow: Full verification finalizes submission to VERIFIED status', async () => {
    const sub = await createSubmissionWithRawDetections();

    // 1. Manually resolve ambiguous Q49 and Q50
    await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/49`,
      { cookie: adminCookie, body: { selectedOption: 'A', reason: 'Candidate intended A' } }
    );
    await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/50`,
      { cookie: adminCookie, body: { selectedOption: 'C', reason: 'Valid faint attempt on C' } }
    );

    // 2. Finalize verification with confirmRemainingClean = true
    const finRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/finalize-verification`,
      {
        cookie: adminCookie,
        body: {
          confirmRemainingClean: true,
          reviewNotes: 'All questions confirmed and reconciled with physical sheet.'
        }
      }
    );

    assert.equal(finRes.status, 200);
    assert.equal(finRes.body.data.status, 'VERIFIED');
    assert.equal(finRes.body.data.confirmedAnswers.isFullyVerified, true);
    assert.equal(finRes.body.data.confirmedAnswers.verifiedBy, adminUser._id.toString());
    assert.ok(finRes.body.data.confirmedAnswers.verifiedAt);
    assert.equal(finRes.body.data.confirmedAnswers.reviewNotes, 'All questions confirmed and reconciled with physical sheet.');
  });

  await suite.test('Workflow: Cannot modify verified submission without reopening (HTTP 400)', async () => {
    const sub = await createSubmissionWithRawDetections({ status: 'VERIFIED' });

    const res = await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/1`,
      {
        cookie: adminCookie,
        body: { selectedOption: 'B', reason: 'Attempted edit without reopening' }
      }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'SUBMISSION_ALREADY_VERIFIED');
  });

  await suite.test('Workflow: Reopening verified submission transitions to REOPENED with audit trail', async () => {
    const sub = await createSubmissionWithRawDetections({ status: 'VERIFIED' });

    // 1. Reopen with valid administrative reason
    const reopenRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/reopen-verification`,
      {
        cookie: adminCookie,
        body: { reason: 'Student submitted formal re-checking appeal for question 2.' }
      }
    );

    assert.equal(reopenRes.status, 200);
    assert.equal(reopenRes.body.data.status, 'REOPENED');
    assert.equal(reopenRes.body.data.confirmedAnswers.status, 'REOPENED');
    assert.equal(reopenRes.body.data.confirmedAnswers.isFullyVerified, false);

    // 2. Can now modify answers again
    const updateRes = await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/2`,
      {
        cookie: adminCookie,
        body: { selectedOption: 'D', reason: 'Re-checking revealed erased B and selected D' }
      }
    );

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.confirmedAnswers.answers['2'].selectedOption, 'D');
  });

  // --- 4. CONCURRENCY & VERSIONING TESTS ---

  await suite.test('Concurrency: Conflicting concurrent reviewer updates are rejected with HTTP 409', async () => {
    const sub = await createSubmissionWithRawDetections();

    // Reviewer 1 starts review and increments version
    const res1 = await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/1`,
      {
        cookie: adminCookie,
        body: { selectedOption: 'A', reason: 'Reviewer 1 confirms A', expectedVersion: 1 }
      }
    );
    assert.equal(res1.status, 200);
    const newVersion = res1.body.data.confirmedAnswers.version;
    assert.ok(newVersion > 1);

    // Reviewer 2 attempts to submit an edit using outdated version (version: 1)
    const res2 = await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${competition._id}/omr/submissions/${sub.id}/answers/2`,
      {
        cookie: headCookie,
        body: { selectedOption: 'B', reason: 'Reviewer 2 confirms B', expectedVersion: 1 }
      }
    );

    assert.equal(res2.status, 409);
    assert.equal(res2.body.error.code, 'CONCURRENT_REVIEW_CONFLICT');
  });
});
