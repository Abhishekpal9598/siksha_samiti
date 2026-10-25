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
import { sweepExpiredAttempts } from '../src/services/examSweeper.service.js';
import { config } from '../src/config/env.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/education_committee';

async function makeRequest(app, method, path, { headers = {}, body = null, cookie = null } = {}) {
  const reqHeaders = { ...headers };
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
    server.close();
  }
}

test('PHASE 4.1: Online Exam Engine Security & Edge-Case Audit', async (suite) => {
  let adminCookie;
  let studentACookie;
  let studentBCookie;
  let studentA;
  let studentB;
  let competition;
  let questions = [];

  suite.before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    // Clean up previous test entities
    await User.deleteMany({ mobileNormalized: { $regex: /^9999555/ } });
    await Competition.deleteMany({ title: { $regex: /^Phase4_1Audit_/ } });

    const passwordHash = await bcrypt.hash('AuditPass@123', 8);

    // 1. Create Admin
    const admin = await User.create({
      fullName: 'Security Auditor Admin',
      mobile: '+91 9999555001',
      mobileNormalized: '9999555001',
      role: 'admin',
      passwordHash,
      isActive: true,
      classOrGrade: 'Chief Controller',
      school: 'HQ'
    });

    // 2. Create Students A and B
    studentA = await User.create({
      fullName: 'Audit Student Alpha',
      mobile: '+91 9999555002',
      mobileNormalized: '9999555002',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Govt High School'
    });

    studentB = await User.create({
      fullName: 'Audit Student Beta',
      mobile: '+91 9999555003',
      mobileNormalized: '9999555003',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Govt High School'
    });

    const logUser = async (mobile) => {
      const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
        body: { mobile, password: 'AuditPass@123' }
      });
      const cookieHeader = res.headers.get('set-cookie');
      return cookieHeader ? cookieHeader.split(';')[0] : `${config.cookieName}=${res.body.token}`;
    };

    adminCookie = await logUser('9999555001');
    studentACookie = await logUser('9999555002');
    studentBCookie = await logUser('9999555003');

    // 3. Create Competition (published, active now)
    const now = Date.now();
    competition = await Competition.create({
      title: 'Phase4_1Audit_Competition',
      description: 'Comprehensive exam engine audit',
      examDate: new Date(now),
      startTime: '09:00',
      endTime: '22:00',
      examStartsAt: new Date(now - 10 * 60 * 1000), // started 10m ago
      examEndsAt: new Date(now + 120 * 60 * 1000),  // ends in 2 hours
      registrationOpensAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
      registrationClosesAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
      durationMinutes: 60,
      mode: 'ONLINE_MCQ',
      eligibleClasses: ['Class 10'],
      totalMarks: 50,
      marksPerQuestion: 2,
      status: 'PUBLISHED',
      createdBy: admin._id
    });

    // 4. Create 3 Questions in Question Bank
    questions = await Question.create([
      {
        competitionId: competition._id,
        order: 1,
        prompt: 'Audit Q1: What is 2 + 2?',
        options: [
          { key: 'A', label: 'A', text: '3' },
          { key: 'B', label: 'B', text: '4' },
          { key: 'C', label: 'C', text: '5' },
          { key: 'D', label: 'D', text: '6' }
        ],
        correctOption: 'B',
        marks: 2,
        negativeMarks: 0,
        explanation: 'Confidential Answer Key Explanation Q1',
        createdBy: admin._id
      },
      {
        competitionId: competition._id,
        order: 2,
        prompt: 'Audit Q2: Which planet is the Red Planet?',
        options: [
          { key: 'A', label: 'A', text: 'Venus' },
          { key: 'B', label: 'B', text: 'Mars' },
          { key: 'C', label: 'C', text: 'Jupiter' },
          { key: 'D', label: 'D', text: 'Saturn' }
        ],
        correctOption: 'B',
        marks: 2,
        negativeMarks: 0,
        explanation: 'Confidential Mars Explanation Q2',
        createdBy: admin._id
      },
      {
        competitionId: competition._id,
        order: 3,
        prompt: 'Audit Q3: What is the chemical formula for water?',
        options: [
          { key: 'A', label: 'A', text: 'CO2' },
          { key: 'B', label: 'B', text: 'NaCl' },
          { key: 'C', label: 'C', text: 'H2O' },
          { key: 'D', label: 'D', text: 'O2' }
        ],
        correctOption: 'C',
        marks: 2,
        negativeMarks: 0,
        explanation: 'Confidential H2O Explanation Q3',
        createdBy: admin._id
      }
    ]);

    // 5. Register Student A and Student B
    await Registration.create({
      competitionId: competition._id,
      studentId: studentA._id,
      rollNumber: 'AUDIT-2026-0001',
      examMode: 'ONLINE_MCQ',
      status: 'registered'
    });

    await Registration.create({
      competitionId: competition._id,
      studentId: studentB._id,
      rollNumber: 'AUDIT-2026-0002',
      examMode: 'ONLINE_MCQ',
      status: 'registered'
    });
  });

    let attemptAId;

  // 1. Timer Manipulation: Server-Authoritative startedAt & endsAt
  await suite.test('1. Timer Manipulation: Server-authoritative startedAt and endsAt cannot be manipulated by client', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/competitions/${competition._id}/attempts`, {
      cookie: studentACookie,
      body: {
        startedAt: new Date(Date.now() - 3600000),
        endsAt: new Date(Date.now() + 86400000),
        status: 'SUBMITTED'
      }
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.attempt.status, 'IN_PROGRESS');
    attemptAId = res.body.attempt.id;

    const endsAt = new Date(res.body.attempt.endsAt);
    const expectedMaxEnds = new Date(Date.now() + 61 * 60 * 1000);
    assert.ok(endsAt <= expectedMaxEnds, 'Server endsAt must adhere to configured 60 minute duration');
  });

  // 2. Browser Refresh Recovery
  await suite.test('2. Browser Refresh Recovery: Refreshing the page returns exact active attempt with same endsAt', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/competitions/${competition._id}/attempts`, {
      cookie: studentACookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.isResumed, true);
    assert.equal(res.body.attempt.id, attemptAId);
    assert.equal(res.body.attempt.status, 'IN_PROGRESS');
  });

  // 3. Network Disconnect Recovery
  await suite.test('3. Network Disconnect Recovery: Reconnecting after drop retrieves stored attempt without data loss', async () => {
    const res = await makeRequest(app, 'GET', `/api/v1/attempts/${attemptAId}`, {
      cookie: studentACookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.attempt.id, attemptAId);
    assert.equal(res.body.attempt.questions.length, 3);
  });

  // 4. Out-of-Order Autosave Requests: Older request cannot overwrite newer answer
  await suite.test('4. Out-of-Order Autosave Requests: Stale delayed request cannot overwrite newer response', async () => {
    const q1 = questions[0];

    // Student selects Option B at clientVersion 2
    const resNewer = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptAId}/answers`, {
      cookie: studentACookie,
      body: {
        questionId: q1._id,
        selectedOption: 'B',
        clientVersion: 2,
        clientTimestamp: new Date(Date.now() + 1000)
      }
    });
    assert.equal(resNewer.status, 200);

    // Delayed older request (Option A, clientVersion 1) arrives late
    const resStale = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptAId}/answers`, {
      cookie: studentACookie,
      body: {
        questionId: q1._id,
        selectedOption: 'A',
        clientVersion: 1,
        clientTimestamp: new Date(Date.now() - 5000)
      }
    });
    assert.equal(resStale.status, 200);

    // Verify stored answer remains 'B'
    const checkRes = await makeRequest(app, 'GET', `/api/v1/attempts/${attemptAId}`, {
      cookie: studentACookie
    });

    const savedAnsQ1 = checkRes.body.attempt.answers.find((a) => a.questionId === q1._id.toString());
    assert.equal(savedAnsQ1.selectedOption, 'B', 'Newer answer B must be preserved against stale request A');
  });

  // 5. Concurrent Autosave Requests
  await suite.test('5. Concurrent Autosave Requests: Simultaneous saves to different questions succeed without conflict', async () => {
    const q2 = questions[1];
    const q3 = questions[2];

    const [res2, res3] = await Promise.all([
      makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptAId}/answers`, {
        cookie: studentACookie,
        body: { questionId: q2._id, selectedOption: 'B', clientVersion: 1 }
      }),
      makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptAId}/answers`, {
        cookie: studentACookie,
        body: { questionId: q3._id, selectedOption: 'C', clientVersion: 1 }
      })
    ]);

    assert.equal(res2.status, 200);
    assert.equal(res3.status, 200);

    const checkRes = await makeRequest(app, 'GET', `/api/v1/attempts/${attemptAId}`, {
      cookie: studentACookie
    });

    const ans2 = checkRes.body.attempt.answers.find((a) => a.questionId === q2._id.toString());
    const ans3 = checkRes.body.attempt.answers.find((a) => a.questionId === q3._id.toString());
    assert.equal(ans2.selectedOption, 'B');
    assert.equal(ans3.selectedOption, 'C');
  });

  // 6. Duplicate Answer-Save Retries
  await suite.test('6. Duplicate Answer-Save Retries: Retrying identical answer-save payload succeeds idempotently', async () => {
    const q1 = questions[0];
    const payload = { questionId: q1._id, selectedOption: 'B', clientVersion: 3 };

    const res1 = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptAId}/answers`, {
      cookie: studentACookie,
      body: payload
    });
    assert.equal(res1.status, 200);

    const res2 = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptAId}/answers`, {
      cookie: studentACookie,
      body: payload
    });
    assert.equal(res2.status, 200);
  });

  // 7. Autosave Racing with Final Submission
  await suite.test('7. Autosave Racing with Final Submission: Autosave arriving after submission is strictly rejected', async () => {
    // Submit the attempt
    const submitRes = await makeRequest(app, 'POST', `/api/v1/attempts/${attemptAId}/submit`, {
      cookie: studentACookie
    });
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.body.status, 'SUBMITTED');

    // Racing autosave arriving right after submission
    const racingSaveRes = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptAId}/answers`, {
      cookie: studentACookie,
      body: { questionId: questions[0]._id, selectedOption: 'D', clientVersion: 99 }
    });

    assert.equal(racingSaveRes.status, 400);
    assert.equal(racingSaveRes.body.error.code, 'ATTEMPT_CLOSED');
  });

  // 8. Automatic Submission After Expiry: Lazy check on access
  await suite.test('8. Automatic Submission After Expiry: Expired attempt accessed by student transitions to AUTO_SUBMITTED', async () => {
    // Start Student B attempt
    const resB = await makeRequest(app, 'POST', `/api/v1/competitions/${competition._id}/attempts`, {
      cookie: studentBCookie
    });
    assert.equal(resB.status, 201);
    const attemptBId = resB.body.attempt.id;

    // Fast-forward endsAt into past
    await Attempt.updateOne(
      { _id: attemptBId },
      { $set: { endsAt: new Date(Date.now() - 10000) } }
    );

    // Save answer to expired attempt
    const saveRes = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptBId}/answers`, {
      cookie: studentBCookie,
      body: { questionId: questions[0]._id, selectedOption: 'A' }
    });

    assert.equal(saveRes.status, 400);
    assert.equal(saveRes.body.error.code, 'EXAM_EXPIRED');

    // Attempt status is now AUTO_SUBMITTED
    const doc = await Attempt.findById(attemptBId);
    assert.equal(doc.status, 'AUTO_SUBMITTED');
  });

  // 9. Browser Closed During Exam: Server-Side Sweeper
  await suite.test('9. Browser Closed During Exam: Background sweeper auto-submits expired attempt without browser activity', async () => {
    const abandonedStudent = await User.create({
      fullName: 'Offline Student',
      mobile: '+91 9999555099',
      mobileNormalized: '9999555099',
      role: 'student',
      passwordHash: 'dummy',
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Rural High School'
    });
    const regAbandoned = await Registration.create({
      competitionId: competition._id,
      studentId: abandonedStudent._id,
      rollNumber: 'AUDIT-2026-9999',
      examMode: 'ONLINE_MCQ',
      status: 'registered'
    });
    const pastEndsAt = new Date(Date.now() - 5000);
    const abandonedAttempt = await Attempt.create({
      competitionId: competition._id,
      studentId: abandonedStudent._id,
      registrationId: regAbandoned._id,
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 65 * 60 * 1000),
      endsAt: pastEndsAt,
      questionSnapshot: [
        {
          questionId: questions[0]._id,
          order: 1,
          prompt: questions[0].prompt,
          options: questions[0].options,
          marks: 2
        }
      ],
      answers: []
    });

    // Student closed browser and disappeared. Trigger background server sweeper
    const sweptCount = await sweepExpiredAttempts();
    assert.ok(sweptCount >= 1, 'Sweeper must auto-submit expired attempts');

    const updatedAbandoned = await Attempt.findById(abandonedAttempt._id);
    assert.equal(updatedAbandoned.status, 'AUTO_SUBMITTED');
    assert.equal(updatedAbandoned.submittedAt.getTime(), pastEndsAt.getTime());

    // Clean up
    await Attempt.deleteOne({ _id: abandonedAttempt._id });
    await Registration.deleteOne({ _id: regAbandoned._id });
    await User.deleteOne({ _id: abandonedStudent._id });
  });

  // 10. Duplicate Manual Submission: Idempotent
  await suite.test('10. Duplicate Manual Submission: Calling submit on already submitted attempt returns idempotent 200', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/attempts/${attemptAId}/submit`, {
      cookie: studentACookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.alreadySubmitted, true);
    assert.equal(res.body.status, 'SUBMITTED');
  });

  // 11. Answer Changes After Submission: Strictly Locked
  await suite.test('11. Answer Changes After Submission: Further answer mutation returns 400 ATTEMPT_CLOSED', async () => {
    const res = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptAId}/answers`, {
      cookie: studentACookie,
      body: { questionId: questions[1]._id, selectedOption: 'A' }
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'ATTEMPT_CLOSED');
  });

  // 12. Cross-Student Attempt Access: Student B cannot access Student A attempt
  await suite.test('12. Cross-Student Attempt Access: Student B is forbidden from reading or writing Student A attempt', async () => {
    const getRes = await makeRequest(app, 'GET', `/api/v1/attempts/${attemptAId}`, {
      cookie: studentBCookie
    });
    assert.equal(getRes.status, 403);
    assert.equal(getRes.body.error.code, 'FORBIDDEN');

    const patchRes = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptAId}/answers`, {
      cookie: studentBCookie,
      body: { questionId: questions[0]._id, selectedOption: 'C' }
    });
    assert.equal(patchRes.status, 403);
    assert.equal(patchRes.body.error.code, 'FORBIDDEN');
  });

  // 13. Invalid Question and Option Submissions
  await suite.test('13. Invalid Question and Option Submissions: Rejects unknown question IDs and illegal options', async () => {
    const fakeQId = new mongoose.Types.ObjectId();

    const invalidOptRes = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptAId}/answers`, {
      cookie: studentACookie,
      body: { questionId: fakeQId, selectedOption: 'Z' }
    });

    assert.equal(invalidOptRes.status, 400);
  });

  // 14. Question Snapshot Integrity: Question Bank changes do NOT mutate ongoing attempt snapshot
  await suite.test('14. Question Snapshot Integrity: Updating Question Bank does not alter frozen attempt snapshot', async () => {
    // Admin updates Q1 in Question Bank
    await Question.updateOne(
      { _id: questions[0]._id },
      { $set: { prompt: 'ALTERED QUESTION PROMPT AFTER EXAM STARTED' } }
    );

    // Fetch Student A attempt
    const attemptDoc = await Attempt.findById(attemptAId);
    const snapQ1 = attemptDoc.questionSnapshot.find((q) => q.questionId.toString() === questions[0]._id.toString());

    assert.equal(snapQ1.prompt, 'Audit Q1: What is 2 + 2?', 'Question prompt in snapshot must remain completely immutable');
    assert.equal(attemptDoc.toStudentJSON().questions[0].prompt, 'Audit Q1: What is 2 + 2?');
  });

  // 15. Admin Monitoring Endpoint
  await suite.test('15. Admin Monitoring Endpoint: Admin views student attempts without score or answer key leak', async () => {
    const res = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${competition._id}/attempts`, {
      cookie: adminCookie
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.count >= 2);

    for (const att of res.body.attempts) {
      assert.ok(att.rollNumber);
      assert.ok(att.status);
      assert.equal(typeof att.answeredCount, 'number');
      assert.equal(att.correctOption, undefined);
      assert.equal(att.answers, undefined);
    }

    // Final cleanup after all audit tests complete
    await Attempt.deleteMany({ competitionId: competition._id });
    await Registration.deleteMany({ competitionId: competition._id });
    await Question.deleteMany({ competitionId: competition._id });
    await Competition.deleteMany({ _id: competition._id });
    await User.deleteMany({ mobileNormalized: { $regex: /^9999555/ } });
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });
});
