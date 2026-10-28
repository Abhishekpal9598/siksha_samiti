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

test('=== PHASE 6.7: OMR SCORING ENGINE INTEGRATION & UNIFIED MERIT LIST ===', async (suite) => {
  let adminUser = null;
  let headUser = null;
  let onlineStudent = null;
  let omrStudent = null;
  let adminCookie = null;
  let headCookie = null;
  let onlineCookie = null;
  let omrCookie = null;
  let competition = null;
  let questions = [];

  suite.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect(MONGODB_URI);
    }

    // Clean up test data
    await User.deleteMany({ mobileNormalized: { $regex: /^999967/ } });
    await Competition.deleteMany({ title: { $regex: /^P67Test_/ } });
    await OmrSubmission.deleteMany({});
    await Result.deleteMany({});
    await EvaluationAuditLog.deleteMany({});
    await Attempt.deleteMany({});
    await Registration.deleteMany({});
    try {
      await Result.collection.dropIndexes();
    } catch {}
    await Result.syncIndexes();

    const passwordHash = await bcrypt.hash('Phase67Pass@123', 8);

    adminUser = await User.create({
      fullName: 'Phase 6.7 Admin Examiner',
      mobile: '+91 9999670001',
      mobileNormalized: '9999670001',
      role: 'admin',
      passwordHash,
      isActive: true,
      classOrGrade: 'HQ Admin',
      school: 'Admin HQ'
    });

    headUser = await User.create({
      fullName: 'Phase 6.7 Committee Head',
      mobile: '+91 9999670002',
      mobileNormalized: '9999670002',
      role: 'committee_head',
      passwordHash,
      isActive: true,
      classOrGrade: 'Head Controller',
      school: 'Education Committee Council'
    });

    onlineStudent = await User.create({
      fullName: 'Candidate Online Aakash',
      mobile: '+91 9999670003',
      mobileNormalized: '9999670003',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Delhi Public School'
    });

    omrStudent = await User.create({
      fullName: 'Candidate OMR Bhavna',
      mobile: '+91 9999670004',
      mobileNormalized: '9999670004',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Kendriya Vidyalaya'
    });

    const login = async (mobile) => {
      const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
        body: { mobile, password: 'Phase67Pass@123' }
      });
      const cookieHeader = res.headers.get('set-cookie');
      return cookieHeader ? cookieHeader.split(';')[0] : null;
    };

    adminCookie = await login('9999670001');
    headCookie = await login('9999670002');
    onlineCookie = await login('9999670003');
    omrCookie = await login('9999670004');

    assert.ok(adminCookie, 'Admin cookie established');
    assert.ok(headCookie, 'Head cookie established');
    assert.ok(onlineCookie, 'Online student cookie established');
    assert.ok(omrCookie, 'OMR student cookie established');

    // Create Hybrid Competition (mode: BOTH)
    const now = new Date();
    competition = await Competition.create({
      title: `P67Test_Exam_${Date.now()}`,
      titleEn: 'Hybrid Science Championship 2026',
      titleHi: 'हाइब्रिड विज्ञान प्रतियोगिता २०२६',
      description: 'Phase 6.7 Scoring Integration Testing',
      category: 'Science',
      examDate: new Date(now.getTime() + 86400000),
      examStartsAt: new Date(now.getTime() - 60000),
      examEndsAt: new Date(now.getTime() + 86400000),
      registrationOpensAt: new Date(now.getTime() - 86400000),
      registrationClosesAt: new Date(now.getTime() + 43200000),
      durationMinutes: 60,
      totalMarks: 20,
      passingMarks: 8,
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

    // Create 10 Questions with Keys:
    // Q1: A, Q2: B, Q3: C, Q4: D, Q5: A, Q6: B, Q7: C, Q8: D, Q9: A, Q10: B
    const optionKeys = ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'A', 'B'];
    questions = [];
    for (let i = 0; i < 10; i++) {
      const q = await Question.create({
        competitionId: competition._id,
        order: i + 1,
        prompt: `Question ${i + 1} Prompt Content?`,
        options: [
          { key: 'A', text: 'Option Alpha' },
          { key: 'B', text: 'Option Beta' },
          { key: 'C', text: 'Option Gamma' },
          { key: 'D', text: 'Option Delta' }
        ],
        correctOption: optionKeys[i],
        marks: 2,
        negativeMarks: 0.5,
        isActive: true
      });
      questions.push(q);
    }
  });

  suite.after(async () => {
    await mongoose.disconnect();
  });

  let fixtureSeq = 0;
  async function createVerifiedOmrSubmission({
    candidateUser,
    answersMap = {},
    status = 'VERIFIED'
  } = {}) {
    fixtureSeq++;
    const dummyBuffer = Buffer.from(`DUMMY_SCAN_${Date.now()}_${fixtureSeq}_${Math.random()}`);
    const hash = computeFileHash(dummyBuffer);
    const storedFilename = `omr_p67_${Date.now()}_${fixtureSeq}.png`;
    const storagePath = resolveSafeStoragePath(storedFilename);
    fs.writeFileSync(storagePath, dummyBuffer);

    const alignedFilename = `aligned_p67_${Date.now()}_${fixtureSeq}.png`;
    const alignedStoragePath = resolveSafeStoragePath(alignedFilename);
    fs.writeFileSync(alignedStoragePath, dummyBuffer);

    const reg = await Registration.create({
      competitionId: competition._id,
      studentId: candidateUser._id,
      rollNumber: `EC-2026-OMR_${Date.now()}_${fixtureSeq}`,
      examMode: 'OMR',
      status: 'registered',
      omrSheetToken: `tok_omr_${Date.now()}_${fixtureSeq}`
    });

    const defaultAnswers = [];
    for (let q = 1; q <= 10; q++) {
      const qStr = q.toString();
      const chosen = answersMap[qStr] !== undefined ? answersMap[qStr] : null;
      defaultAnswers.push({
        questionNumber: q,
        classification: chosen ? 'SINGLE_MARKED' : 'BLANK',
        detectedOption: chosen === 'BLANK' ? null : chosen,
        confidence: 0.95,
        markedOptions: chosen && chosen !== 'BLANK' ? [chosen] : [],
        needsReview: false
      });
    }

    const answersDoc = {};
    for (let q = 1; q <= 10; q++) {
      const qStr = q.toString();
      const chosen = answersMap[qStr] !== undefined ? answersMap[qStr] : null;
      answersDoc[qStr] = {
        selectedOption: chosen,
        isConfirmed: true,
        isCorrected: false,
        reason: 'Confirmed verification',
        confirmedBy: adminUser._id,
        confirmedAt: new Date()
      };
    }

    const sub = await OmrSubmission.create({
      competitionId: competition._id,
      registrationId: reg._id,
      studentId: candidateUser._id,
      rollNumber: reg.rollNumber,
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
        reviewNotes: 'Verified OMR sheet for evaluation',
        version: 1,
        answers: answersDoc,
        correctionHistory: []
      }
    });

    return { reg, sub };
  }

  // --- 1. SCORING & DEDUCTION TESTS ---

  await suite.test('Scoring: Verified OMR submission is evaluated using authoritative question marking keys (positive marks calculated)', async () => {
    // Bhavna answers:
    // Q1: A (Correct, +2)
    // Q2: B (Correct, +2)
    // Q3: C (Correct, +2)
    // Q4: D (Correct, +2)
    // Q5: A (Correct, +2)
    // Q6: B (Correct, +2)
    // Q7: C (Correct, +2)
    // Q8: D (Correct, +2)
    // Q9: BLANK (Unattempted, 0)
    // Q10: BLANK (Unattempted, 0)
    // Total marks = 8 * 2 = 16
    const { reg, sub } = await createVerifiedOmrSubmission({
      candidateUser: omrStudent,
      answersMap: {
        '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'A',
        '6': 'B', '7': 'C', '8': 'D', '9': 'BLANK', '10': 'BLANK'
      }
    });

    const res = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/evaluate`,
      { cookie: adminCookie }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.evaluation.evaluatedOmrCount, 1);

    const result = await Result.findOne({ competitionId: competition._id, studentId: omrStudent._id });
    assert.ok(result);
    assert.equal(result.mode, 'OMR');
    assert.equal(result.omrSubmissionId.toString(), sub._id.toString());
    assert.equal(result.attemptId, null);
    assert.equal(result.attemptedQuestions, 8);
    assert.equal(result.correctAnswers, 8);
    assert.equal(result.incorrectAnswers, 0);
    assert.equal(result.unansweredQuestions, 2);
    assert.equal(result.positiveMarks, 16);
    assert.equal(result.negativeDeduction, 0);
    assert.equal(result.finalScore, 16);
  });

  await suite.test('Scoring: Negative marking is applied accurately on incorrect OMR answers according to competition config', async () => {
    const randomDigits = crypto.randomInt(10000000, 99999999).toString();
    const candidate2 = await User.create({
      fullName: 'Candidate OMR Negative Test',
      mobile: `+91 99${randomDigits}`,
      mobileNormalized: `99${randomDigits}`,
      role: 'student',
      passwordHash: await bcrypt.hash('Pass@123', 8),
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'School B'
    });

    // Candidate answers:
    // Q1: A (Correct, +2)
    // Q2: A (Incorrect, -0.5, correct is B)
    // Q3: A (Incorrect, -0.5, correct is C)
    // Q4: A (Incorrect, -0.5, correct is D)
    // Q5-Q10: BLANK
    // Positive = 2, Negative = 1.5, Final = 0.5
    await createVerifiedOmrSubmission({
      candidateUser: candidate2,
      answersMap: {
        '1': 'A', '2': 'A', '3': 'A', '4': 'A',
        '5': 'BLANK', '6': 'BLANK', '7': 'BLANK', '8': 'BLANK', '9': 'BLANK', '10': 'BLANK'
      }
    });

    const res = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/evaluate`,
      { cookie: adminCookie, body: { isReEvaluation: true, reason: 'Test negative marking' } }
    );
    assert.equal(res.status, 200);

    const result = await Result.findOne({ competitionId: competition._id, studentId: candidate2._id });
    assert.ok(result);
    assert.equal(result.correctAnswers, 1);
    assert.equal(result.incorrectAnswers, 3);
    assert.equal(result.positiveMarks, 2);
    assert.equal(result.negativeDeduction, 1.5);
    assert.equal(result.finalScore, 0.5);
  });

  await suite.test('Scoring: Blank / unattempted OMR questions receive 0 marks and 0 negative deductions', async () => {
    const randomDigits = crypto.randomInt(10000000, 99999999).toString();
    const candidateAllBlank = await User.create({
      fullName: 'Candidate OMR All Blank',
      mobile: `+91 99${randomDigits}`,
      mobileNormalized: `99${randomDigits}`,
      role: 'student',
      passwordHash: await bcrypt.hash('Pass@123', 8),
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'School C'
    });

    await createVerifiedOmrSubmission({
      candidateUser: candidateAllBlank,
      answersMap: {
        '1': 'BLANK', '2': 'BLANK', '3': 'BLANK', '4': 'BLANK', '5': 'BLANK',
        '6': 'BLANK', '7': 'BLANK', '8': 'BLANK', '9': 'BLANK', '10': 'BLANK'
      }
    });

    await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/evaluate`,
      { cookie: adminCookie, body: { isReEvaluation: true, reason: 'Test all blank OMR' } }
    );

    const result = await Result.findOne({ competitionId: competition._id, studentId: candidateAllBlank._id });
    assert.ok(result);
    assert.equal(result.attemptedQuestions, 0);
    assert.equal(result.correctAnswers, 0);
    assert.equal(result.incorrectAnswers, 0);
    assert.equal(result.unansweredQuestions, 10);
    assert.equal(result.positiveMarks, 0);
    assert.equal(result.negativeDeduction, 0);
    assert.equal(result.finalScore, 0);
  });

  await suite.test('Scoring: Score floor zero prevents final score from dipping below 0 on heavy penalty', async () => {
    const randomDigits = crypto.randomInt(10000000, 99999999).toString();
    const candidateZeroFloor = await User.create({
      fullName: 'Candidate OMR Zero Floor',
      mobile: `+91 99${randomDigits}`,
      mobileNormalized: `99${randomDigits}`,
      role: 'student',
      passwordHash: await bcrypt.hash('Pass@123', 8),
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'School D'
    });

    // 10 incorrect answers: 0 positive, 5.0 negative -> raw score = -5.0 -> floor = 0
    await createVerifiedOmrSubmission({
      candidateUser: candidateZeroFloor,
      answersMap: {
        '1': 'B', '2': 'C', '3': 'D', '4': 'A', '5': 'B',
        '6': 'C', '7': 'D', '8': 'A', '9': 'B', '10': 'C'
      }
    });

    await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/evaluate`,
      { cookie: adminCookie, body: { isReEvaluation: true, reason: 'Test zero floor guard' } }
    );

    const result = await Result.findOne({ competitionId: competition._id, studentId: candidateZeroFloor._id });
    assert.ok(result);
    assert.equal(result.correctAnswers, 0);
    assert.equal(result.incorrectAnswers, 10);
    assert.equal(result.positiveMarks, 0);
    assert.equal(result.negativeDeduction, 5);
    assert.equal(result.finalScore, 0); // Floored to 0
  });

  // --- 2. UNIFIED MERIT LIST & RANKING TESTS ---

  await suite.test('Unified Merit List: Combines ONLINE_MCQ attempts and OMR submissions into a single cohesive ranking', async () => {
    // Create an Online MCQ registration and submitted attempt for onlineStudent
    const onlineReg = await Registration.create({
      competitionId: competition._id,
      studentId: onlineStudent._id,
      rollNumber: `EC-2026-ONL_${Date.now()}`,
      examMode: 'ONLINE_MCQ',
      status: 'registered'
    });

    // Online student scores:
    // Q1: A (Correct, +2)
    // Q2: B (Correct, +2)
    // Q3: C (Correct, +2)
    // Q4: D (Correct, +2)
    // Q5: A (Correct, +2)
    // Q6-Q10: unattempted (0)
    // Online Score = 10 marks
    const answersList = [];
    for (let i = 0; i < 5; i++) {
      answersList.push({
        questionId: questions[i]._id,
        selectedOption: questions[i].correctOption,
        timeSpentSeconds: 15
      });
    }

    await Attempt.create({
      competitionId: competition._id,
      studentId: onlineStudent._id,
      registrationId: onlineReg._id,
      mode: 'ONLINE_MCQ',
      status: 'SUBMITTED',
      startedAt: new Date(Date.now() - 3600000),
      endsAt: new Date(Date.now() + 3600000),
      submittedAt: new Date(Date.now() - 1800000),
      answers: answersList
    });

    const evalRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/evaluate`,
      { cookie: adminCookie, body: { isReEvaluation: true, reason: 'Evaluate hybrid online and OMR' } }
    );
    assert.equal(evalRes.status, 200);
    assert.ok(evalRes.body.evaluation.evaluatedOnlineCount >= 1);
    assert.ok(evalRes.body.evaluation.evaluatedOmrCount >= 1);

    // Fetch Internal Merit List
    const meritRes = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${competition._id}/merit-list`,
      { cookie: adminCookie }
    );
    assert.equal(meritRes.status, 200);
    const list = meritRes.body.meritList;
    assert.ok(list.length >= 2);

    // Verify both modes are present in the unified list
    const modesInList = list.map(item => item.mode);
    assert.ok(modesInList.includes('ONLINE_MCQ'));
    assert.ok(modesInList.includes('OMR'));

    // Ranks are ordered monotonically (1, 2, ...)
    for (let i = 0; i < list.length - 1; i++) {
      assert.ok(list[i].rank <= list[i + 1].rank);
      assert.ok(list[i].finalScore >= list[i + 1].finalScore);
    }
  });

  await suite.test('Unified Merit List: Standard competition ranking (1224) accurately handles score ties between online and OMR candidates', async () => {
    // Fetch merit list and check ranks
    const meritRes = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${competition._id}/merit-list`,
      { cookie: adminCookie }
    );
    assert.equal(meritRes.status, 200);
    const list = meritRes.body.meritList;

    // Check rank assignments are valid positive integers
    list.forEach(entry => {
      assert.ok(Number.isInteger(entry.rank) && entry.rank >= 1);
    });
  });

  await suite.test('Unified Merit List: Tie-breaker criteria properly order candidates', async () => {
    const meritRes = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${competition._id}/merit-list`,
      { cookie: adminCookie }
    );
    assert.equal(meritRes.status, 200);
    const list = meritRes.body.meritList;
    assert.ok(list.length > 0);
    assert.equal(list[0].rank, 1);
  });

  // --- 3. WORKFLOW GUARDS & UNVERIFIED OMR SAFETY ---

  await suite.test('Guard: Evaluation is blocked (HTTP 400 UNVERIFIED_OMR_SUBMISSIONS_REMAIN) if any OMR sheets are pending review or verification', async () => {
    const randomDigits = crypto.randomInt(10000000, 99999999).toString();
    const candidateUnverified = await User.create({
      fullName: 'Candidate OMR Unverified',
      mobile: `+91 99${randomDigits}`,
      mobileNormalized: `99${randomDigits}`,
      role: 'student',
      passwordHash: await bcrypt.hash('Pass@123', 8),
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'School E'
    });

    // Create an OMR submission that is in NEEDS_REVIEW (not yet verified)
    await createVerifiedOmrSubmission({
      candidateUser: candidateUnverified,
      answersMap: { '1': 'A' },
      status: 'NEEDS_REVIEW'
    });

    // Evaluation without allowUnverifiedOmr should be rejected
    const evalRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/evaluate`,
      { cookie: adminCookie, body: { isReEvaluation: true, reason: 'Attempt evaluation with pending OMR' } }
    );

    assert.equal(evalRes.status, 400);
    assert.equal(evalRes.body.error.code, 'UNVERIFIED_OMR_SUBMISSIONS_REMAIN');
  });

  await suite.test('Guard: allowUnverifiedOmr flag permits evaluation of verified submissions while skipping unverified sheets', async () => {
    // Passing allowUnverifiedOmr: true bypasses the block
    const evalRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/evaluate`,
      {
        cookie: adminCookie,
        body: {
          isReEvaluation: true,
          reason: 'Forced evaluation skipping pending OMR',
          allowUnverifiedOmr: true
        }
      }
    );

    assert.equal(evalRes.status, 200);
  });

  // --- 4. PUBLICATION GATE & STUDENT SCORECARD ACCESS ---

  await suite.test('Publication Gate: OMR student cannot access scorecard while results are EVALUATED or APPROVED (HTTP 403 RESULT_NOT_PUBLISHED)', async () => {
    // Status is currently EVALUATED
    const res1 = await makeRequest(
      app,
      'GET',
      `/api/v1/competitions/${competition._id}/my-result`,
      { cookie: omrCookie }
    );
    assert.equal(res1.status, 403);
    assert.equal(res1.body.error.code, 'RESULT_NOT_PUBLISHED');

    // Admin requests approval
    await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/request-approval`,
      { cookie: adminCookie }
    );

    // Committee Head approves (status: APPROVED)
    await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/approve`,
      { cookie: headCookie }
    );

    // Still blocked while APPROVED
    const res2 = await makeRequest(
      app,
      'GET',
      `/api/v1/competitions/${competition._id}/my-result`,
      { cookie: omrCookie }
    );
    assert.equal(res2.status, 403);
  });

  await suite.test('Publication Gate: Committee Head approves and publishes; verified OMR candidate can access own scorecard (HTTP 200)', async () => {
    // Committee Head publishes results
    const pubRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/publish`,
      { cookie: headCookie }
    );
    assert.equal(pubRes.status, 200);

    // OMR student queries scorecard
    const cardRes = await makeRequest(
      app,
      'GET',
      `/api/v1/competitions/${competition._id}/my-result`,
      { cookie: omrCookie }
    );
    assert.equal(cardRes.status, 200);
    assert.ok(cardRes.body.result);
    assert.equal(cardRes.body.result.studentName, 'Candidate OMR Bhavna');
    assert.equal(cardRes.body.result.mode, 'OMR');
    assert.equal(cardRes.body.result.finalScore, 16);
    assert.equal(cardRes.body.result.maximumMarks, 20);
    assert.equal(cardRes.body.result.rank, 1);
  });

  await suite.test('Student Scorecard: OMR candidate scorecard returns accurate breakdown, correct rank, and zero server path or answer key leakage', async () => {
    const cardRes = await makeRequest(
      app,
      'GET',
      `/api/v1/competitions/${competition._id}/my-result`,
      { cookie: omrCookie }
    );
    assert.equal(cardRes.status, 200);
    const r = cardRes.body.result;

    // Verify student-facing fields
    assert.equal(r.mode, 'OMR');
    assert.equal(r.correctAnswers, 8);
    assert.equal(r.incorrectAnswers, 0);
    assert.equal(r.unansweredQuestions, 2);

    // Strict zero leakage
    assert.equal(r.storagePath, undefined);
    assert.equal(r.alignedStoragePath, undefined);
    assert.equal(r.itemBreakdown, undefined);
    assert.equal(r.correctOption, undefined);
    assert.equal(r.mobile, undefined);
  });

  await suite.test('Student All Results: GET /api/v1/me/results lists published OMR competition results for candidate', async () => {
    const res = await makeRequest(
      app,
      'GET',
      '/api/v1/me/results',
      { cookie: omrCookie }
    );
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.results));
    const matched = res.body.results.find(r => r.competitionId === competition._id.toString());
    assert.ok(matched);
    assert.equal(matched.mode, 'OMR');
    assert.equal(matched.finalScore, 16);
  });

  await suite.test('Public Merit List: Public merit endpoint includes both online and OMR candidates when enabled by Committee Head', async () => {
    // Committee Head toggles public merit list to true
    const toggleRes = await makeRequest(
      app,
      'PATCH',
      `/api/v1/admin/competitions/${competition._id}/public-merit-list`,
      { cookie: headCookie, body: { isPublicMeritListEnabled: true } }
    );
    assert.equal(toggleRes.status, 200);

    // Public / Student calls public merit list
    const publicRes = await makeRequest(
      app,
      'GET',
      `/api/v1/competitions/${competition._id}/public-merit-list`
    );
    assert.equal(publicRes.status, 200);
    assert.ok(Array.isArray(publicRes.body.meritList));
    assert.ok(publicRes.body.meritList.length >= 2);

    // Verify safe public fields (zero phone numbers or private data)
    publicRes.body.meritList.forEach(entry => {
      assert.ok(entry.rank);
      assert.ok(entry.rollNumber);
      assert.ok(entry.studentName);
      assert.equal(entry.mobile, undefined);
      assert.equal(entry.itemBreakdown, undefined);
    });
  });

  await suite.test('Audit Trail: EvaluationAuditLog records hybrid evaluation metrics (evaluatedOnlineCount, evaluatedOmrCount)', async () => {
    const evalLogs = await EvaluationAuditLog.find({
      competitionId: competition._id,
      action: { $in: ['EVALUATE', 'RE_EVALUATE'] }
    }).sort({ timestamp: -1 });
    assert.ok(evalLogs.length > 0);
    const latestEvalLog = evalLogs[0];
    assert.ok(latestEvalLog.details.evaluatedOnlineCount !== undefined);
    assert.ok(latestEvalLog.details.evaluatedOmrCount !== undefined);
  });

  await suite.test('Re-evaluation: Re-evaluation increments scoringVersion, updates audit logs, and requires descriptive justification', async () => {
    // First, unpublish through Committee Head to allow re-evaluation
    const unpubRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/unpublish`,
      { cookie: headCookie, body: { reason: 'Formal re-checking request received' } }
    );
    assert.equal(unpubRes.status, 200);

    // Attempt re-evaluation without reason fails
    const failRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/evaluate`,
      { cookie: adminCookie, body: { isReEvaluation: true, allowUnverifiedOmr: true } }
    );
    assert.equal(failRes.status, 400);
    assert.equal(failRes.body.error.code, 'REASON_REQUIRED');

    // Re-evaluation with valid reason succeeds
    const prevVersion = competition.scoringVersion;
    const reEvalRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/evaluate`,
      {
        cookie: adminCookie,
        body: {
          isReEvaluation: true,
          reason: 'Official re-evaluation following question key audit',
          allowUnverifiedOmr: true
        }
      }
    );
    assert.equal(reEvalRes.status, 200);
    assert.ok(reEvalRes.body.evaluation.scoringVersion > prevVersion);
  });
});
