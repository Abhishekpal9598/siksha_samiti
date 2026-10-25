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
import { Result } from '../src/models/result.model.js';
import { EvaluationAuditLog } from '../src/models/evaluationAuditLog.model.js';
import { scoreAnswerSheet, round2 } from '../src/services/scoring.service.js';
import { config } from '../src/config/env.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/education_committee';

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
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return {
      status: response.status,
      headers: response.headers,
      body: json
    };
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
}

test('PHASE 5.1: Security, Scoring Integrity & Data Consistency Audit', async (suite) => {
  let adminCookie;
  let committeeHeadCookie;
  let studentACookie;
  let studentBCookie;

  let adminUser;
  let committeeHeadUser;
  let studentA;
  let studentB;

  let competition;
  let question1;
  let question2;
  let registrationA;
  let registrationB;
  let attemptA;
  let attemptB;

  suite.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect(MONGODB_URI);
    }

    // Clean up test collections
    await User.deleteMany({ mobileNormalized: { $regex: /^9999777/ } });
    await Competition.deleteMany({ title: { $regex: /^Phase5_1Audit_/ } });

    const passwordHash = await bcrypt.hash('Audit51Pass@123', 8);

    // 1. Create Admin
    adminUser = await User.create({
      fullName: 'Standard Admin User',
      mobile: '+91 9999777001',
      mobileNormalized: '9999777001',
      role: 'admin',
      passwordHash,
      isActive: true,
      classOrGrade: 'Exam Superintendent',
      school: 'Admin HQ'
    });

    // 2. Create Committee Head
    committeeHeadUser = await User.create({
      fullName: 'Chief Committee Head',
      mobile: '+91 9999777002',
      mobileNormalized: '9999777002',
      role: 'committee_head',
      passwordHash,
      isActive: true,
      classOrGrade: 'Board President',
      school: 'Education Committee Board'
    });

    // 3. Create Students A and B
    studentA = await User.create({
      fullName: 'Pooja Verma',
      mobile: '+91 9999777003',
      mobileNormalized: '9999777003',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Central High School'
    });

    studentB = await User.create({
      fullName: 'Rohit Kumar',
      mobile: '+91 9999777004',
      mobileNormalized: '9999777004',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Central High School'
    });

    const logUser = async (mobile) => {
      const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
        body: { mobile, password: 'Audit51Pass@123' }
      });
      const cookieHeader = res.headers.get('set-cookie');
      return cookieHeader ? cookieHeader.split(';')[0] : `${config.cookieName}=${res.body.token}`;
    };

    adminCookie = await logUser('9999777001');
    committeeHeadCookie = await logUser('9999777002');
    studentACookie = await logUser('9999777003');
    studentBCookie = await logUser('9999777004');

    // Create Competition
    const now = new Date();
    competition = await Competition.create({
      title: `Phase5_1Audit_Competition_${Date.now()}`,
      examDate: new Date(now.getTime() - 3600000),
      examStartsAt: new Date(now.getTime() - 3600000),
      examEndsAt: new Date(now.getTime() + 3600000),
      registrationOpensAt: new Date(now.getTime() - 86400000),
      registrationClosesAt: new Date(now.getTime() - 7200000),
      durationMinutes: 60,
      mode: 'ONLINE_MCQ',
      status: 'PUBLISHED',
      resultStatus: 'NOT_EVALUATED',
      eligibleClasses: ['Class 10'],
      totalMarks: 10,
      marksPerQuestion: 5,
      negativeMarking: {
        enabled: true,
        perWrongMark: 1.25,
        deduction: 1.25
      },
      tieBreakerRules: ['FINAL_SCORE', 'CORRECT_ANSWERS', 'INCORRECT_ANSWERS', 'SUBMISSION_TIME'],
      isPublicMeritListEnabled: false,
      scoreFloorZero: true
    });

    // Create 2 Questions with trusted answer keys
    question1 = await Question.create({
      competitionId: competition._id,
      order: 1,
      prompt: 'What is the chemical symbol for Gold?',
      options: [
        { key: 'A', text: 'Au' },
        { key: 'B', text: 'Ag' },
        { key: 'C', text: 'Fe' },
        { key: 'D', text: 'Cu' }
      ],
      correctOption: 'A',
      marks: 5,
      negativeMarks: 1.25,
      isActive: true
    });

    question2 = await Question.create({
      competitionId: competition._id,
      order: 2,
      prompt: 'What is the speed of light in vacuum?',
      options: [
        { key: 'A', text: '3x10^8 m/s' },
        { key: 'B', text: '1.5x10^8 m/s' },
        { key: 'C', text: '3x10^6 m/s' },
        { key: 'D', text: 'None of these' }
      ],
      correctOption: 'A',
      marks: 5,
      negativeMarks: 1.25,
      isActive: true
    });

    // Create Registrations
    registrationA = await Registration.create({
      competitionId: competition._id,
      studentId: studentA._id,
      rollNumber: 'AUD51-A-001',
      examMode: 'ONLINE_MCQ',
      status: 'registered'
    });

    registrationB = await Registration.create({
      competitionId: competition._id,
      studentId: studentB._id,
      rollNumber: 'AUD51-B-002',
      examMode: 'ONLINE_MCQ',
      status: 'registered'
    });

    // Create Attempts
    attemptA = await Attempt.create({
      competitionId: competition._id,
      studentId: studentA._id,
      registrationId: registrationA._id,
      mode: 'ONLINE_MCQ',
      status: 'SUBMITTED',
      startedAt: new Date(now.getTime() - 3600000),
      endsAt: new Date(now.getTime() - 1800000),
      submittedAt: new Date(now.getTime() - 2400000),
      timeTakenSeconds: 1200,
      questionSnapshot: [
        {
          questionId: question1._id,
          order: question1.order,
          prompt: question1.prompt,
          options: question1.options,
          marks: 5
        },
        {
          questionId: question2._id,
          order: question2.order,
          prompt: question2.prompt,
          options: question2.options,
          marks: 5
        }
      ],
      answers: [
        { questionId: question1._id, selectedOption: 'A' }, // Correct (+5)
        { questionId: question2._id, selectedOption: 'B' }  // Incorrect (-1.25)
      ]
    });

    attemptB = await Attempt.create({
      competitionId: competition._id,
      studentId: studentB._id,
      registrationId: registrationB._id,
      mode: 'ONLINE_MCQ',
      status: 'SUBMITTED',
      startedAt: new Date(now.getTime() - 3600000),
      endsAt: new Date(now.getTime() - 1800000),
      submittedAt: new Date(now.getTime() - 2100000),
      timeTakenSeconds: 1500,
      questionSnapshot: [
        {
          questionId: question1._id,
          order: question1.order,
          prompt: question1.prompt,
          options: question1.options,
          marks: 5
        },
        {
          questionId: question2._id,
          order: question2.order,
          prompt: question2.prompt,
          options: question2.options,
          marks: 5
        }
      ],
      answers: [
        { questionId: question1._id, selectedOption: 'B' }, // Incorrect (-1.25)
        { questionId: question2._id, selectedOption: 'C' }  // Incorrect (-1.25)
      ]
    });
  });

  suite.after(async () => {
    try {
      await User.deleteMany({ mobileNormalized: { $regex: /^9999777/ } });
      if (competition?._id) {
        await Competition.deleteOne({ _id: competition._id });
        await Question.deleteMany({ competitionId: competition._id });
        await Registration.deleteMany({ competitionId: competition._id });
        await Attempt.deleteMany({ competitionId: competition._id });
        await Result.deleteMany({ competitionId: competition._id });
        await EvaluationAuditLog.deleteMany({ competitionId: competition._id });
      }
    } finally {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    }
  });

  // ==========================================
  // AREA 1: SCORING INTEGRITY & DECIMAL PRECISION
  // ==========================================
  await suite.test('Area 1.1: scoreAnswerSheet accurately calculates fractions and minor units (round2)', () => {
    const questions = [
      {
        _id: question1._id,
        correctOption: 'A',
        marks: 4,
        negativeMarks: 0.33,
        version: 1
      }
    ];

    // Case: Incorrect answer gives -0.33 deduction
    const answers = [{ questionId: question1._id, selectedOption: 'B' }];
    const compConfig = {
      marksPerQuestion: 4,
      negativeMarking: { enabled: true, deduction: 0.33 },
      scoreFloorZero: false
    };

    const evaluated = scoreAnswerSheet({ questions, answers, competitionConfig: compConfig });
    assert.equal(evaluated.correctAnswers, 0);
    assert.equal(evaluated.incorrectAnswers, 1);
    assert.equal(evaluated.positiveMarks, 0);
    assert.equal(evaluated.negativeDeduction, 0.33);
    assert.equal(evaluated.finalScore, -0.33);

    // Case: scoreFloorZero: true clamps negative score to exactly 0
    compConfig.scoreFloorZero = true;
    const evaluatedClamped = scoreAnswerSheet({ questions, answers, competitionConfig: compConfig });
    assert.equal(evaluatedClamped.finalScore, 0);
    assert.equal(evaluatedClamped.negativeDeduction, 0.33);
  });

  await suite.test('Area 1.2: Student cannot inject marks or finalScore during exam operations', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/attempts/${attemptA._id}/submit`, {
      cookie: studentACookie,
      body: {
        finalScore: 100,
        positiveMarks: 100,
        correctAnswers: 50,
        answers: []
      }
    });

    const freshAttempt = await Attempt.findById(attemptA._id);
    assert.equal(freshAttempt.status, 'SUBMITTED');
    assert.equal(freshAttempt.finalScore, undefined);
  });

  // ==========================================
  // AREA 2: COMPETITION & QUESTION IMMUTABILITY POST-APPROVAL
  // ==========================================
  await suite.test('Area 2.1: Admin evaluates attempts producing calculated results', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/evaluate`, {
      cookie: adminCookie
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.evaluation.evaluatedCount, 2);

    const compAfter = await Competition.findById(competition._id);
    assert.equal(compAfter.resultStatus, 'EVALUATED');
  });

  await suite.test('Area 2.2: Committee Head approves results, transitioning status to APPROVED', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/approve`, {
      cookie: committeeHeadCookie,
      body: { notes: 'Results verified and approved by the board' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.resultStatus, 'APPROVED');
  });

  await suite.test('Area 2.3: Modifying competition scoring rules while APPROVED is rejected with HTTP 400', async () => {
    const res = await makeRequest(app, 'PUT', `/api/v1/admin/competitions/${competition._id}`, {
      cookie: adminCookie,
      body: {
        totalMarks: 50,
        marksPerQuestion: 25
      }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'CANNOT_MODIFY_APPROVED_COMPETITION');
  });

  await suite.test('Area 2.4: Non-sensitive competition details CAN still be updated while APPROVED', async () => {
    const res = await makeRequest(app, 'PUT', `/api/v1/admin/competitions/${competition._id}`, {
      cookie: adminCookie,
      body: {
        title: competition.title,
        description: 'Updated harmless notes for approved competition',
        rulesNotes: 'Approved rules'
      }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  await suite.test('Area 2.5: Adding, updating or deleting questions while APPROVED is rejected with HTTP 400', async () => {
    // 1. Create Question -> 400
    const createRes = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/questions`, {
      cookie: adminCookie,
      body: {
        prompt: 'Unauthorized new question?',
        options: [
          { key: 'A', text: 'Yes' },
          { key: 'B', text: 'No' },
          { key: 'C', text: 'Maybe' },
          { key: 'D', text: 'Never' }
        ],
        correctOption: 'A',
        marks: 5
      }
    });
    assert.equal(createRes.status, 400);
    assert.equal(createRes.body.error.code, 'CANNOT_MUTATE_APPROVED_QUESTIONS');

    // 2. Update Question -> 400
    const updateRes = await makeRequest(app, 'PUT', `/api/v1/admin/questions/${question1._id}`, {
      cookie: adminCookie,
      body: {
        prompt: 'Tampered question prompt?'
      }
    });
    assert.equal(updateRes.status, 400);
    assert.equal(updateRes.body.error.code, 'CANNOT_MUTATE_APPROVED_QUESTIONS');

    // 3. Delete Question -> 400
    const deleteRes = await makeRequest(app, 'DELETE', `/api/v1/admin/questions/${question1._id}`, {
      cookie: adminCookie
    });
    assert.equal(deleteRes.status, 400);
    assert.equal(deleteRes.body.error.code, 'CANNOT_MUTATE_APPROVED_QUESTIONS');
  });

  // ==========================================
  // AREA 3: COMMITTEE GOVERNANCE & ACCESS CONTROL
  // ==========================================
  await suite.test('Area 3.1: Standard Admin cannot approve, publish, unpublish or toggle public merit list', async () => {
    // 1. Admin approve -> 403
    const appRes = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/approve`, {
      cookie: adminCookie
    });
    assert.equal(appRes.status, 403);
    assert.equal(appRes.body.error.code, 'FORBIDDEN');

    // 2. Admin publish -> 403
    const pubRes = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/publish`, {
      cookie: adminCookie
    });
    assert.equal(pubRes.status, 403);
    assert.equal(pubRes.body.error.code, 'FORBIDDEN');

    // 3. Admin unpublish -> 403
    const unpubRes = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/unpublish`, {
      cookie: adminCookie
    });
    assert.equal(unpubRes.status, 403);
    assert.equal(unpubRes.body.error.code, 'FORBIDDEN');

    // 4. Admin toggle public merit list -> 403
    const togRes = await makeRequest(app, 'PATCH', `/api/v1/admin/competitions/${competition._id}/public-merit-list`, {
      cookie: adminCookie,
      body: { isPublicMeritListEnabled: true }
    });
    assert.equal(togRes.status, 403);
    assert.equal(togRes.body.error.code, 'FORBIDDEN');
  });

  await suite.test('Area 3.2: Student cannot access internal merit list or trigger evaluation', async () => {
    const meritRes = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${competition._id}/merit-list`, {
      cookie: studentACookie
    });
    assert.equal(meritRes.status, 403);

    const evalRes = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/evaluate`, {
      cookie: studentACookie
    });
    assert.equal(evalRes.status, 403);
  });

  // ==========================================
  // AREA 4: RESULT PRIVACY & ZERO DATA LEAKAGE
  // ==========================================
  await suite.test('Area 4.1: Student cannot access scorecard while resultStatus is APPROVED (not yet PUBLISHED)', async () => {
    const res = await makeRequest(app, 'GET', `/api/v1/competitions/${competition._id}/my-result`, {
      cookie: studentACookie
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'RESULT_NOT_PUBLISHED');
  });

  await suite.test('Area 4.2: Committee Head publishes results, enabling student scorecard access', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/publish`, {
      cookie: committeeHeadCookie,
      body: { isPublicMeritListEnabled: false }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.resultStatus, 'PUBLISHED');
  });

  await suite.test('Area 4.3: Published Student Scorecard contains isPublicMeritListEnabled and no sensitive leaks', async () => {
    const res = await makeRequest(app, 'GET', `/api/v1/competitions/${competition._id}/my-result`, {
      cookie: studentACookie
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const scorecard = res.body.result;
    assert.equal(scorecard.studentName, 'Pooja Verma');
    assert.equal(scorecard.rank, 1);
    assert.equal(scorecard.finalScore, 3.75); // 5 - 1.25 = 3.75
    assert.equal(scorecard.isPublicMeritListEnabled, false); // Phase 5.1 fix verified!

    // Verify zero sensitive data leakage
    assert.equal(scorecard.passwordHash, undefined);
    assert.equal(scorecard.itemBreakdown, undefined);
    assert.equal(scorecard.questions, undefined);
    assert.equal(scorecard.correctOption, undefined);
    assert.equal(scorecard.explanation, undefined);
  });

  await suite.test('Area 4.4: Public merit list is blocked with HTTP 403 when disabled', async () => {
    const res = await makeRequest(app, 'GET', `/api/v1/competitions/${competition._id}/public-merit-list`);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'MERIT_LIST_NOT_PUBLIC');
  });

  await suite.test('Area 4.5: Committee Head toggles public merit list to true; public access is granted safely', async () => {
    const togRes = await makeRequest(app, 'PATCH', `/api/v1/admin/competitions/${competition._id}/public-merit-list`, {
      cookie: committeeHeadCookie,
      body: { isPublicMeritListEnabled: true }
    });
    assert.equal(togRes.status, 200);
    assert.equal(togRes.body.isPublicMeritListEnabled, true);

    // Public request now succeeds
    const pubRes = await makeRequest(app, 'GET', `/api/v1/competitions/${competition._id}/public-merit-list`);
    assert.equal(pubRes.status, 200);
    assert.equal(pubRes.body.success, true);
    assert.equal(pubRes.body.meritList.length, 2);

    const firstEntry = pubRes.body.meritList[0];
    assert.equal(firstEntry.rank, 1);
    assert.equal(firstEntry.studentName, 'Pooja Verma');
    assert.equal(firstEntry.finalScore, 3.75);
    // Ensure no phone numbers or credentials are leaked
    assert.equal(firstEntry.mobile, undefined);
    assert.equal(firstEntry.mobileNormalized, undefined);
    assert.equal(firstEntry.passwordHash, undefined);

    // Student scorecard now reflects isPublicMeritListEnabled = true
    const cardRes = await makeRequest(app, 'GET', `/api/v1/competitions/${competition._id}/my-result`, {
      cookie: studentACookie
    });
    assert.equal(cardRes.body.result.isPublicMeritListEnabled, true);
  });

  // ==========================================
  // AREA 5: CONCURRENCY & RE-EVALUATION AUDIT TRAIL
  // ==========================================
  await suite.test('Area 5.1: Concurrent evaluation calls do not duplicate Result records', async () => {
    // 1. Committee Head unpublishes for controlled re-evaluation revision
    const unpubRes = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/unpublish`, {
      cookie: committeeHeadCookie,
      body: { reason: 'Unpublishing for concurrency evaluation testing' }
    });
    assert.equal(unpubRes.status, 200);

    // 2. Perform concurrent re-evaluation requests
    const [res1, res2] = await Promise.all([
      makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/evaluate`, {
        cookie: adminCookie,
        body: { isReEvaluation: true, reason: 'Concurrency stress test 1' }
      }),
      makeRequest(app, 'POST', `/api/v1/admin/competitions/${competition._id}/evaluate`, {
        cookie: adminCookie,
        body: { isReEvaluation: true, reason: 'Concurrency stress test 2' }
      })
    ]);

    assert.ok(res1.status === 200 || res2.status === 200);

    // Verify exact number of Result records remains 2 (one per student)
    const resultCount = await Result.countDocuments({ competitionId: competition._id });
    assert.equal(resultCount, 2);
  });

  await suite.test('Area 5.2: Audit log records actor, action, timestamp and reason for all governance events', async () => {
    const logs = await EvaluationAuditLog.find({ competitionId: competition._id }).sort({ createdAt: 1 });
    assert.ok(logs.length >= 3, 'Must have at least 3 audit log records');

    const actions = logs.map((l) => l.action);
    assert.ok(actions.includes('EVALUATE'));
    assert.ok(actions.includes('APPROVE'));
    assert.ok(actions.includes('PUBLISH'));
    assert.ok(actions.includes('TOGGLE_PUBLIC_MERIT_LIST'));

    for (const log of logs) {
      assert.ok(log.actorId, 'Audit log must record actorId');
      assert.ok(log.actorRole, 'Audit log must record actorRole');
      assert.ok(log.createdAt, 'Audit log must record timestamp');
    }
  });
});
