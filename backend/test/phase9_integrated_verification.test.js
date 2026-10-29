import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Competition } from '../src/models/competition.model.js';
import { Question } from '../src/models/question.model.js';
import { Registration } from '../src/models/registration.model.js';
import { Attempt } from '../src/models/attempt.model.js';
import { OmrSubmission } from '../src/models/omrSubmission.model.js';
import { Result } from '../src/models/result.model.js';
import { EvaluationAuditLog } from '../src/models/evaluationAuditLog.model.js';
import { generatePersonalizedOmrPdf } from '../src/services/omrPdfGenerator.service.js';

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

test('=== PHASE 9: FINAL INTEGRATED PRODUCTION VERIFICATION ===', async (suite) => {
  const TEST_DB = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/education_committee';
  
  let adminUser, headUser, studentOnline, studentOmr;
  let adminCookie, headCookie, studentOnlineCookie, studentOmrCookie;
  let onlineComp, omrComp;
  let onlineQuestion1, onlineQuestion2;
  let omrQuestions = [];

  suite.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect(TEST_DB);
    }

    // Clean up any test users and competitions
    await User.deleteMany({ mobileNormalized: { $regex: /^999999/ } });
    await Competition.deleteMany({ title: { $regex: /^Phase9_/ } });

    const passwordHash = await bcrypt.hash('ProductionPhase9Pass!', 8);

    // 1. Create Head Administrator
    headUser = await User.create({
      fullName: 'Phase 9 Committee Head',
      mobile: '+91 9999990001',
      mobileNormalized: '9999990001',
      passwordHash,
      role: 'committee_head',
      school: 'District Examination Board',
      classOrGrade: 'President',
      isActive: true
    });

    // 2. Create Standard Administrator
    adminUser = await User.create({
      fullName: 'Phase 9 Standard Admin',
      mobile: '+91 9999990002',
      mobileNormalized: '9999990002',
      passwordHash,
      role: 'admin',
      school: 'District Examination Board',
      classOrGrade: 'Exam Coordinator',
      isActive: true
    });

    // 3. Create Online Student
    studentOnline = await User.create({
      fullName: 'Phase 9 Online Candidate',
      mobile: '+91 9999990003',
      mobileNormalized: '9999990003',
      passwordHash,
      role: 'student',
      school: 'Central Village School',
      classOrGrade: 'Class 10',
      isActive: true
    });

    // 4. Create OMR Student
    studentOmr = await User.create({
      fullName: 'Phase 9 OMR Candidate',
      mobile: '+91 9999990004',
      mobileNormalized: '9999990004',
      passwordHash,
      role: 'student',
      school: 'Model Village High School',
      classOrGrade: 'Class 10',
      isActive: true
    });

    // Login each to capture cookies
    const login = async (mobile) => {
      const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
        body: { mobile, password: 'ProductionPhase9Pass!' }
      });
      const cookieHeader = res.headers.get('set-cookie');
      return cookieHeader ? cookieHeader.split(';')[0] : null;
    };

    headCookie = await login('9999990001');
    adminCookie = await login('9999990002');
    studentOnlineCookie = await login('9999990003');
    studentOmrCookie = await login('9999990004');

    const now = new Date();

    // 5. Create Online MCQ Competition
    onlineComp = await Competition.create({
      title: 'Phase9_Online_Talent_Search',
      titleEn: 'Phase9_Online_Talent_Search',
      titleHi: 'फेज 9 ऑनलाइन प्रतिभा खोज परीक्षा',
      description: 'Comprehensive online MCQ test for rural students',
      category: 'Science',
      mode: 'ONLINE_MCQ',
      status: 'PUBLISHED',
      isPublished: true,
      examDate: new Date(now.getTime() + 86400000),
      examStartsAt: new Date(now.getTime() - 60000),
      examEndsAt: new Date(now.getTime() + 86400000),
      registrationOpensAt: new Date(now.getTime() - 86400000),
      registrationClosesAt: new Date(now.getTime() + 43200000),
      durationMinutes: 60,
      totalMarks: 8,
      passingMarks: 4,
      marksPerQuestion: 4,
      negativeMarking: {
        enabled: true,
        deduction: 1
      },
      eligibleClasses: ['Class 10'],
      isPublicMeritListEnabled: false,
      resultStatus: 'NOT_EVALUATED',
      scoringVersion: 1
    });

    onlineQuestion1 = await Question.create({
      competitionId: onlineComp._id,
      order: 1,
      prompt: 'What is the speed of light in vacuum?',
      options: [
        { key: 'A', text: '3 x 10^8 m/s' },
        { key: 'B', text: '3 x 10^6 m/s' },
        { key: 'C', text: '3 x 10^5 km/s' },
        { key: 'D', text: 'None of the above' }
      ],
      correctOption: 'A',
      marks: 4,
      negativeMarks: 1
    });

    onlineQuestion2 = await Question.create({
      competitionId: onlineComp._id,
      order: 2,
      prompt: 'Which planet is known as the Red Planet?',
      options: [
        { key: 'A', text: 'Earth' },
        { key: 'B', text: 'Mars' },
        { key: 'C', text: 'Jupiter' },
        { key: 'D', text: 'Saturn' }
      ],
      correctOption: 'B',
      marks: 4,
      negativeMarks: 1
    });

    // 6. Create OMR Competition
    omrComp = await Competition.create({
      title: 'Phase9_OMR_Scholarship_Exam',
      titleEn: 'Phase9_OMR_Scholarship_Exam',
      titleHi: 'फेज 9 ओएमआर छात्रवृत्ति परीक्षा',
      description: 'Pen and Paper OMR sheet examination',
      category: 'General',
      mode: 'OMR',
      status: 'PUBLISHED',
      isPublished: true,
      examDate: new Date(now.getTime() + 86400000),
      examStartsAt: new Date(now.getTime() - 60000),
      examEndsAt: new Date(now.getTime() + 86400000),
      registrationOpensAt: new Date(now.getTime() - 86400000),
      registrationClosesAt: new Date(now.getTime() + 43200000),
      durationMinutes: 120,
      totalMarks: 10,
      passingMarks: 5,
      marksPerQuestion: 2,
      negativeMarking: {
        enabled: true,
        deduction: 0.5
      },
      eligibleClasses: ['Class 10'],
      isPublicMeritListEnabled: false,
      resultStatus: 'NOT_EVALUATED',
      scoringVersion: 1
    });

    for (let i = 1; i <= 5; i++) {
      const q = await Question.create({
        competitionId: omrComp._id,
        order: i,
        prompt: `OMR Question ${i} Text Prompt`,
        options: [
          { key: 'A', text: 'Option A' },
          { key: 'B', text: 'Option B' },
          { key: 'C', text: 'Option C' },
          { key: 'D', text: 'Option D' }
        ],
        correctOption: ['A', 'B', 'C', 'D', 'A'][i - 1],
        marks: 2,
        negativeMarks: 0.5
      });
      omrQuestions.push(q);
    }
  });

  suite.after(async () => {
    await User.deleteMany({ mobileNormalized: { $regex: /^999999/ } });
    await Competition.deleteMany({ title: { $regex: /^Phase9_/ } });
    if (onlineComp) await Question.deleteMany({ competitionId: onlineComp._id });
    if (omrComp) await Question.deleteMany({ competitionId: omrComp._id });
    if (onlineComp) await Registration.deleteMany({ competitionId: onlineComp._id });
    if (omrComp) await Registration.deleteMany({ competitionId: omrComp._id });
    if (onlineComp) await Attempt.deleteMany({ competitionId: onlineComp._id });
    if (omrComp) await OmrSubmission.deleteMany({ competitionId: omrComp._id });
    if (onlineComp) await Result.deleteMany({ competitionId: onlineComp._id });
    if (omrComp) await Result.deleteMany({ competitionId: omrComp._id });
    await mongoose.disconnect();
  });

  // ---------------------------------------------------------------------------
  // STEP 2: Service Health & Connectivity
  // ---------------------------------------------------------------------------
  await suite.test('2.1: GET /api/v1/health returns HTTP 200 with service ONLINE', async () => {
    const res = await makeRequest(app, 'GET', '/api/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.service, 'Education Committee Competition API');
  });

  await suite.test('2.2: GET /api/v1/admin/omr/health reports Python OMR microservice diagnostics', async () => {
    const res = await makeRequest(app, 'GET', '/api/v1/admin/omr/health', {
      cookie: adminCookie
    });
    assert.ok([200, 503].includes(res.status));
    assert.ok(res.body.diagnostic);
    assert.ok(['HEALTHY', 'DEGRADED'].includes(res.body.diagnostic.status));
    if (res.status === 200) {
      assert.equal(res.body.diagnostic.microservice.status, 'HEALTHY');
      assert.ok(res.body.diagnostic.microservice.libraries.opencv);
    } else {
      assert.equal(res.body.diagnostic.microservice.status, 'UNAVAILABLE');
    }
  });

  // ---------------------------------------------------------------------------
  // STEP 3: Complete Online MCQ Lifecycle
  // ---------------------------------------------------------------------------
  let onlineRegId, attemptId;

  await suite.test('3.1: Student explores competitions and registers for Online MCQ competition', async () => {
    const exploreRes = await makeRequest(app, 'GET', '/api/v1/competitions', {
      cookie: studentOnlineCookie
    });
    assert.equal(exploreRes.status, 200);
    assert.ok(exploreRes.body.competitions.some(c => c.id === onlineComp._id.toString() || c._id === onlineComp._id.toString()));

    const regRes = await makeRequest(app, 'POST', `/api/v1/competitions/${onlineComp._id}/register`, {
      cookie: studentOnlineCookie
    });
    assert.equal(regRes.status, 201);
    assert.ok(regRes.body.registration);
    onlineRegId = regRes.body.registration._id;
  });

  await suite.test('3.2: Student starts online attempt, receives questions without answers', async () => {
    const startRes = await makeRequest(app, 'POST', `/api/v1/competitions/${onlineComp._id}/attempts`, {
      cookie: studentOnlineCookie
    });
    assert.equal(startRes.status, 201);
    assert.equal(startRes.body.attempt.status, 'IN_PROGRESS');
    attemptId = startRes.body.attempt.id;

    // Security check: questions must not contain confidential correctOption
    const qList = startRes.body.attempt.questions;
    assert.equal(qList.length, 2);
    for (const q of qList) {
      assert.equal(q.correctOption, undefined, 'Confidential correctOption must never be exposed to candidate');
    }
  });

  await suite.test('3.3: Student saves answer in real-time and submits attempt', async () => {
    const saveRes = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptId}/answers`, {
      cookie: studentOnlineCookie,
      body: {
        answers: [
          {
            questionId: onlineQuestion1._id.toString(),
            selectedOption: 'A'
          }
        ]
      }
    });
    assert.equal(saveRes.status, 200);
    assert.equal(saveRes.body.success, true);

    const submitRes = await makeRequest(app, 'POST', `/api/v1/attempts/${attemptId}/submit`, {
      cookie: studentOnlineCookie
    });
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.body.status, 'SUBMITTED');
  });

  await suite.test('3.4: Candidate cannot view unpublished scorecard (Access Restricted)', async () => {
    const scorecardRes = await makeRequest(app, 'GET', `/api/v1/competitions/${onlineComp._id}/my-result`, {
      cookie: studentOnlineCookie
    });
    assert.equal(scorecardRes.status, 403);
    assert.match(scorecardRes.body.error.message, /under committee review|not published/i);
  });

  // ---------------------------------------------------------------------------
  // STEP 3 (OMR): Complete Paper OMR Lifecycle
  // ---------------------------------------------------------------------------
  let omrRegId, omrSubmissionId;

  await suite.test('3.5: Separate student registers for OMR competition and Admin downloads personalized PDF', async () => {
    const regRes = await makeRequest(app, 'POST', `/api/v1/competitions/${omrComp._id}/register`, {
      cookie: studentOmrCookie
    });
    assert.equal(regRes.status, 201);
    omrRegId = regRes.body.registration.id || regRes.body.registration._id;

    const regDoc = await Registration.findById(omrRegId);
    const pdfBuffer = await generatePersonalizedOmrPdf({
      competition: omrComp,
      registration: regDoc,
      student: studentOmr,
      totalQuestions: 5
    });
    assert.ok(pdfBuffer.length > 1000);
    assert.equal(pdfBuffer.slice(0, 4).toString(), '%PDF');
  });

  await suite.test('3.6: Admin registers OMR submission, verifies answers, and confirms clean data', async () => {
    // Synthetic OMR Submission
    const submission = await OmrSubmission.create({
      competitionId: omrComp._id,
      registrationId: omrRegId,
      studentId: studentOmr._id,
      uploadedBy: adminUser._id,
      originalFilename: 'phase9_scan.png',
      storedFilename: `p9_stored_${Date.now()}.png`,
      storagePath: 'storage/omr_private/p9_test_raw.png',
      fileSizeBytes: 2048,
      mimeType: 'image/png',
      fileFormat: 'PNG',
      fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      status: 'NEEDS_REVIEW',
      rawDetections: {
        detectedAt: new Date(),
        totalQuestions: 5,
        layoutType: 'GENERIC_50',
        answers: [
          { questionNumber: 1, detectedOption: 'A', fillPercentage: 88, confidence: 0.95, classification: 'SINGLE_MARKED' },
          { questionNumber: 2, detectedOption: 'B', fillPercentage: 85, confidence: 0.92, classification: 'SINGLE_MARKED' },
          { questionNumber: 3, detectedOption: 'C', fillPercentage: 90, confidence: 0.96, classification: 'SINGLE_MARKED' },
          { questionNumber: 4, detectedOption: 'D', fillPercentage: 82, confidence: 0.90, classification: 'SINGLE_MARKED' },
          { questionNumber: 5, detectedOption: 'A', fillPercentage: 87, confidence: 0.94, classification: 'SINGLE_MARKED' }
        ]
      }
    });
    omrSubmissionId = submission._id;

    // Start manual review
    const startRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${omrComp._id}/omr/submissions/${omrSubmissionId}/start-review`,
      { cookie: adminCookie }
    );
    assert.equal(startRes.status, 200);

    // Finalize verification confirming remaining clean
    const finalizeRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${omrComp._id}/omr/submissions/${omrSubmissionId}/finalize-verification`,
      {
        cookie: adminCookie,
        body: {
          confirmRemainingClean: true,
          reviewNotes: 'Verified all 5 marks clean by examination coordinator.'
        }
      }
    );

    assert.equal(finalizeRes.status, 200);
    assert.equal(finalizeRes.body.data.status, 'VERIFIED');
    assert.equal(finalizeRes.body.data.confirmedAnswers.isFullyVerified, true);
  });

  // ---------------------------------------------------------------------------
  // STEP 3 (Governance): Central Scoring & Committee Head Controls
  // ---------------------------------------------------------------------------
  await suite.test('3.7: Admin evaluates competition scores; Standard Admin is blocked from publishing', async () => {
    // Online Evaluation
    const evalOnline = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${onlineComp._id}/evaluate`, {
      cookie: adminCookie
    });
    assert.equal(evalOnline.status, 200);
    assert.equal(evalOnline.body.success, true);

    // OMR Evaluation
    const evalOmr = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${omrComp._id}/evaluate`, {
      cookie: adminCookie
    });
    assert.equal(evalOmr.status, 200);
    assert.equal(evalOmr.body.success, true);

    // Standard Admin tries to publish -> STRICT 403 FORBIDDEN
    const publishRes = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${onlineComp._id}/publish`, {
      cookie: adminCookie
    });
    assert.equal(publishRes.status, 403, 'Standard Admin must be blocked from publishing results');
  });

  await suite.test('3.8: Committee Head approves and publishes results; Candidate views official scorecard', async () => {
    // Committee Head approves & publishes Online Competition
    const approveRes = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${onlineComp._id}/approve`, {
      cookie: headCookie
    });
    assert.equal(approveRes.status, 200);

    const pubRes = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${onlineComp._id}/publish`, {
      cookie: headCookie,
      body: { isPublicMeritListEnabled: true }
    });
    assert.equal(pubRes.status, 200);
    assert.equal(pubRes.body.resultStatus, 'PUBLISHED');

    // Candidate can now view official scorecard
    const scorecardRes = await makeRequest(app, 'GET', `/api/v1/competitions/${onlineComp._id}/my-result`, {
      cookie: studentOnlineCookie
    });
    assert.equal(scorecardRes.status, 200);
    assert.equal(scorecardRes.body.success, true);
    assert.equal(scorecardRes.body.result.finalScore, 4); // 1 correct (4 marks), 1 unattempted (0 marks)
    assert.equal(scorecardRes.body.result.rank, 1);
  });

  await suite.test('3.9: Committee Head releases public merit list and tests emergency unpublish', async () => {
    // Toggle public merit list
    const meritToggle = await makeRequest(app, 'PATCH', `/api/v1/admin/competitions/${onlineComp._id}/public-merit-list`, {
      cookie: headCookie,
      body: { isPublicMeritListEnabled: true }
    });
    assert.equal(meritToggle.status, 200);
    assert.equal(meritToggle.body.isPublicMeritListEnabled, true);

    // Public merit list is now accessible
    const publicMerit = await makeRequest(app, 'GET', `/api/v1/competitions/${onlineComp._id}/public-merit-list`);
    assert.equal(publicMerit.status, 200);
    assert.ok(publicMerit.body.meritList.length >= 1);

    // Emergency unpublish by Committee Head
    const unpublishRes = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${onlineComp._id}/unpublish`, {
      cookie: headCookie,
      body: { reason: 'Emergency revision requested by Committee Head' }
    });
    assert.equal(unpublishRes.status, 200);
    assert.equal(unpublishRes.body.resultStatus, 'REVISION_REQUIRED');

    // Public merit list is immediately blocked again
    const publicBlocked = await makeRequest(app, 'GET', `/api/v1/competitions/${onlineComp._id}/public-merit-list`);
    assert.equal(publicBlocked.status, 403);
  });

  // ---------------------------------------------------------------------------
  // STEP 4: Role-Based Authorization Boundary Checks
  // ---------------------------------------------------------------------------
  await suite.test('4.1: Strict Role Boundary Matrix enforcement across roles', async () => {
    // 1. Student accessing Admin route -> 403
    const s1 = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${onlineComp._id}/registrations`, {
      cookie: studentOnlineCookie
    });
    assert.equal(s1.status, 403);

    // 2. Standard Admin accessing Head-only route -> 403
    const a1 = await makeRequest(app, 'PATCH', `/api/v1/admin/competitions/${onlineComp._id}/public-merit-list`, {
      cookie: adminCookie,
      body: { enable: true }
    });
    assert.equal(a1.status, 403);

    // 3. Unauthenticated request to protected route -> 401
    const u1 = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${onlineComp._id}/registrations`);
    assert.equal(u1.status, 401);
  });
});
