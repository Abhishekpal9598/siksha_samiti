import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
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
import { scoreAnswerSheet, assignStandardRanks, compareResults, round2 } from '../src/services/scoring.service.js';
import { sweepExpiredAttempts } from '../src/services/examSweeper.service.js';

import { connectDB, disconnectDB } from '../src/config/database.js';

// Helper for making HTTP requests to ephemeral server
async function makeRequest(app, method, path, headers = {}, body = null) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    return await new Promise((resolve, reject) => {
      const parsedUrl = new URL(`http://localhost:${port}${path}`);
      const reqHeaders = { ...headers };

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
        if (!reqHeaders['X-Requested-With']) {
          reqHeaders['X-Requested-With'] = 'XMLHttpRequest';
        }
      }

      let payload = null;
      if (body) {
        payload = JSON.stringify(body);
        reqHeaders['Content-Type'] = 'application/json';
        reqHeaders['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          method,
          headers: reqHeaders
        },
        (res) => {
          let rawData = '';
          res.on('data', (chunk) => {
            rawData += chunk;
          });
          res.on('end', () => {
            let data = null;
            try {
              data = JSON.parse(rawData);
            } catch {
              data = rawData;
            }
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data,
              cookies: res.headers['set-cookie']
            });
          });
        }
      );

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  } finally {
    server.close();
  }
}

