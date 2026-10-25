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

test('PHASE 4: Online Examination Engine, Timer & Answer Autosave Integration Tests', async (suite) => {
  let adminUser = null;
  let onlineStudentA = null;
  let onlineStudentB = null;
  let omrStudent = null;
  let unregisteredStudent = null;

  let adminCookie = null;
  let studentACookie = null;
  let studentBCookie = null;
  let omrStudentCookie = null;
  let unregStudentCookie = null;

  let liveCompetition = null;
  let futureCompetition = null;
  let liveQuestions = [];

  suite.before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    // Clean up previous test entities
    await User.deleteMany({ mobileNormalized: { $regex: /^9999777/ } });
    await Competition.deleteMany({ title: { $regex: /^Phase4Test_/ } });

    const passwordHash = await bcrypt.hash('Phase4Pass@123', 10);

    // 1. Admin
    adminUser = await User.create({
      fullName: 'Phase 4 Admin',
      mobile: '+91 9999777001',
      mobileNormalized: '9999777001',
      role: 'admin',
      passwordHash,
      isActive: true,
      classOrGrade: 'Chief Controller',
      school: 'HQ'
    });

    // 2. Student A (Online MCQ)
    onlineStudentA = await User.create({
      fullName: 'Online Candidate A',
      mobile: '+91 9999777002',
      mobileNormalized: '9999777002',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Vivekananda Vidyalaya'
    });

    // 3. Student B (Online MCQ)
    onlineStudentB = await User.create({
      fullName: 'Online Candidate B',
      mobile: '+91 9999777003',
      mobileNormalized: '9999777003',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Sarvodaya Vidyalaya'
    });

    // 4. OMR-Only Student
    omrStudent = await User.create({
      fullName: 'Paper OMR Candidate',
      mobile: '+91 9999777004',
      mobileNormalized: '9999777004',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Rural High School'
    });

    // 5. Unregistered Student
    unregisteredStudent = await User.create({
      fullName: 'Unregistered Candidate',
      mobile: '+91 9999777005',
      mobileNormalized: '9999777005',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Rural High School'
    });

    // Login users to acquire session cookies
    const logUser = async (mobile) => {
      const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
        body: { mobile, password: 'Phase4Pass@123' }
      });
      const cookieHeader = res.headers.get('set-cookie');
      return cookieHeader ? cookieHeader.split(';')[0] : `${config.cookieName}=${res.body.token}`;
    };

    adminCookie = await logUser('9999777001');
    studentACookie = await logUser('9999777002');
    studentBCookie = await logUser('9999777003');
    omrStudentCookie = await logUser('9999777004');
    unregStudentCookie = await logUser('9999777005');

    // Create Live Competition (Currently in Exam Window)
    const now = Date.now();
    liveCompetition = await Competition.create({
      title: 'Phase4Test_Live_Competition',
      description: 'Active live online examination test',
      examDate: new Date(now),
      examStartsAt: new Date(now - 30 * 60 * 1000), // started 30 mins ago
      examEndsAt: new Date(now + 90 * 60 * 1000),   // ends in 90 mins
      durationMinutes: 60,
      mode: 'BOTH',
      eligibleClasses: ['Class 10'],
      totalMarks: 30,
      marksPerQuestion: 10,
      registrationOpensAt: new Date(now - 7 * 86400000),
      registrationClosesAt: new Date(now - 1 * 3600000),
      status: 'PUBLISHED',
      createdBy: adminUser._id
    });

    // Seed 3 Questions for Live Competition
    liveQuestions = await Question.create([
      {
        competitionId: liveCompetition._id,
        order: 1,
        prompt: 'What is the SI unit of electric current?',
        options: [
          { key: 'A', text: 'Volt' },
          { key: 'B', text: 'Ampere' },
          { key: 'C', text: 'Ohm' },
          { key: 'D', text: 'Watt' }
        ],
        correctOption: 'B',
        explanation: 'Ampere is the SI base unit of electric current.',
        marks: 10,
        subject: 'Physics',
        topic: 'Electricity'
      },
      {
        competitionId: liveCompetition._id,
        order: 2,
        prompt: 'Which gas is most abundant in Earth’s atmosphere?',
        options: [
          { key: 'A', text: 'Oxygen' },
          { key: 'B', text: 'Carbon Dioxide' },
          { key: 'C', text: 'Nitrogen' },
          { key: 'D', text: 'Hydrogen' }
        ],
        correctOption: 'C',
        explanation: 'Nitrogen makes up approximately 78% of Earth’s atmosphere.',
        marks: 10,
        subject: 'Chemistry',
        topic: 'Atmosphere'
      },
      {
        competitionId: liveCompetition._id,
        order: 3,
        prompt: 'What is the powerhouse of the cell?',
        options: [
          { key: 'A', text: 'Mitochondria' },
          { key: 'B', text: 'Nucleus' },
          { key: 'C', text: 'Ribosome' },
          { key: 'D', text: 'Endoplasmic Reticulum' }
        ],
        correctOption: 'A',
        explanation: 'Mitochondria generate most of the chemical energy needed by the cell.',
        marks: 10,
        subject: 'Biology',
        topic: 'Cell Biology'
      }
    ]);

    // Create Future Competition (Starts tomorrow)
    futureCompetition = await Competition.create({
      title: 'Phase4Test_Future_Competition',
      description: 'Future examination test',
      examDate: new Date(now + 86400000),
      examStartsAt: new Date(now + 86400000),
      examEndsAt: new Date(now + 86400000 + 120 * 60 * 1000),
      durationMinutes: 120,
      mode: 'ONLINE_MCQ',
      eligibleClasses: ['Class 10'],
      totalMarks: 10,
      registrationOpensAt: new Date(now - 86400000),
      registrationClosesAt: new Date(now + 43200000),
      status: 'PUBLISHED',
      createdBy: adminUser._id
    });
    await Question.create({
      competitionId: futureCompetition._id,
      order: 1,
      prompt: 'Dummy question for future exam',
      options: [
        { key: 'A', text: '1' },
        { key: 'B', text: '2' },
        { key: 'C', text: '3' },
        { key: 'D', text: '4' }
      ],
      correctOption: 'A',
      marks: 10
    });

    // Register Student A with ONLINE_MCQ
    await Registration.create({
      competitionId: liveCompetition._id,
      studentId: onlineStudentA._id,
      rollNumber: 'EC-2026-8001',
      examMode: 'ONLINE_MCQ',
      examModeLocked: true,
      status: 'registered'
    });

    // Register Student B with ONLINE_MCQ
    await Registration.create({
      competitionId: liveCompetition._id,
      studentId: onlineStudentB._id,
      rollNumber: 'EC-2026-8002',
      examMode: 'ONLINE_MCQ',
      examModeLocked: true,
      status: 'registered'
    });

    // Register OMR Student with OMR
    await Registration.create({
      competitionId: liveCompetition._id,
      studentId: omrStudent._id,
      rollNumber: 'EC-2026-8003',
      examMode: 'OMR',
      examModeLocked: true,
      status: 'registered'
    });
  });

  suite.after(async () => {
    await User.deleteMany({ mobileNormalized: { $regex: /^9999777/ } });
    await Competition.deleteMany({ title: { $regex: /^Phase4Test_/ } });
    await Attempt.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  // 1. Unauthenticated student cannot start exam
  await suite.test('1. Unauthenticated student cannot start exam', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/competitions/${liveCompetition._id}/attempts`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
  });

  // 2. Unregistered student cannot start exam
  await suite.test('2. Unregistered student cannot start exam', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/competitions/${liveCompetition._id}/attempts`, {
      cookie: unregStudentCookie
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'NOT_REGISTERED');
  });

  // 3. OMR-only student cannot start online MCQ exam
  await suite.test('3. OMR-only student cannot start online MCQ exam', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/competitions/${liveCompetition._id}/attempts`, {
      cookie: omrStudentCookie
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'OMR_MODE_ONLY');
    assert.ok(res.body.error.message.includes('paper OMR sheet'));
  });

  // 4. Exam cannot start before configured start time
  await suite.test('4. Exam cannot start before configured start time', async () => {
    // Register Student A for future competition
    await Registration.create({
      competitionId: futureCompetition._id,
      studentId: onlineStudentA._id,
      rollNumber: 'EC-2026-8004',
      examMode: 'ONLINE_MCQ',
      status: 'registered'
    });

    const res = await makeRequest(app, 'POST', `/api/v1/competitions/${futureCompetition._id}/attempts`, {
      cookie: studentACookie
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'EXAM_NOT_STARTED');
  });

  // 5. Eligible student can start exam
  let attemptStudentA = null;
  await suite.test('5. Eligible student can start exam successfully', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/competitions/${liveCompetition._id}/attempts`, {
      cookie: studentACookie
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.attempt.status, 'IN_PROGRESS');
    assert.equal(res.body.attempt.questions.length, 3);
    assert.ok(res.body.attempt.endsAt);
    assert.ok(res.body.attempt.startedAt);

    attemptStudentA = res.body.attempt;
  });

  // 6. Duplicate attempt creation is prevented (Resumes existing in-progress attempt)
  await suite.test('6. Duplicate attempt creation is prevented (Idempotent resume)', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/competitions/${liveCompetition._id}/attempts`, {
      cookie: studentACookie
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.isResumed, true);
    assert.equal(res.body.attempt.id, attemptStudentA.id);
  });

  // 7. Concurrent attempt creation is safe
  await suite.test('7. Concurrent attempt creation for Student B is safe (Zero duplicate attempts)', async () => {
    const promises = Array.from({ length: 3 }, () =>
      makeRequest(app, 'POST', `/api/v1/competitions/${liveCompetition._id}/attempts`, {
        cookie: studentBCookie
      })
    );
    const responses = await Promise.all(promises);

    // All must succeed (one 201 created, remaining 200 resumed)
    for (const r of responses) {
      assert.ok([200, 201].includes(r.status));
      assert.equal(r.body.success, true);
    }

    // Verify in DB that only 1 attempt document exists for Student B
    const countB = await Attempt.countDocuments({
      competitionId: liveCompetition._id,
      studentId: onlineStudentB._id
    });
    assert.equal(countB, 1, 'Exactly one attempt document must exist for Student B');
  });

  // 8. Question snapshot does not expose answer keys
  await suite.test('8. Question snapshot strictly omits correctOption and explanation', async () => {
    const res = await makeRequest(app, 'GET', `/api/v1/attempts/${attemptStudentA.id}`, {
      cookie: studentACookie
    });
    assert.equal(res.status, 200);

    const stringified = JSON.stringify(res.body);
    assert.ok(!stringified.includes('correctOption'), 'Response must not contain correctOption property');
    assert.ok(!stringified.includes('Ampere is the SI base unit'), 'Response must not contain explanation');
    assert.ok(!stringified.includes('Nitrogen makes up approximately'), 'Response must not contain explanation');

    for (const q of res.body.attempt.questions) {
      assert.equal(q.correctOption, undefined);
      assert.equal(q.explanation, undefined);
      assert.equal(q.options.length, 4);
    }
  });

  // 9. Student A cannot access Student B's attempt
  await suite.test('9. Student A cannot access Student B attempt (HTTP 403 Forbidden)', async () => {
    const attemptB = await Attempt.findOne({
      competitionId: liveCompetition._id,
      studentId: onlineStudentB._id
    });

    const res = await makeRequest(app, 'GET', `/api/v1/attempts/${attemptB._id}`, {
      cookie: studentACookie
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  // 10. Student cannot save an answer for an unknown question
  await suite.test('10. Student cannot save an answer for an unknown question', async () => {
    const fakeQuestionId = new mongoose.Types.ObjectId();
    const res = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptStudentA.id}/answers`, {
      cookie: studentACookie,
      body: {
        questionId: fakeQuestionId.toString(),
        selectedOption: 'A'
      }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_QUESTION_ID');
  });

  // 11. Invalid option values are rejected
  await suite.test('11. Invalid option values are rejected', async () => {
    const q1Id = liveQuestions[0]._id.toString();
    const res = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptStudentA.id}/answers`, {
      cookie: studentACookie,
      body: {
        questionId: q1Id,
        selectedOption: 'Z' // Invalid option key
      }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_OPTION');
  });

  // 12. Answer autosave works
  await suite.test('12. Answer autosave updates answers and marks for review', async () => {
    const q1Id = liveQuestions[0]._id.toString();
    const q2Id = liveQuestions[1]._id.toString();

    // Save Q1 as B
    const saveRes1 = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptStudentA.id}/answers`, {
      cookie: studentACookie,
      body: {
        questionId: q1Id,
        selectedOption: 'B',
        isMarkedForReview: true
      }
    });
    assert.equal(saveRes1.status, 200);
    assert.equal(saveRes1.body.success, true);
    assert.ok(saveRes1.body.savedAt);

    // Save Q2 as C
    const saveRes2 = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptStudentA.id}/answers`, {
      cookie: studentACookie,
      body: {
        questionId: q2Id,
        selectedOption: 'C',
        isMarkedForReview: false
      }
    });
    assert.equal(saveRes2.status, 200);

    // Verify in database
    const dbAttempt = await Attempt.findById(attemptStudentA.id);
    const ans1 = dbAttempt.answers.find((a) => a.questionId.toString() === q1Id);
    const ans2 = dbAttempt.answers.find((a) => a.questionId.toString() === q2Id);

    assert.equal(ans1.selectedOption, 'B');
    assert.equal(ans1.isMarkedForReview, true);
    assert.equal(ans2.selectedOption, 'C');
    assert.equal(ans2.isMarkedForReview, false);
  });

  // 13. Browser refresh recovers the same attempt
  await suite.test('13. Browser refresh / recovery retrieves stored answers and remaining duration', async () => {
    const res = await makeRequest(app, 'GET', `/api/v1/attempts/${attemptStudentA.id}`, {
      cookie: studentACookie
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.attempt.status, 'IN_PROGRESS');

    const q1Id = liveQuestions[0]._id.toString();
    const recoveredAns1 = res.body.attempt.answers.find((a) => a.questionId === q1Id);
    assert.equal(recoveredAns1.selectedOption, 'B');
    assert.equal(recoveredAns1.isMarkedForReview, true);
  });

  // 14. Client clock manipulation does not extend the timer
  await suite.test('14. Server-authoritative timer: client cannot extend endsAt', async () => {
    const dbAttempt = await Attempt.findById(attemptStudentA.id);
    const initialEndsAt = new Date(dbAttempt.endsAt).getTime();

    // Client attempts to send forged endsAt in request body
    await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptStudentA.id}/answers`, {
      cookie: studentACookie,
      body: {
        questionId: liveQuestions[0]._id.toString(),
        selectedOption: 'B',
        endsAt: new Date(Date.now() + 10000000).toISOString() // Forged future timestamp
      }
    });

    const refreshedAttempt = await Attempt.findById(attemptStudentA.id);
    assert.equal(
      new Date(refreshedAttempt.endsAt).getTime(),
      initialEndsAt,
      'endsAt must remain immutable and protected from client clock tampering'
    );
  });

  // 15. Answer changes after submission are rejected
  await suite.test('15. Manual final submission locks attempt and rejects further answer updates', async () => {
    // Submit Student A attempt
    const submitRes = await makeRequest(app, 'POST', `/api/v1/attempts/${attemptStudentA.id}/submit`, {
      cookie: studentACookie
    });
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.body.status, 'SUBMITTED');
    assert.ok(submitRes.body.submittedAt);

    // Attempt to modify an answer post-submission
    const postSubmitSave = await makeRequest(app, 'PATCH', `/api/v1/attempts/${attemptStudentA.id}/answers`, {
      cookie: studentACookie,
      body: {
        questionId: liveQuestions[0]._id.toString(),
        selectedOption: 'A'
      }
    });
    assert.equal(postSubmitSave.status, 400);
    assert.equal(postSubmitSave.body.error.code, 'ATTEMPT_CLOSED');
  });

  // 16. Duplicate final submission is handled safely
  await suite.test('16. Duplicate final submission returns existing submitted state (Idempotent)', async () => {
    const res = await makeRequest(app, 'POST', `/api/v1/attempts/${attemptStudentA.id}/submit`, {
      cookie: studentACookie
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.alreadySubmitted, true);
    assert.equal(res.body.status, 'SUBMITTED');
  });

  // 17. Expired attempts are automatically finalized
  await suite.test('17. Expired attempt is automatically finalized to AUTO_SUBMITTED', async () => {
    // Create an expired attempt for Student B by setting endsAt in the past
    const expiredAttempt = await Attempt.findOne({
      competitionId: liveCompetition._id,
      studentId: onlineStudentB._id
    });

    expiredAttempt.endsAt = new Date(Date.now() - 5000); // 5 seconds in the past
    await expiredAttempt.save();

    // Attempting to autosave an answer on an expired attempt triggers auto-submit
    const saveRes = await makeRequest(app, 'PATCH', `/api/v1/attempts/${expiredAttempt._id}/answers`, {
      cookie: studentBCookie,
      body: {
        questionId: liveQuestions[0]._id.toString(),
        selectedOption: 'A'
      }
    });
    assert.equal(saveRes.status, 400);
    assert.equal(saveRes.body.error.code, 'EXAM_EXPIRED');

    // Verify in database that status is now AUTO_SUBMITTED
    const updated = await Attempt.findById(expiredAttempt._id);
    assert.equal(updated.status, 'AUTO_SUBMITTED');
    assert.ok(updated.submittedAt);
  });

  // 18. Admin monitoring endpoint works and does not expose answer keys
  await suite.test('18. Admin monitoring endpoint returns attempts with privacy preservation', async () => {
    const adminRes = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${liveCompetition._id}/attempts`, {
      cookie: adminCookie
    });
    assert.equal(adminRes.status, 200);
    assert.equal(adminRes.body.success, true);
    assert.ok(adminRes.body.attempts.length >= 2);

    const stringified = JSON.stringify(adminRes.body);
    assert.ok(!stringified.includes('correctOption'), 'Admin monitoring must not include correctOption in Phase 4');
    assert.ok(!stringified.includes('finalScore'), 'Admin monitoring must not include scores in Phase 4');

    const sample = adminRes.body.attempts[0];
    assert.ok(sample.rollNumber);
    assert.ok(sample.studentName);
    assert.ok(sample.status);
    assert.ok(typeof sample.answeredCount === 'number');
  });
});
