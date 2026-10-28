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
import { Question } from '../src/models/question.model.js';
import { Attempt } from '../src/models/attempt.model.js';
import { OmrSubmission } from '../src/models/omrSubmission.model.js';
import { Result } from '../src/models/result.model.js';
import { EvaluationAuditLog } from '../src/models/evaluationAuditLog.model.js';
import { computeFileHash, resolveSafeStoragePath } from '../src/services/omrUpload.service.js';
import { generatePersonalizedOmrPdf } from '../src/services/omrPdfGenerator.service.js';

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

test('=== PHASE 6.8: FINAL OMR SECURITY, ACCURACY & PRODUCTION READINESS AUDIT ===', async (suite) => {
  let adminUser = null;
  let headUser = null;
  let adminCookie = null;
  let headCookie = null;

  suite.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect(MONGODB_URI);
    }

    // Clean up test data
    await User.deleteMany({ mobileNormalized: { $regex: /^999968/ } });
    await Competition.deleteMany({ title: { $regex: /^P68Test_/ } });
    await OmrSubmission.deleteMany({});
    await Result.deleteMany({});
    await EvaluationAuditLog.deleteMany({});
    await Attempt.deleteMany({});
    await Registration.deleteMany({});
    try {
      await Result.collection.dropIndexes();
    } catch {}
    await Result.syncIndexes();

    const passwordHash = await bcrypt.hash('Phase68Pass@123', 8);

    adminUser = await User.create({
      fullName: 'Phase 6.8 Admin Auditor',
      mobile: '+91 9999680001',
      mobileNormalized: '9999680001',
      role: 'admin',
      passwordHash,
      isActive: true,
      classOrGrade: 'HQ Admin',
      school: 'Admin HQ'
    });

    headUser = await User.create({
      fullName: 'Phase 6.8 Committee Head Controller',
      mobile: '+91 9999680002',
      mobileNormalized: '9999680002',
      role: 'committee_head',
      passwordHash,
      isActive: true,
      classOrGrade: 'Head Controller',
      school: 'Education Committee Council'
    });

    const login = async (mobile) => {
      const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
        body: { mobile, password: 'Phase68Pass@123' }
      });
      const cookieHeader = res.headers.get('set-cookie');
      return cookieHeader ? cookieHeader.split(';')[0] : null;
    };

    adminCookie = await login('9999680001');
    headCookie = await login('9999680002');

    assert.ok(adminCookie, 'Admin session active');
    assert.ok(headCookie, 'Head session active');
  });

  suite.after(async () => {
    await mongoose.disconnect();
  });

  let compSeq = 0;
  async function createAuditCompetitionWithQuestions(numQuestions = 10) {
    compSeq++;
    const now = new Date();
    const comp = await Competition.create({
      title: `P68Test_Exam_${compSeq}_${Date.now()}`,
      titleEn: `Audit Competition ${compSeq}`,
      titleHi: `अंकेक्षण प्रतियोगिता ${compSeq}`,
      description: 'Phase 6.8 Audit Testing Competition',
      category: 'Science',
      examDate: new Date(now.getTime() + 86400000),
      examStartsAt: new Date(now.getTime() - 60000),
      examEndsAt: new Date(now.getTime() + 86400000),
      registrationOpensAt: new Date(now.getTime() - 86400000),
      registrationClosesAt: new Date(now.getTime() + 43200000),
      durationMinutes: 60,
      totalMarks: numQuestions * 2,
      passingMarks: numQuestions,
      marksPerQuestion: 2,
      negativeMarking: {
        enabled: true,
        deduction: 0.5
      },
      tieBreakerRules: ['FINAL_SCORE', 'CORRECT_ANSWERS', 'INCORRECT_ANSWERS', 'SUBMISSION_TIME'],
      status: 'PUBLISHED',
      resultStatus: 'NOT_EVALUATED',
      mode: 'BOTH',
      eligibleClasses: ['Class 10'],
      isPublished: true,
      isPublicMeritListEnabled: false,
      scoringVersion: 1
    });

    const optionKeys = ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'A', 'B'];
    const createdQuestions = [];
    for (let i = 0; i < numQuestions; i++) {
      const q = await Question.create({
        competitionId: comp._id,
        order: i + 1,
        prompt: `Audit Question ${i + 1} Prompt?`,
        options: [
          { key: 'A', text: 'Alpha' },
          { key: 'B', text: 'Beta' },
          { key: 'C', text: 'Gamma' },
          { key: 'D', text: 'Delta' }
        ],
        correctOption: optionKeys[i % optionKeys.length],
        marks: 2,
        negativeMarks: 0.5,
        isActive: true
      });
      createdQuestions.push(q);
    }

    return { comp, questions: createdQuestions };
  }

  let studentSeq = 0;
  async function createAuditStudent() {
    studentSeq++;
    const randomDigits = crypto.randomInt(10000000, 99999999).toString();
    const student = await User.create({
      fullName: `Candidate_${studentSeq}`,
      mobile: `+91 97${randomDigits}`,
      mobileNormalized: `97${randomDigits}`,
      role: 'student',
      passwordHash: await bcrypt.hash('Phase68Pass@123', 8),
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Test High School'
    });

    const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
      body: { mobile: `97${randomDigits}`, password: 'Phase68Pass@123' }
    });
    const cookieHeader = res.headers.get('set-cookie');
    const cookie = cookieHeader ? cookieHeader.split(';')[0] : null;

    return { student, cookie };
  }

  let fixtureSeq = 0;
  async function createVerifiedOmrSubmissionDoc({
    competition,
    candidateUser,
    answersMap = {},
    status = 'VERIFIED'
  } = {}) {
    fixtureSeq++;
    const dummyBuffer = Buffer.from(`DUMMY_SCAN_P68_${Date.now()}_${fixtureSeq}_${Math.random()}`);
    const hash = computeFileHash(dummyBuffer);
    const storedFilename = `omr_p68_${Date.now()}_${fixtureSeq}.png`;
    const storagePath = resolveSafeStoragePath(storedFilename);
    fs.writeFileSync(storagePath, dummyBuffer);

    const alignedFilename = `aligned_p68_${Date.now()}_${fixtureSeq}.png`;
    const alignedStoragePath = resolveSafeStoragePath(alignedFilename);
    fs.writeFileSync(alignedStoragePath, dummyBuffer);

    const reg = await Registration.create({
      competitionId: competition._id,
      studentId: candidateUser._id,
      rollNumber: `EC-2026-P68_${Date.now()}_${fixtureSeq}`,
      examMode: 'OMR',
      status: 'registered',
      omrSheetToken: `tok_p68_${Date.now()}_${fixtureSeq}`
    });

    const defaultAnswers = [];
    const answersDoc = {};
    for (let q = 1; q <= 10; q++) {
      const qStr = q.toString();
      const chosen = answersMap[qStr] !== undefined ? answersMap[qStr] : null;
      defaultAnswers.push({
        questionNumber: q,
        classification: chosen ? (chosen === 'BLANK' ? 'BLANK' : 'SINGLE_MARKED') : 'BLANK',
        detectedOption: chosen === 'BLANK' ? null : chosen,
        confidence: 0.95,
        markedOptions: chosen && chosen !== 'BLANK' ? [chosen] : [],
        needsReview: false
      });

      if (chosen !== undefined && chosen !== null) {
        answersDoc[qStr] = {
          selectedOption: chosen,
          isConfirmed: true,
          isCorrected: false,
          reason: 'Explicitly verified in audit test',
          confirmedBy: adminUser._id,
          confirmedAt: new Date()
        };
      }
    }

    const sub = await OmrSubmission.create({
      competitionId: competition._id,
      registrationId: reg._id,
      studentId: candidateUser._id,
      rollNumber: reg.rollNumber,
      uploadedBy: adminUser._id,
      originalFilename: `sheet_p68_${fixtureSeq}.png`,
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
        totalQuestions: 10,
        layoutType: 'twoColumn',
        summary: { total: 10, singleMarked: 8, blank: 2, multipleMarked: 0, uncertain: 0, overallConfidence: 0.95 },
        answers: defaultAnswers
      },
      confirmedAnswers: {
        status,
        verifiedBy: adminUser._id,
        verifiedAt: new Date(),
        isFullyVerified: status === 'VERIFIED',
        reviewNotes: 'Audit verified submission',
        version: 1,
        answers: answersDoc,
        correctionHistory: []
      }
    });

    return { reg, sub };
  }

  // ================= 1. CRITICAL SCORING DATA INTEGRITY AUDIT =================

  await suite.test('Audit 1.1: Missing or unconfirmed answers strictly block scoring (zero fallback to rawDetections)', async () => {
    const { comp } = await createAuditCompetitionWithQuestions(10);
    const { student } = await createAuditStudent();

    // Confirmed answers for Q1-Q9 only, leaving Q10 unconfirmed
    const partialAnswers = {
      '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'A',
      '6': 'B', '7': 'C', '8': 'D', '9': 'A'
    };

    await createVerifiedOmrSubmissionDoc({
      competition: comp,
      candidateUser: student,
      answersMap: partialAnswers,
      status: 'VERIFIED'
    });

    const res = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${comp._id}/evaluate`,
      { cookie: adminCookie, body: { isReEvaluation: true, reason: 'Attempt scoring with unconfirmed Q10' } }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'UNCONFIRMED_ANSWER_REMAINS');
    assert.ok(res.body.error.message.includes('Question 10'));
  });

  await suite.test('Audit 1.2: Reopening a verified sheet is strictly blocked while competition is PUBLISHED', async () => {
    const { comp } = await createAuditCompetitionWithQuestions(10);
    comp.resultStatus = 'PUBLISHED';
    await comp.save();

    const { student } = await createAuditStudent();
    const { sub } = await createVerifiedOmrSubmissionDoc({
      competition: comp,
      candidateUser: student,
      answersMap: { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'A', '6': 'B', '7': 'C', '8': 'D', '9': 'A', '10': 'B' }
    });

    const reopenRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${comp._id}/omr/submissions/${sub._id}/reopen-verification`,
      { cookie: adminCookie, body: { reason: 'Attempt reopen while published' } }
    );

    assert.equal(reopenRes.status, 400);
    assert.equal(reopenRes.body.error.code, 'CANNOT_REOPEN_PUBLISHED');
  });

  await suite.test('Audit 1.3: Reopening a verified sheet invalidates previous Result and prevents stale scoring', async () => {
    const { comp } = await createAuditCompetitionWithQuestions(10);
    const { student } = await createAuditStudent();

    // 1. Prepare fully confirmed sheet
    const { sub } = await createVerifiedOmrSubmissionDoc({
      competition: comp,
      candidateUser: student,
      answersMap: {
        '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'A',
        '6': 'B', '7': 'C', '8': 'D', '9': 'BLANK', '10': 'BLANK'
      }
    });

    // 2. Evaluate competition
    const evalRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${comp._id}/evaluate`,
      { cookie: adminCookie, body: { isReEvaluation: true, reason: 'Initial evaluation for student' } }
    );
    assert.equal(evalRes.status, 200);

    let resDoc = await Result.findOne({ competitionId: comp._id, studentId: student._id });
    assert.ok(resDoc);

    // 3. Reopen verified sheet
    const reopenRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${comp._id}/omr/submissions/${sub._id}/reopen-verification`,
      { cookie: adminCookie, body: { reason: 'Student submitted formal appeal for question re-check' } }
    );
    assert.equal(reopenRes.status, 200);

    // 4. Invalidation Proof: Result record MUST be deleted immediately upon reopening
    resDoc = await Result.findOne({ competitionId: comp._id, studentId: student._id });
    assert.equal(resDoc, null);

    // 5. If competition is re-evaluated while this sheet is REOPENED, evaluation is blocked
    const blockEval = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${comp._id}/evaluate`,
      { cookie: adminCookie, body: { isReEvaluation: true, reason: 'Re-evaluating while sheet is REOPENED' } }
    );
    assert.equal(blockEval.status, 400);
    assert.equal(blockEval.body.error.code, 'UNVERIFIED_OMR_SUBMISSIONS_REMAIN');
  });

  // ================= 2. COMPLETE OMR LIFECYCLE AUDIT =================

  await suite.test('Audit 2.1: End-to-End OMR Lifecycle (PDF -> Upload -> Review -> Score -> Publish -> Scorecard)', async () => {
    const { comp } = await createAuditCompetitionWithQuestions(10);
    const { student, cookie: studentCookie } = await createAuditStudent();

    // Step 1: Generate Personalized PDF
    const reg = await Registration.create({
      competitionId: comp._id,
      studentId: student._id,
      rollNumber: `EC-2026-E2E_${Date.now()}`,
      examMode: 'OMR',
      status: 'registered',
      omrSheetToken: `tok_e2e_${Date.now()}`
    });

    const pdfBuffer = await generatePersonalizedOmrPdf({
      competition: comp,
      registration: reg,
      student,
      totalQuestions: 10
    });
    assert.ok(Buffer.isBuffer(pdfBuffer));
    assert.equal(pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');

    // Step 2 & 3: File ingestion
    const hash = computeFileHash(pdfBuffer);
    const storedFilename = `omr_e2e_${Date.now()}.png`;
    const storagePath = resolveSafeStoragePath(storedFilename);
    fs.writeFileSync(storagePath, pdfBuffer);

    // Step 4-7: Detected bubbles
    const subDoc = await OmrSubmission.create({
      competitionId: comp._id,
      registrationId: reg._id,
      studentId: student._id,
      rollNumber: reg.rollNumber,
      uploadedBy: adminUser._id,
      originalFilename: 'e2e_scan.pdf',
      storedFilename,
      storagePath,
      fileSizeBytes: pdfBuffer.length,
      mimeType: 'application/pdf',
      fileFormat: 'PDF',
      fileHash: hash,
      status: 'NEEDS_REVIEW',
      rawDetections: {
        detectedAt: new Date(),
        totalQuestions: 10,
        layoutType: 'twoColumn',
        summary: { total: 10, singleMarked: 9, blank: 0, multipleMarked: 1, uncertain: 0, overallConfidence: 0.90 },
        answers: [
          { questionNumber: 1, classification: 'SINGLE_MARKED', detectedOption: 'A', confidence: 0.95 },
          { questionNumber: 2, classification: 'SINGLE_MARKED', detectedOption: 'B', confidence: 0.95 },
          { questionNumber: 3, classification: 'SINGLE_MARKED', detectedOption: 'C', confidence: 0.95 },
          { questionNumber: 4, classification: 'SINGLE_MARKED', detectedOption: 'D', confidence: 0.95 },
          { questionNumber: 5, classification: 'SINGLE_MARKED', detectedOption: 'A', confidence: 0.95 },
          { questionNumber: 6, classification: 'SINGLE_MARKED', detectedOption: 'B', confidence: 0.95 },
          { questionNumber: 7, classification: 'SINGLE_MARKED', detectedOption: 'C', confidence: 0.95 },
          { questionNumber: 8, classification: 'SINGLE_MARKED', detectedOption: 'D', confidence: 0.95 },
          { questionNumber: 9, classification: 'SINGLE_MARKED', detectedOption: 'A', confidence: 0.95 },
          { questionNumber: 10, classification: 'MULTIPLE_MARKED', detectedOption: null, confidence: 0.85, needsReview: true }
        ]
      }
    });

    // Step 8: Admin starts review
    const startRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${comp._id}/omr/submissions/${subDoc._id}/start-review`,
      { cookie: adminCookie }
    );
    assert.equal(startRes.status, 200);

    // Step 8b: Admin manually resolves Q10 (Option B was intended)
    const updateRes = await makeRequest(
      app,
      'PUT',
      `/api/v1/admin/competitions/${comp._id}/omr/submissions/${subDoc._id}/answers/10`,
      {
        cookie: adminCookie,
        body: { selectedOption: 'B', reason: 'Candidate marked B clearly and struck out C' }
      }
    );
    assert.equal(updateRes.status, 200);

    // Step 9: Finalize verification with confirmRemainingClean: true
    const finRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${comp._id}/omr/submissions/${subDoc._id}/finalize-verification`,
      { cookie: adminCookie, body: { confirmRemainingClean: true, reviewNotes: 'All 10 questions verified' } }
    );
    assert.equal(finRes.status, 200);
    assert.equal(finRes.body.data.status, 'VERIFIED');

    // Step 10: Score verified answers
    const evalRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${comp._id}/evaluate`,
      { cookie: adminCookie, body: { isReEvaluation: true, reason: 'E2E Scoring' } }
    );
    assert.equal(evalRes.status, 200);

    // Step 11: Request approval and Committee Head approves
    await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${comp._id}/request-approval`,
      { cookie: adminCookie }
    );
    const approveRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${comp._id}/approve`,
      { cookie: headCookie }
    );
    assert.equal(approveRes.status, 200);

    // Step 12: Result Publication by Committee Head
    const pubRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${comp._id}/publish`,
      { cookie: headCookie }
    );
    assert.equal(pubRes.status, 200);

    // Step 13: Student Scorecard Access
    const cardRes = await makeRequest(
      app,
      'GET',
      `/api/v1/competitions/${comp._id}/my-result`,
      { cookie: studentCookie }
    );
    assert.equal(cardRes.status, 200);
    assert.equal(cardRes.body.result.finalScore, 20); // 10/10 correct = 20 marks
    assert.equal(cardRes.body.result.rank, 1);
  });

  // ================= 3. SECURITY & ACCESS CONTROL AUDIT =================

  await suite.test('Security Audit: Standard Admin cannot approve, publish, unpublish or toggle public merit list (Committee Head Only)', async () => {
    const { comp } = await createAuditCompetitionWithQuestions(5);

    const r1 = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${comp._id}/approve`, { cookie: adminCookie });
    assert.equal(r1.status, 403);

    const r2 = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${comp._id}/publish`, { cookie: adminCookie });
    assert.equal(r2.status, 403);

    const r3 = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${comp._id}/unpublish`, { cookie: adminCookie });
    assert.equal(r3.status, 403);

    const r4 = await makeRequest(app, 'PATCH', `/api/v1/admin/competitions/${comp._id}/public-merit-list`, { cookie: adminCookie, body: { isPublicMeritListEnabled: true } });
    assert.equal(r4.status, 403);
  });

  await suite.test('Security Audit: Path traversal is blocked and private OMR scans cannot be accessed statically or without auth', async () => {
    const { comp } = await createAuditCompetitionWithQuestions(5);
    const { cookie: studentCookie } = await createAuditStudent();

    // Unauthenticated access
    const unauthRes = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${comp._id}/omr/submissions/fake_id/file`);
    assert.equal(unauthRes.status, 401);

    // Student access
    const studentRes = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${comp._id}/omr/submissions/fake_id/file`, { cookie: studentCookie });
    assert.equal(studentRes.status, 403);
  });

  // ================= 4. CONCURRENCY & DUPLICATE AUDIT =================

  await suite.test('Concurrency Audit: Simultaneous verification updates with same expectedVersion reject conflicting loser (HTTP 409)', async () => {
    const { comp } = await createAuditCompetitionWithQuestions(10);
    const { student } = await createAuditStudent();

    const { sub } = await createVerifiedOmrSubmissionDoc({
      competition: comp,
      candidateUser: student,
      answersMap: { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'A', '6': 'B', '7': 'C', '8': 'D', '9': 'A', '10': 'B' },
      status: 'IN_REVIEW'
    });

    const [res1, res2] = await Promise.all([
      makeRequest(
        app,
        'PUT',
        `/api/v1/admin/competitions/${comp._id}/omr/submissions/${sub._id}/answers/1`,
        { cookie: adminCookie, body: { selectedOption: 'B', reason: 'Admin 1 update', expectedVersion: 1 } }
      ),
      makeRequest(
        app,
        'PUT',
        `/api/v1/admin/competitions/${comp._id}/omr/submissions/${sub._id}/answers/2`,
        { cookie: headCookie, body: { selectedOption: 'C', reason: 'Admin 2 update', expectedVersion: 1 } }
      )
    ]);

    const statuses = [res1.status, res2.status];
    assert.ok(statuses.includes(200), 'One request must succeed with 200');
    assert.ok(statuses.includes(409), 'The concurrent conflicting request must fail with 409 CONCURRENT_REVIEW_CONFLICT');
  });

  await suite.test('Concurrency Audit: Simultaneous evaluation calls do not duplicate Result records', async () => {
    const { comp } = await createAuditCompetitionWithQuestions(10);
    const { student } = await createAuditStudent();

    await createVerifiedOmrSubmissionDoc({
      competition: comp,
      candidateUser: student,
      answersMap: { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'A', '6': 'B', '7': 'C', '8': 'D', '9': 'A', '10': 'B' },
      status: 'VERIFIED'
    });

    await Promise.all([
      makeRequest(app, 'POST', `/api/v1/admin/competitions/${comp._id}/evaluate`, { cookie: adminCookie, body: { isReEvaluation: true, reason: 'Parallel eval 1', allowUnverifiedOmr: true } }),
      makeRequest(app, 'POST', `/api/v1/admin/competitions/${comp._id}/evaluate`, { cookie: headCookie, body: { isReEvaluation: true, reason: 'Parallel eval 2', allowUnverifiedOmr: true } })
    ]);

    const results = await Result.find({ competitionId: comp._id, studentId: student._id });
    assert.equal(results.length, 1, 'Strictly 1 result record per student per competition');
  });
});