test('PHASE 5: Central Scoring Engine, Negative Marking, Tie-Breaking, Committee Approval & Merit List', async (suite) => {
  let adminUser = null;
  let committeeHeadUser = null;
  let studentA = null;
  let studentB = null;
  let studentC = null;

  let adminCookie = null;
  let committeeHeadCookie = null;
  let studentACookie = null;
  let studentBCookie = null;
  let studentCCookie = null;

  let competition = null;
  let questions = [];

  suite.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await connectDB();
    }

    // Clean up test collections
    await User.deleteMany({ mobileNormalized: { $regex: /^9999888/ } });
    await Competition.deleteMany({ title: { $regex: /^Phase5Test_/ } });

    const passwordHash = await bcrypt.hash('Phase5Pass@123', 10);

    // 1. Admin User
    adminUser = await User.create({
      fullName: 'Phase 5 Test Admin',
      mobile: '+91 9999888001',
      mobileNormalized: '9999888001',
      role: 'admin',
      passwordHash,
      isActive: true,
      school: 'Admin HQ',
      classOrGrade: 'Admin Office'
    });

    // 2. Committee Head User
    committeeHeadUser = await User.create({
      fullName: 'Dr. Committee Head',
      mobile: '+91 9999888002',
      mobileNormalized: '9999888002',
      role: 'committee_head',
      passwordHash,
      isActive: true,
      school: 'Education Committee Board',
      classOrGrade: 'Chairperson'
    });

    // 3. Students A, B, C
    studentA = await User.create({
      fullName: 'Aarav Sharma',
      mobile: '+91 9999888003',
      mobileNormalized: '9999888003',
      role: 'student',
      passwordHash,
      isActive: true,
      school: 'Model School Delhi',
      classOrGrade: 'Class 10'
    });

    studentB = await User.create({
      fullName: 'Bhavna Patel',
      mobile: '+91 9999888004',
      mobileNormalized: '9999888004',
      role: 'student',
      passwordHash,
      isActive: true,
      school: 'Saraswati Vidya Mandir',
      classOrGrade: 'Class 10'
    });

    studentC = await User.create({
      fullName: 'Chirag Gupta',
      mobile: '+91 9999888005',
      mobileNormalized: '9999888005',
      role: 'student',
      passwordHash,
      isActive: true,
      school: 'Public High School',
      classOrGrade: 'Class 10'
    });

    // Authenticate all users to obtain session cookies
    const login = async (mobile, pass) => {
      const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {}, {
        mobile,
        password: pass
      });
      return res.cookies ? res.cookies[0].split(';')[0] : null;
    };

    adminCookie = await login('9999888001', 'Phase5Pass@123');
    committeeHeadCookie = await login('9999888002', 'Phase5Pass@123');
    studentACookie = await login('9999888003', 'Phase5Pass@123');
    studentBCookie = await login('9999888004', 'Phase5Pass@123');
    studentCCookie = await login('9999888005', 'Phase5Pass@123');

    // Create Competition
    const now = new Date();
    competition = await Competition.create({
      title: `Phase5Test_Competition_${Date.now()}`,
      examDate: new Date(now.getTime() - 3600000), // Exam started 1 hour ago
      examStartsAt: new Date(now.getTime() - 3600000),
      examEndsAt: new Date(now.getTime() + 3600000),
      registrationOpensAt: new Date(now.getTime() - 86400000),
      registrationClosesAt: new Date(now.getTime() - 7200000),
      durationMinutes: 60,
      mode: 'ONLINE_MCQ',
      status: 'PUBLISHED',
      resultStatus: 'NOT_EVALUATED',
      eligibleClasses: ['Class 10'],
      totalMarks: 30,
      marksPerQuestion: 10,
      negativeMarking: {
        enabled: true,
        perWrongMark: 2.5,
        deduction: 2.5
      },
      tieBreakerRules: ['FINAL_SCORE', 'CORRECT_ANSWERS', 'INCORRECT_ANSWERS', 'SUBMISSION_TIME'],
      isPublicMeritListEnabled: false,
      scoreFloorZero: true
    });

    // Create 3 Questions with trusted answer keys
    questions = await Question.create([
      {
        competitionId: competition._id,
        order: 1,
        prompt: 'What is the speed of light?',
        options: [
          { key: 'A', text: '3x10^8 m/s' },
          { key: 'B', text: '1.5x10^8 m/s' },
          { key: 'C', text: '3x10^6 m/s' },
          { key: 'D', text: 'Zero' }
        ],
        correctOption: 'A',
        marks: 10,
        negativeMarks: 2.5,
        isActive: true
      },
      {
        competitionId: competition._id,
        order: 2,
        prompt: 'Which gas is most abundant in Earth atmosphere?',
        options: [
          { key: 'A', text: 'Oxygen' },
          { key: 'B', text: 'Nitrogen' },
          { key: 'C', text: 'Carbon Dioxide' },
          { key: 'D', text: 'Argon' }
        ],
        correctOption: 'B',
        marks: 10,
        negativeMarks: 2.5,
        isActive: true
      },
      {
        competitionId: competition._id,
        order: 3,
        prompt: 'What is the chemical symbol for Gold?',
        options: [
          { key: 'A', text: 'Ag' },
          { key: 'B', text: 'Fe' },
          { key: 'C', text: 'Au' },
          { key: 'D', text: 'Cu' }
        ],
        correctOption: 'C',
        marks: 10,
        negativeMarks: 2.5,
        isActive: true
      }
    ]);

    // Create Registrations
    const regA = await Registration.create({
      competitionId: competition._id,
      studentId: studentA._id,
      rollNumber: 'EC-2026-5001',
      examMode: 'ONLINE_MCQ',
      status: 'registered'
    });
    const regB = await Registration.create({
      competitionId: competition._id,
      studentId: studentB._id,
      rollNumber: 'EC-2026-5002',
      examMode: 'ONLINE_MCQ',
      status: 'registered'
    });
    const regC = await Registration.create({
      competitionId: competition._id,
      studentId: studentC._id,
      rollNumber: 'EC-2026-5003',
      examMode: 'ONLINE_MCQ',
      status: 'registered'
    });

    // Create Submitted Exam Attempts
    // Student A: 3 attempted (Q1: Correct 'A', Q2: Correct 'B', Q3: Wrong 'A') -> 2 Correct, 1 Wrong -> Marks: 20 - 2.5 = 17.5
    await Attempt.create({
      competitionId: competition._id,
      studentId: studentA._id,
      registrationId: regA._id,
      mode: 'ONLINE_MCQ',
      status: 'SUBMITTED',
      startedAt: new Date(now.getTime() - 3000000),
      endsAt: new Date(now.getTime() + 600000),
      submittedAt: new Date(now.getTime() - 1000000),
      questionSnapshot: questions.map((q) => ({
        questionId: q._id,
        order: q.order,
        prompt: q.prompt,
        options: q.options,
        marks: q.marks
      })),
      answers: [
        { questionId: questions[0]._id, selectedOption: 'A' },
        { questionId: questions[1]._id, selectedOption: 'B' },
        { questionId: questions[2]._id, selectedOption: 'A' } // Wrong (Correct is C)
      ]
    });

    // Student B: 2 attempted, 1 unanswered (Q1: Correct 'A', Q2: Wrong 'C', Q3: null) -> 1 Correct, 1 Wrong, 1 Unanswered -> Marks: 10 - 2.5 = 7.5
    await Attempt.create({
      competitionId: competition._id,
      studentId: studentB._id,
      registrationId: regB._id,
      mode: 'ONLINE_MCQ',
      status: 'SUBMITTED',
      startedAt: new Date(now.getTime() - 2500000),
      endsAt: new Date(now.getTime() + 600000),
      submittedAt: new Date(now.getTime() - 800000),
      questionSnapshot: questions.map((q) => ({
        questionId: q._id,
        order: q.order,
        prompt: q.prompt,
        options: q.options,
        marks: q.marks
      })),
      answers: [
        { questionId: questions[0]._id, selectedOption: 'A' },
        { questionId: questions[1]._id, selectedOption: 'C' } // Wrong (Correct is B)
        // Q3 Unanswered
      ]
    });

    // Student C: 1 attempted, 2 unanswered (Q1: Correct 'A', Q2: null, Q3: null) -> 1 Correct, 0 Wrong, 2 Unanswered -> Marks: 10 - 0 = 10.0
    await Attempt.create({
      competitionId: competition._id,
      studentId: studentC._id,
      registrationId: regC._id,
      mode: 'ONLINE_MCQ',
      status: 'AUTO_SUBMITTED',
      startedAt: new Date(now.getTime() - 2000000),
      endsAt: new Date(now.getTime() - 100000),
      submittedAt: new Date(now.getTime() - 100000),
      questionSnapshot: questions.map((q) => ({
        questionId: q._id,
        order: q.order,
        prompt: q.prompt,
        options: q.options,
        marks: q.marks
      })),
      answers: [
        { questionId: questions[0]._id, selectedOption: 'A' }
      ]
    });
  });

  suite.after(async () => {
    if (competition) {
      await Competition.deleteOne({ _id: competition._id });
      await Question.deleteMany({ competitionId: competition._id });
      await Registration.deleteMany({ competitionId: competition._id });
      await Attempt.deleteMany({ competitionId: competition._id });
      await Result.deleteMany({ competitionId: competition._id });
      await EvaluationAuditLog.deleteMany({ competitionId: competition._id });
    }
    await User.deleteMany({ mobileNormalized: { $regex: /^9999888/ } });
    if (mongoose.connection.readyState === 1) {
      await disconnectDB();
    }
  });

  // 1. Correct answer scoring
  await suite.test('1. Correct answer scoring awards full marks accurately', async () => {
    const scored = scoreAnswerSheet({
      questions: [
        { _id: 'q1', correctOption: 'A', marks: 5 }
      ],
      answers: [{ questionId: 'q1', selectedOption: 'A' }],
      competitionConfig: { marksPerQuestion: 5 }
    });
    assert.strictEqual(scored.correctAnswers, 1);
    assert.strictEqual(scored.positiveMarks, 5);
    assert.strictEqual(scored.negativeDeduction, 0);
    assert.strictEqual(scored.finalScore, 5);
  });

  // 2. Incorrect answer scoring
  await suite.test('2. Incorrect answer scoring applies penalty accurately', async () => {
    const scored = scoreAnswerSheet({
      questions: [
        { _id: 'q1', correctOption: 'A', marks: 10, negativeMarks: 2.5 }
      ],
      answers: [{ questionId: 'q1', selectedOption: 'B' }],
      competitionConfig: {
        marksPerQuestion: 10,
        negativeMarking: { enabled: true, deduction: 2.5 },
        scoreFloorZero: false
      }
    });
    assert.strictEqual(scored.incorrectAnswers, 1);
    assert.strictEqual(scored.positiveMarks, 0);
    assert.strictEqual(scored.negativeDeduction, 2.5);
    assert.strictEqual(scored.finalScore, -2.5);
  });

  // 3. Unanswered question scoring
  await suite.test('3. Unanswered question awards 0 marks and 0 penalty', async () => {
    const scored = scoreAnswerSheet({
      questions: [
        { _id: 'q1', correctOption: 'A', marks: 10, negativeMarks: 2.5 }
      ],
      answers: [],
      competitionConfig: {
        negativeMarking: { enabled: true, deduction: 2.5 }
      }
    });
    assert.strictEqual(scored.unansweredQuestions, 1);
    assert.strictEqual(scored.attemptedQuestions, 0);
    assert.strictEqual(scored.positiveMarks, 0);
    assert.strictEqual(scored.negativeDeduction, 0);
    assert.strictEqual(scored.finalScore, 0);
  });

  // 4. Negative marking enabled
  await suite.test('4. Negative marking enabled applies configured deduction for wrong answers', async () => {
    const scored = scoreAnswerSheet({
      questions: [
        { _id: 'q1', correctOption: 'A', marks: 4 },
        { _id: 'q2', correctOption: 'B', marks: 4 }
      ],
      answers: [
        { questionId: 'q1', selectedOption: 'A' },
        { questionId: 'q2', selectedOption: 'C' }
      ],
      competitionConfig: {
        marksPerQuestion: 4,
        negativeMarking: { enabled: true, deduction: 1 }
      }
    });
    assert.strictEqual(scored.positiveMarks, 4);
    assert.strictEqual(scored.negativeDeduction, 1);
    assert.strictEqual(scored.finalScore, 3);
  });

  // 5. Negative marking disabled
  await suite.test('5. Negative marking disabled ignores negative deductions completely', async () => {
    const scored = scoreAnswerSheet({
      questions: [
        { _id: 'q1', correctOption: 'A', marks: 4, negativeMarks: 2 }
      ],
      answers: [{ questionId: 'q1', selectedOption: 'B' }],
      competitionConfig: {
        negativeMarking: { enabled: false, deduction: 2 }
      }
    });
    assert.strictEqual(scored.incorrectAnswers, 1);
    assert.strictEqual(scored.negativeDeduction, 0);
    assert.strictEqual(scored.finalScore, 0);
  });

  // 6. Precedence rules: Question-level vs Competition-level
  await suite.test('6. Question-level marks and negative deductions take precedence', async () => {
    const scored = scoreAnswerSheet({
      questions: [
        { _id: 'q1', correctOption: 'A', marks: 15, negativeMarks: 5 } // Question level overrides comp defaults (10 and 1)
      ],
      answers: [{ questionId: 'q1', selectedOption: 'D' }],
      competitionConfig: {
        marksPerQuestion: 10,
        negativeMarking: { enabled: true, deduction: 1 },
        scoreFloorZero: false
      }
    });
    assert.strictEqual(scored.negativeDeduction, 5); // Used 5 from question, not 1 from comp
  });

  // 7. Score floor
  await suite.test('7. Score floor clamps negative score to zero by default', async () => {
    const scored = scoreAnswerSheet({
      questions: [
        { _id: 'q1', correctOption: 'A', marks: 1, negativeMarks: 5 }
      ],
      answers: [{ questionId: 'q1', selectedOption: 'D' }],
      competitionConfig: {
        negativeMarking: { enabled: true, deduction: 5 },
        scoreFloorZero: true
      }
    });
    assert.strictEqual(scored.positiveMarks, 0);
    assert.strictEqual(scored.negativeDeduction, 5);
    assert.strictEqual(scored.finalScore, 0); // Clamped to zero
  });

  // 8. Decimal precision & rounding
  await suite.test('8. Decimal math avoids floating-point anomalies (round2 precision)', async () => {
    const scored = scoreAnswerSheet({
      questions: [
        { _id: 'q1', correctOption: 'A', marks: 1, negativeMarks: 0.33 },
        { _id: 'q2', correctOption: 'B', marks: 1, negativeMarks: 0.33 },
        { _id: 'q3', correctOption: 'C', marks: 1, negativeMarks: 0.33 }
      ],
      answers: [
        { questionId: 'q1', selectedOption: 'A' }, // +1
        { questionId: 'q2', selectedOption: 'A' }, // -0.33
        { questionId: 'q3', selectedOption: 'A' }  // -0.33
      ],
      competitionConfig: {
        negativeMarking: { enabled: true }
      }
    });
    assert.strictEqual(scored.positiveMarks, 1.0);
    assert.strictEqual(scored.negativeDeduction, 0.66);
    assert.strictEqual(scored.finalScore, 0.34);
  });

  // 9. Central Evaluation Trigger & Duplicate evaluation prevention
  await suite.test('9. Admin triggers evaluation successfully & duplicate without reason is rejected', async () => {
    // 1. Initial Evaluation
    const evalRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/evaluate`,
      { Cookie: adminCookie },
      { reason: 'Initial competition evaluation' }
    );
    assert.strictEqual(evalRes.status, 200);
    assert.strictEqual(evalRes.body.success, true);
    assert.strictEqual(evalRes.body.evaluation.evaluatedCount, 3);
    assert.strictEqual(evalRes.body.evaluation.resultStatus, 'EVALUATED');

    // 2. Duplicate Evaluation Attempt without re-evaluation flag/reason
    const dupRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/evaluate`,
      { Cookie: adminCookie },
      {}
    );
    assert.strictEqual(dupRes.status, 400);
    assert.strictEqual(dupRes.body.error.code, 'ALREADY_EVALUATED');
  });

  // 10. Unauthorized evaluation rejection
  await suite.test('10. Students cannot trigger scoring evaluation (HTTP 403 Forbidden)', async () => {
    const res = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/evaluate`,
      { Cookie: studentACookie },
      { reason: 'Student trying to evaluate' }
    );
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'FORBIDDEN');
  });

  // 11. Tie-breaking at every configured criterion
  await suite.test('11. Tie-breaking logic respects criteria ordering correctly', async () => {
    const candA = { finalScore: 20, correctAnswers: 2, incorrectAnswers: 0, submittedAt: '2026-10-20T10:00:00Z' };
    const candB = { finalScore: 20, correctAnswers: 3, incorrectAnswers: 2, submittedAt: '2026-10-20T10:05:00Z' };

    // 1. Tie-breaker by SCORE then CORRECT_ANSWERS: candB ranks ahead (3 correct vs 2 correct)
    const cmp1 = compareResults(candA, candB, ['FINAL_SCORE', 'CORRECT_ANSWERS']);
    assert.ok(cmp1 > 0, 'candB should win due to higher correct answers');

    // 2. Tie-breaker by SCORE then INCORRECT_ANSWERS: candA ranks ahead (0 incorrect vs 2 incorrect)
    const cmp2 = compareResults(candA, candB, ['FINAL_SCORE', 'INCORRECT_ANSWERS']);
    assert.ok(cmp2 < 0, 'candA should win due to fewer incorrect answers');

    // 3. Tie-breaker by SUBMISSION_TIME: candA ranks ahead (earlier submission)
    const cmp3 = compareResults(candA, candB, ['FINAL_SCORE', 'SUBMISSION_TIME']);
    assert.ok(cmp3 < 0, 'candA should win due to earlier submission time');
  });

  // 12. Equal rank assignment (standard competition ranking: 1, 1, 3)
  await suite.test('12. Equal results after all criteria receive identical standard competition ranks', async () => {
    const list = [
      { id: 1, finalScore: 25, correctAnswers: 3, incorrectAnswers: 0, submittedAt: '2026-10-20T10:00:00Z' },
      { id: 2, finalScore: 25, correctAnswers: 3, incorrectAnswers: 0, submittedAt: '2026-10-20T10:00:00Z' }, // Exactly tied with id 1
      { id: 3, finalScore: 20, correctAnswers: 2, incorrectAnswers: 0, submittedAt: '2026-10-20T10:00:00Z' }
    ];

    assignStandardRanks(list, ['FINAL_SCORE', 'CORRECT_ANSWERS', 'INCORRECT_ANSWERS', 'SUBMISSION_TIME']);
    assert.strictEqual(list[0].rank, 1);
    assert.strictEqual(list[1].rank, 1);
    assert.strictEqual(list[2].rank, 3); // Standard competition ranking: 1, 1, 3
  });

  // 13. Unpublished merit list privacy
  await suite.test('13. Unpublished internal merit list is visible to Admin/Head but forbidden to Student', async () => {
    // Admin request -> 200 OK
    const adminRes = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${competition._id}/merit-list`,
      { Cookie: adminCookie }
    );
    assert.strictEqual(adminRes.status, 200);
    assert.strictEqual(adminRes.body.meritList.length, 3);

    // Student request -> 403 Forbidden
    const studentRes = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${competition._id}/merit-list`,
      { Cookie: studentACookie }
    );
    assert.strictEqual(studentRes.status, 403);
  });

  // 14. Admin cannot approve or publish without Committee Head authorization
  await suite.test('14. Admin role is rejected when attempting Committee Head approval/publication', async () => {
    // Admin attempting approve -> 403
    const approveRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/approve`,
      { Cookie: adminCookie },
      {}
    );
    assert.strictEqual(approveRes.status, 403);
    assert.strictEqual(approveRes.body.error.code, 'FORBIDDEN');

    // Admin attempting publish -> 403
    const pubRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/publish`,
      { Cookie: adminCookie },
      {}
    );
    assert.strictEqual(pubRes.status, 403);
    assert.strictEqual(pubRes.body.error.code, 'FORBIDDEN');
  });

  // 15. Publication requires prior approval gate
  await suite.test('15. Publishing before approval is strictly rejected (HTTP 400)', async () => {
    // Move to PENDING_APPROVAL
    await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/request-approval`,
      { Cookie: adminCookie }
    );

    // Committee Head tries to publish without approving first -> 400
    const pubRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/publish`,
      { Cookie: committeeHeadCookie },
      {}
    );
    assert.strictEqual(pubRes.status, 400);
    assert.strictEqual(pubRes.body.error.code, 'CANNOT_PUBLISH_UNAPPROVED');
  });

  // 16. Committee Head Approval
  await suite.test('16. Committee Head formally approves the evaluated results', async () => {
    const res = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/approve`,
      { Cookie: committeeHeadCookie },
      { reason: 'All 3 candidate scores and tie-breaking verified' }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.resultStatus, 'APPROVED');

    const updatedComp = await Competition.findById(competition._id);
    assert.strictEqual(updatedComp.resultStatus, 'APPROVED');
    assert.ok(updatedComp.approvedAt);
  });

  // 17. Students cannot see unpublished scores
  await suite.test('17. Students cannot access scorecards while status is APPROVED but unpublished', async () => {
    const res = await makeRequest(
      app,
      'GET',
      `/api/v1/competitions/${competition._id}/my-result`,
      { Cookie: studentACookie }
    );
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'RESULT_NOT_PUBLISHED');
  });

  // 18. Committee Head Publishes Results & Student views own private scorecard
  await suite.test('18. Committee Head publishes results and Student sees only their own scorecard', async () => {
    // 1. Committee Head publishes
    const pubRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/publish`,
      { Cookie: committeeHeadCookie },
      { isPublicMeritListEnabled: false }
    );
    assert.strictEqual(pubRes.status, 200);
    assert.strictEqual(pubRes.body.resultStatus, 'PUBLISHED');

    // 2. Student A accesses own scorecard
    const myResultA = await makeRequest(
      app,
      'GET',
      `/api/v1/competitions/${competition._id}/my-result`,
      { Cookie: studentACookie }
    );
    assert.strictEqual(myResultA.status, 200);
    assert.strictEqual(myResultA.body.result.studentName, 'Aarav Sharma');
    assert.strictEqual(myResultA.body.result.finalScore, 17.5);
    assert.strictEqual(myResultA.body.result.rank, 1);
    assert.strictEqual(myResultA.body.result.correctAnswers, 2);
    assert.strictEqual(myResultA.body.result.incorrectAnswers, 1);
    // CRITICAL: Item breakdown and correct answers are NEVER leaked to student
    assert.strictEqual(myResultA.body.result.itemBreakdown, undefined);

    // 3. Student B accesses own scorecard
    const myResultB = await makeRequest(
      app,
      'GET',
      `/api/v1/competitions/${competition._id}/my-result`,
      { Cookie: studentBCookie }
    );
    assert.strictEqual(myResultB.status, 200);
    assert.strictEqual(myResultB.body.result.studentName, 'Bhavna Patel');
    assert.strictEqual(myResultB.body.result.finalScore, 7.5);
    assert.strictEqual(myResultB.body.result.rank, 3);
  });

  // 19. Public merit list disabled by default
  await suite.test('19. Public merit list is disabled by default (HTTP 403)', async () => {
    const res = await makeRequest(
      app,
      'GET',
      `/api/v1/competitions/${competition._id}/public-merit-list`
    );
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'MERIT_LIST_NOT_PUBLIC');
  });

  // 20. Public merit list enabled exposes only approved public fields
  await suite.test('20. Enabled public merit list exposes ONLY approved public fields', async () => {
    // Committee Head enables public merit list
    const toggleRes = await makeRequest(
      app,
      'PATCH',
      `/api/v1/admin/competitions/${competition._id}/public-merit-list`,
      { Cookie: committeeHeadCookie },
      { isPublicMeritListEnabled: true }
    );
    assert.strictEqual(toggleRes.status, 200);

    // Public / Anonymous user accesses public merit list
    const publicRes = await makeRequest(
      app,
      'GET',
      `/api/v1/competitions/${competition._id}/public-merit-list`
    );
    assert.strictEqual(publicRes.status, 200);
    assert.strictEqual(publicRes.body.meritList.length, 3);

    const firstEntry = publicRes.body.meritList[0];
    assert.strictEqual(firstEntry.rank, 1);
    assert.strictEqual(firstEntry.rollNumber, 'EC-2026-5001');
    assert.strictEqual(firstEntry.studentName, 'Aarav Sharma');
    assert.strictEqual(firstEntry.school, 'Model School Delhi');
    assert.strictEqual(firstEntry.finalScore, 17.5);
    assert.strictEqual(firstEntry.maximumMarks, 30);

    // Strict privacy checks: zero confidential fields
    assert.strictEqual(firstEntry.mobile, undefined);
    assert.strictEqual(firstEntry.mobileNormalized, undefined);
    assert.strictEqual(firstEntry.passwordHash, undefined);
    assert.strictEqual(firstEntry.itemBreakdown, undefined);
    assert.strictEqual(firstEntry.answers, undefined);
  });

  // 21. Re-evaluation requires reason & logs audit trail
  await suite.test('21. Re-evaluation requires reason and creates persistent audit trail', async () => {
    // Must unpublish/recall first before re-evaluation
    const unpubRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/unpublish`,
      { Cookie: committeeHeadCookie },
      { reason: 'Candidate disputed Question 3 key' }
    );
    assert.strictEqual(unpubRes.status, 200);
    assert.strictEqual(unpubRes.body.resultStatus, 'REVISION_REQUIRED');

    // Trigger re-evaluation with reason
    const reEvalRes = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/evaluate`,
      { Cookie: adminCookie },
      { isReEvaluation: true, reason: 'Re-evaluating after question review' }
    );
    assert.strictEqual(reEvalRes.status, 200);

    // Check audit logs
    const auditLogs = await EvaluationAuditLog.find({ competitionId: competition._id }).sort({ timestamp: -1 });
    assert.ok(auditLogs.length >= 4);
    const latestLog = auditLogs[0];
    assert.strictEqual(latestLog.action, 'RE_EVALUATE');
    assert.strictEqual(latestLog.reason, 'Re-evaluating after question review');
  });

  // 22. Published result correction requires re-approval before publishing again
  await suite.test('22. Published result correction enforces re-approval workflow', async () => {
    // After re-evaluation, status is EVALUATED
    const comp = await Competition.findById(competition._id);
    assert.strictEqual(comp.resultStatus, 'EVALUATED');

    // Cannot publish directly from EVALUATED
    const pubFail = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/publish`,
      { Cookie: committeeHeadCookie },
      {}
    );
    assert.strictEqual(pubFail.status, 400);

    // Request Approval
    await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/request-approval`,
      { Cookie: adminCookie }
    );

    // Head Approves
    await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/approve`,
      { Cookie: committeeHeadCookie },
      { reason: 'Approved revised evaluation' }
    );

    // Head Publishes again
    const pubSuccess = await makeRequest(
      app,
      'POST',
      `/api/v1/admin/competitions/${competition._id}/publish`,
      { Cookie: committeeHeadCookie },
      { isPublicMeritListEnabled: true }
    );
    assert.strictEqual(pubSuccess.status, 200);
    assert.strictEqual(pubSuccess.body.resultStatus, 'PUBLISHED');
  });

  // 23. Server restart / Sweeper reconciliation of expired attempts
  await suite.test('23. Startup reconciliation automatically finalizes expired IN_PROGRESS attempts', async () => {
    // Create an expired IN_PROGRESS attempt
    const expiredAttempt = await Attempt.create({
      competitionId: competition._id,
      studentId: new mongoose.Types.ObjectId(),
      registrationId: new mongoose.Types.ObjectId(),
      mode: 'ONLINE_MCQ',
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 7200000),
      endsAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
      questionSnapshot: []
    });

    // Run reconciliation sweeper
    const sweptCount = await sweepExpiredAttempts();
    assert.ok(sweptCount >= 1, 'Expired attempt should be swept and auto-submitted');

    const updated = await Attempt.findById(expiredAttempt._id);
    assert.strictEqual(updated.status, 'AUTO_SUBMITTED');

    // Cleanup temporary attempt
    await Attempt.deleteOne({ _id: expiredAttempt._id });
  });

  // 24. Future OMR answer set scoring pipeline interface compatibility
  await suite.test('24. OMR response pipeline interface scores offline sheets identically and purely', async () => {
    // Mock OMR extracted responses
    const omrExtractedAnswers = [
      { questionId: 'omr_q1', selectedOption: 'B' },
      { questionId: 'omr_q2', selectedOption: 'D' },
      { questionId: 'omr_q3', selectedOption: null } // OMR bubble not filled
    ];

    const omrQuestionKey = [
      { _id: 'omr_q1', correctOption: 'B', marks: 2, negativeMarks: 0.5 },
      { _id: 'omr_q2', correctOption: 'C', marks: 2, negativeMarks: 0.5 },
      { _id: 'omr_q3', correctOption: 'A', marks: 2, negativeMarks: 0.5 }
    ];

    const omrScored = scoreAnswerSheet({
      questions: omrQuestionKey,
      answers: omrExtractedAnswers,
      competitionConfig: {
        marksPerQuestion: 2,
        negativeMarking: { enabled: true, deduction: 0.5 }
      }
    });

    assert.strictEqual(omrScored.totalQuestions, 3);
    assert.strictEqual(omrScored.attemptedQuestions, 2);
    assert.strictEqual(omrScored.correctAnswers, 1);
    assert.strictEqual(omrScored.incorrectAnswers, 1);
    assert.strictEqual(omrScored.unansweredQuestions, 1);
    assert.strictEqual(omrScored.positiveMarks, 2.0);
    assert.strictEqual(omrScored.negativeDeduction, 0.5);
    assert.strictEqual(omrScored.finalScore, 1.5);
    assert.strictEqual(omrScored.maximumMarks, 6.0);
  });
});
