import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Competition } from '../src/models/competition.model.js';
import { Question } from '../src/models/question.model.js';
import { Registration } from '../src/models/registration.model.js';
import { Counter } from '../src/models/counter.model.js';
import { generateRollNumber } from '../src/models/registration.model.js';
import { config } from '../src/config/env.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/education_committee';

// Helper: Make HTTP request to Express app
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
    const fetchOptions = {
      method,
      headers: reqHeaders
    };
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

test('PHASE 3.1: Security, Data Integrity & Edge-Case Audit', async (suite) => {
  let adminUser = null;
  let studentUserA = null;
  let studentUserB = null;
  let adminCookie = null;
  let studentCookieA = null;
  let studentCookieB = null;

  suite.before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    // Clean up test audit users & competitions
    await User.deleteMany({ mobileNormalized: { $regex: /^9999888/ } });
    await Competition.deleteMany({ title: { $regex: /^AuditTest_/ } });
    await Counter.deleteMany({ _id: { $regex: /^roll_/ } });

    const passwordHash = await bcrypt.hash('AuditPass@123', 10);

    // Seed Admin
    adminUser = await User.create({
      fullName: 'Audit Controller',
      mobile: '+91 9999888001',
      mobileNormalized: '9999888001',
      role: 'admin',
      passwordHash,
      isActive: true,
      classOrGrade: 'Exam Controller',
      school: 'District HQ'
    });

    // Seed Student A
    studentUserA = await User.create({
      fullName: 'Audit Student A',
      mobile: '+91 9999888002',
      mobileNormalized: '9999888002',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Govt High School'
    });

    // Seed Student B
    studentUserB = await User.create({
      fullName: 'Audit Student B',
      mobile: '+91 9999888003',
      mobileNormalized: '9999888003',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Govt High School'
    });

    // Log in Admin
    const loginAdminRes = await makeRequest(app, 'POST', '/api/v1/auth/login', {
      body: { mobile: '9999888001', password: 'AuditPass@123' }
    });
    assert.equal(loginAdminRes.status, 200);
    const rawAdminCookie = loginAdminRes.headers.get('set-cookie');
    adminCookie = rawAdminCookie ? rawAdminCookie.split(';')[0] : `${config.cookieName}=${loginAdminRes.body.token}`;

    // Log in Student A
    const loginA = await makeRequest(app, 'POST', '/api/v1/auth/login', {
      body: { mobile: '9999888002', password: 'AuditPass@123' }
    });
    assert.equal(loginA.status, 200);
    const rawCookieA = loginA.headers.get('set-cookie');
    studentCookieA = rawCookieA ? rawCookieA.split(';')[0] : `${config.cookieName}=${loginA.body.token}`;

    // Log in Student B
    const loginB = await makeRequest(app, 'POST', '/api/v1/auth/login', {
      body: { mobile: '9999888003', password: 'AuditPass@123' }
    });
    assert.equal(loginB.status, 200);
    const rawCookieB = loginB.headers.get('set-cookie');
    studentCookieB = rawCookieB ? rawCookieB.split(';')[0] : `${config.cookieName}=${loginB.body.token}`;
  });

  suite.after(async () => {
    await User.deleteMany({ mobileNormalized: { $regex: /^9999888/ } });
    await Competition.deleteMany({ title: { $regex: /^AuditTest_/ } });
    await Counter.deleteMany({ _id: { $regex: /^roll_/ } });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  // =========================================================================
  // A. Roll Number Concurrency Safety & Dynamic Year Resolution
  // =========================================================================
  await suite.test('A1. Roll number dynamically uses exam year from competition.examDate', async () => {
    const futureComp = {
      _id: new mongoose.Types.ObjectId(),
      examDate: new Date('2028-05-15T10:00:00.000Z')
    };

    const rollNumber = await generateRollNumber(futureComp);
    assert.match(rollNumber, /^EC-2028-\d{4}$/, 'Roll number must incorporate the 2028 exam year from examDate');
  });

  await suite.test('A2. Simultaneous registration requests receive unique, sequential roll numbers without collision', async () => {
    // Create published competition for year 2029
    const comp = await Competition.create({
      title: 'AuditTest_Concurrency_Comp',
      description: 'High concurrency roll number test',
      examDate: new Date('2029-03-20T10:00:00.000Z'),
      durationMinutes: 120,
      mode: 'ONLINE_MCQ',
      eligibleClasses: ['Class 10'],
      totalMarks: 50,
      marksPerQuestion: 1,
      registrationOpensAt: new Date(Date.now() - 3600000),
      registrationClosesAt: new Date(Date.now() + 86400000),
      status: 'PUBLISHED',
      createdBy: adminUser._id
    });

    // Run 5 simultaneous roll number generations
    const rollPromises = Array.from({ length: 5 }, () => generateRollNumber(comp));
    const rolls = await Promise.all(rollPromises);

    assert.equal(rolls.length, 5);
    const uniqueRolls = new Set(rolls);
    assert.equal(uniqueRolls.size, 5, 'Every simultaneous roll number generated must be strictly unique');

    // Verify format and year
    for (const r of rolls) {
      assert.match(r, /^EC-2029-\d{4}$/, `Roll number ${r} must follow EC-2029-XXXX format`);
    }

    // Verify counter in database
    const counterDoc = await Counter.findById(`roll_${comp._id}_2029`);
    assert.ok(counterDoc, 'Counter document must exist');
    assert.equal(counterDoc.seq, 5, 'Counter sequence must be exactly 5 after 5 generations');
  });

  // =========================================================================
  // B. Answer-Key Security Across All Endpoints
  // =========================================================================
  await suite.test('B1. Public & Student endpoints NEVER leak correctOption or explanation', async () => {
    const testComp = await Competition.create({
      title: 'AuditTest_AnswerSecurity_Comp',
      description: 'Testing answer key secrecy',
      examDate: new Date('2026-12-10T10:00:00.000Z'),
      durationMinutes: 90,
      mode: 'ONLINE_MCQ',
      eligibleClasses: ['Class 10'],
      totalMarks: 10,
      registrationOpensAt: new Date(Date.now() - 3600000),
      registrationClosesAt: new Date(Date.now() + 86400000),
      status: 'PUBLISHED',
      createdBy: adminUser._id
    });

    await Question.create({
      competitionId: testComp._id,
      prompt: 'What is the capital of India?',
      options: [
        { key: 'A', text: 'Mumbai' },
        { key: 'B', text: 'New Delhi' },
        { key: 'C', text: 'Kolkata' },
        { key: 'D', text: 'Chennai' }
      ],
      correctOption: 'B',
      explanation: 'New Delhi is the official national capital of India.',
      marks: 1,
      negativeMarks: 0.25,
      subject: 'Social Science',
      classOrGrade: 'Class 10'
    });

    // 1. GET /competitions (public list)
    const listRes = await makeRequest(app, 'GET', '/api/v1/competitions');
    assert.equal(listRes.status, 200);
    const stringifiedList = JSON.stringify(listRes.body);
    assert.ok(!stringifiedList.includes('New Delhi is the official'), 'Public list must not leak explanation');
    assert.ok(!stringifiedList.includes('correctOption'), 'Public list must not have correctOption property');

    // 2. GET /competitions/:id (public details)
    const detailRes = await makeRequest(app, 'GET', `/api/v1/competitions/${testComp._id}`);
    assert.equal(detailRes.status, 200);
    const stringifiedDetail = JSON.stringify(detailRes.body);
    assert.ok(!stringifiedDetail.includes('New Delhi is the official'), 'Detail must not leak explanation');
    assert.ok(!stringifiedDetail.includes('correctOption'), 'Detail must not have correctOption');

    // 3. Student Registration response
    const regRes = await makeRequest(app, 'POST', `/api/v1/competitions/${testComp._id}/register`, {
      cookie: studentCookieA,
      body: { examMode: 'ONLINE_MCQ' }
    });
    assert.equal(regRes.status, 201);
    const stringifiedReg = JSON.stringify(regRes.body);
    assert.ok(!stringifiedReg.includes('correctOption'), 'Registration response must not leak correctOption');
    assert.ok(!stringifiedReg.includes('explanation'), 'Registration response must not leak explanation');

    // 4. Student attempting to access Admin Question endpoint
    const studentQuestionAttempt = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${testComp._id}/questions`, {
      cookie: studentCookieA
    });
    assert.equal(studentQuestionAttempt.status, 403, 'Student must receive 403 Forbidden accessing questions endpoint');

    // 5. Unauthenticated attempting to access Admin Question endpoint
    const unauthQuestionAttempt = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${testComp._id}/questions`);
    assert.equal(unauthQuestionAttempt.status, 401, 'Unauthenticated user must receive 401 Unauthenticated');

    // 6. Authorized Admin CAN access question bank with answers
    const adminQuestionRes = await makeRequest(app, 'GET', `/api/v1/admin/competitions/${testComp._id}/questions`, {
      cookie: adminCookie
    });
    assert.equal(adminQuestionRes.status, 200);
    assert.equal(adminQuestionRes.body.questions[0].correctOption, 'B');
    assert.ok(adminQuestionRes.body.questions[0].explanation.includes('New Delhi'));
  });

  // =========================================================================
  // C. Registration and Exam Mode Lock
  // =========================================================================
  await suite.test('C1. BOTH mode competition requires explicit student selection', async () => {
    const bothComp = await Competition.create({
      title: 'AuditTest_BothMode_Comp',
      description: 'Testing mode selection requirements',
      examDate: new Date('2026-12-15T10:00:00.000Z'),
      durationMinutes: 60,
      mode: 'BOTH',
      eligibleClasses: ['Class 10'],
      totalMarks: 50,
      registrationOpensAt: new Date(Date.now() - 3600000),
      registrationClosesAt: new Date(Date.now() + 86400000),
      status: 'PUBLISHED',
      createdBy: adminUser._id
    });

    // Attempt 1: Omitting examMode returns 400 MODE_REQUIRED
    const emptyModeRes = await makeRequest(app, 'POST', `/api/v1/competitions/${bothComp._id}/register`, {
      cookie: studentCookieB,
      body: {}
    });
    assert.equal(emptyModeRes.status, 400);
    assert.equal(emptyModeRes.body.error.code, 'MODE_REQUIRED');

    // Attempt 2: Passing invalid mode 'HYBRID' returns 400 MODE_REQUIRED
    const invalidModeRes = await makeRequest(app, 'POST', `/api/v1/competitions/${bothComp._id}/register`, {
      cookie: studentCookieB,
      body: { examMode: 'HYBRID' }
    });
    assert.equal(invalidModeRes.status, 400);
    assert.equal(invalidModeRes.body.error.code, 'MODE_REQUIRED');

    // Attempt 3: Passing valid mode 'OMR' succeeds and is permanently locked
    const validRegRes = await makeRequest(app, 'POST', `/api/v1/competitions/${bothComp._id}/register`, {
      cookie: studentCookieB,
      body: { examMode: 'OMR' }
    });
    assert.equal(validRegRes.status, 201);
    assert.equal(validRegRes.body.registration.examMode, 'OMR');
    assert.equal(validRegRes.body.registration.examModeLocked, true);
  });

  await suite.test('C2. Single-mode competition rejects conflicting client-supplied mode', async () => {
    const onlineOnlyComp = await Competition.create({
      title: 'AuditTest_OnlineOnly_Comp',
      description: 'Only Online MCQ allowed',
      examDate: new Date('2026-12-20T10:00:00.000Z'),
      durationMinutes: 60,
      mode: 'ONLINE_MCQ',
      eligibleClasses: ['Class 10'],
      totalMarks: 20,
      registrationOpensAt: new Date(Date.now() - 3600000),
      registrationClosesAt: new Date(Date.now() + 86400000),
      status: 'PUBLISHED',
      createdBy: adminUser._id
    });

    // Client attempts to pass 'OMR' on an 'ONLINE_MCQ' competition
    const conflictRes = await makeRequest(app, 'POST', `/api/v1/competitions/${onlineOnlyComp._id}/register`, {
      cookie: studentCookieB,
      body: { examMode: 'OMR' }
    });
    assert.equal(conflictRes.status, 400);
    assert.equal(conflictRes.body.error.code, 'INVALID_EXAM_MODE');
  });

  await suite.test('C3. Registration ownership is strictly derived from session; body studentId is ignored', async () => {
    const testComp = await Competition.create({
      title: 'AuditTest_Ownership_Comp',
      description: 'Testing registration identity derivation',
      examDate: new Date('2026-12-25T10:00:00.000Z'),
      durationMinutes: 60,
      mode: 'ONLINE_MCQ',
      eligibleClasses: ['Class 10'],
      totalMarks: 20,
      registrationOpensAt: new Date(Date.now() - 3600000),
      registrationClosesAt: new Date(Date.now() + 86400000),
      status: 'PUBLISHED',
      createdBy: adminUser._id
    });

    // Student A tries to inject Student B's ID in request body
    const spoofRes = await makeRequest(app, 'POST', `/api/v1/competitions/${testComp._id}/register`, {
      cookie: studentCookieA,
      body: {
        examMode: 'ONLINE_MCQ',
        studentId: studentUserB._id.toString()
      }
    });
    assert.equal(spoofRes.status, 201);

    // Verify registration record in DB belongs to Student A, NOT Student B
    const savedReg = await Registration.findById(spoofRes.body.registration.id);
    assert.equal(savedReg.studentId.toString(), studentUserA._id.toString(), 'Registration must belong to authenticated Student A');
    assert.notEqual(savedReg.studentId.toString(), studentUserB._id.toString(), 'Injected studentId must have been ignored');
  });

  // =========================================================================
  // D. Competition Status Lifecycle & Validation
  // =========================================================================
  await suite.test('D1. Status transition gates enforce state machine and reject invalid transitions', async () => {
    const lifecycleComp = await Competition.create({
      title: 'AuditTest_Lifecycle_Comp',
      description: 'Testing status transitions',
      examDate: new Date('2027-01-10T10:00:00.000Z'),
      durationMinutes: 120,
      mode: 'BOTH',
      eligibleClasses: ['Class 10'],
      totalMarks: 100,
      registrationOpensAt: new Date('2026-11-01T00:00:00.000Z'),
      registrationClosesAt: new Date('2026-12-31T23:59:59.000Z'),
      status: 'DRAFT',
      createdBy: adminUser._id
    });

    // 1. DRAFT -> CLOSED is an invalid direct jump
    const invalidJumpRes = await makeRequest(app, 'PATCH', `/api/v1/admin/competitions/${lifecycleComp._id}/status`, {
      cookie: adminCookie,
      body: { status: 'CLOSED' }
    });
    assert.equal(invalidJumpRes.status, 400);
    assert.equal(invalidJumpRes.body.error.code, 'INVALID_STATUS_TRANSITION');

    // 2. DRAFT -> PUBLISHED fails if competition has 0 questions
    const publishEmptyRes = await makeRequest(app, 'PATCH', `/api/v1/admin/competitions/${lifecycleComp._id}/status`, {
      cookie: adminCookie,
      body: { status: 'PUBLISHED' }
    });
    assert.equal(publishEmptyRes.status, 400);
    assert.equal(publishEmptyRes.body.error.code, 'CANNOT_PUBLISH_EMPTY_COMPETITION');

    // Add a question
    await Question.create({
      competitionId: lifecycleComp._id,
      prompt: 'Valid prompt for publishing test',
      options: [
        { key: 'A', text: 'Option 1' },
        { key: 'B', text: 'Option 2' },
        { key: 'C', text: 'Option 3' },
        { key: 'D', text: 'Option 4' }
      ],
      correctOption: 'A',
      marks: 1,
      classOrGrade: 'Class 10'
    });

    // Now DRAFT -> PUBLISHED succeeds
    const publishRes = await makeRequest(app, 'PATCH', `/api/v1/admin/competitions/${lifecycleComp._id}/status`, {
      cookie: adminCookie,
      body: { status: 'PUBLISHED' }
    });
    assert.equal(publishRes.status, 200);
    assert.equal(publishRes.body.competition.status, 'PUBLISHED');

    // Register a student
    await Registration.create({
      competitionId: lifecycleComp._id,
      studentId: studentUserA._id,
      rollNumber: 'EC-2027-9999',
      examMode: 'ONLINE_MCQ'
    });

    // 3. PUBLISHED -> DRAFT is REJECTED because registrations exist!
    const revertWithRegsRes = await makeRequest(app, 'PATCH', `/api/v1/admin/competitions/${lifecycleComp._id}/status`, {
      cookie: adminCookie,
      body: { status: 'DRAFT' }
    });
    assert.equal(revertWithRegsRes.status, 400);
    assert.equal(revertWithRegsRes.body.error.code, 'CANNOT_REVERT_WITH_REGISTRATIONS');

    // 4. PUBLISHED -> CLOSED succeeds
    const closeRes = await makeRequest(app, 'PATCH', `/api/v1/admin/competitions/${lifecycleComp._id}/status`, {
      cookie: adminCookie,
      body: { status: 'CLOSED' }
    });
    assert.equal(closeRes.status, 200);

    // 5. CLOSED -> ARCHIVED succeeds
    const archiveRes = await makeRequest(app, 'PATCH', `/api/v1/admin/competitions/${lifecycleComp._id}/status`, {
      cookie: adminCookie,
      body: { status: 'ARCHIVED' }
    });
    assert.equal(archiveRes.status, 200);

    // 6. ARCHIVED -> PUBLISHED is REJECTED because ARCHIVED is terminal
    const unarchiveRes = await makeRequest(app, 'PATCH', `/api/v1/admin/competitions/${lifecycleComp._id}/status`, {
      cookie: adminCookie,
      body: { status: 'PUBLISHED' }
    });
    assert.equal(unarchiveRes.status, 400);
    assert.equal(unarchiveRes.body.error.code, 'ARCHIVED_COMPETITION');
  });

  // =========================================================================
  // E. Question Bank Validation & Integrity
  // =========================================================================
  await suite.test('E1. Question validation enforces 4 options, valid keys, and negative mark bounds', async () => {
    const qComp = await Competition.create({
      title: 'AuditTest_QuestionValidation_Comp',
      description: 'Testing question rules',
      examDate: new Date('2027-02-10T10:00:00.000Z'),
      durationMinutes: 60,
      mode: 'ONLINE_MCQ',
      eligibleClasses: ['Class 10'],
      totalMarks: 50,
      registrationOpensAt: new Date('2026-11-01T00:00:00.000Z'),
      registrationClosesAt: new Date('2026-12-31T23:59:59.000Z'),
      status: 'DRAFT',
      createdBy: adminUser._id
    });

    // 1. Missing option D (only 3 options)
    const threeOptsRes = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${qComp._id}/questions`, {
      cookie: adminCookie,
      body: {
        prompt: 'Invalid 3-option question',
        options: [
          { key: 'A', text: 'Opt A' },
          { key: 'B', text: 'Opt B' },
          { key: 'C', text: 'Opt C' }
        ],
        correctOption: 'A',
        marks: 1
      }
    });
    assert.equal(threeOptsRes.status, 400);
    assert.equal(threeOptsRes.body.error.code, 'VALIDATION_ERROR');

    // 2. Negative marks exceeding positive marks
    const excessiveNegRes = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${qComp._id}/questions`, {
      cookie: adminCookie,
      body: {
        prompt: 'Excessive negative penalty question',
        options: [
          { key: 'A', text: 'Opt A' },
          { key: 'B', text: 'Opt B' },
          { key: 'C', text: 'Opt C' },
          { key: 'D', text: 'Opt D' }
        ],
        correctOption: 'A',
        marks: 1,
        negativeMarks: 5.0 // Exceeds positive marks!
      }
    });
    assert.equal(excessiveNegRes.status, 400);
    assert.ok(excessiveNegRes.body.error.message.includes('cannot exceed positive marks'));

    // 3. Invalid correctOption key 'E'
    const invalidKeyRes = await makeRequest(app, 'POST', `/api/v1/admin/competitions/${qComp._id}/questions`, {
      cookie: adminCookie,
      body: {
        prompt: 'Invalid correct answer key',
        options: [
          { key: 'A', text: 'Opt A' },
          { key: 'B', text: 'Opt B' },
          { key: 'C', text: 'Opt C' },
          { key: 'D', text: 'Opt D' }
        ],
        correctOption: 'E',
        marks: 1
      }
    });
    assert.equal(invalidKeyRes.status, 400);
  });

  await suite.test('E2. Cannot delete the only question of a PUBLISHED competition', async () => {
    const singleQComp = await Competition.create({
      title: 'AuditTest_SingleQ_Comp',
      description: 'Single question published test',
      examDate: new Date('2027-03-10T10:00:00.000Z'),
      durationMinutes: 60,
      mode: 'ONLINE_MCQ',
      eligibleClasses: ['Class 10'],
      totalMarks: 10,
      registrationOpensAt: new Date('2026-11-01T00:00:00.000Z'),
      registrationClosesAt: new Date('2026-12-31T23:59:59.000Z'),
      status: 'PUBLISHED',
      createdBy: adminUser._id
    });

    const soleQuestion = await Question.create({
      competitionId: singleQComp._id,
      prompt: 'The only question in published competition',
      options: [
        { key: 'A', text: 'A' },
        { key: 'B', text: 'B' },
        { key: 'C', text: 'C' },
        { key: 'D', text: 'D' }
      ],
      correctOption: 'A',
      marks: 10
    });

    // Attempting to delete the only question in a published competition is rejected
    const delRes = await makeRequest(app, 'DELETE', `/api/v1/admin/questions/${soleQuestion._id}`, {
      cookie: adminCookie
    });
    assert.equal(delRes.status, 400);
    assert.equal(delRes.body.error.code, 'CANNOT_DELETE_LAST_QUESTION');
  });

  // =========================================================================
  // F. Registration Privacy & Isolation
  // =========================================================================
  await suite.test('F1. Student A sees only Student A registrations; never Student B records', async () => {
    const privComp = await Competition.create({
      title: 'AuditTest_Privacy_Comp',
      description: 'Privacy verification',
      examDate: new Date('2027-04-10T10:00:00.000Z'),
      durationMinutes: 60,
      mode: 'ONLINE_MCQ',
      eligibleClasses: ['Class 10'],
      totalMarks: 50,
      registrationOpensAt: new Date('2026-11-01T00:00:00.000Z'),
      registrationClosesAt: new Date('2026-12-31T23:59:59.000Z'),
      status: 'PUBLISHED',
      createdBy: adminUser._id
    });

    // Register Student A
    await Registration.create({
      competitionId: privComp._id,
      studentId: studentUserA._id,
      rollNumber: 'EC-2027-0101',
      examMode: 'ONLINE_MCQ'
    });

    // Register Student B
    await Registration.create({
      competitionId: privComp._id,
      studentId: studentUserB._id,
      rollNumber: 'EC-2027-0102',
      examMode: 'ONLINE_MCQ'
    });

    // Student A calls /api/v1/me/registrations
    const resA = await makeRequest(app, 'GET', '/api/v1/me/registrations', {
      cookie: studentCookieA
    });
    assert.equal(resA.status, 200);
    const rollsA = resA.body.registrations.map((r) => r.rollNumber);
    assert.ok(rollsA.includes('EC-2027-0101'), 'Student A must see their own roll number');
    assert.ok(!rollsA.includes('EC-2027-0102'), 'Student A must NEVER see Student B roll number');

    // Student B calls /api/v1/me/registrations
    const resB = await makeRequest(app, 'GET', '/api/v1/me/registrations', {
      cookie: studentCookieB
    });
    assert.equal(resB.status, 200);
    const rollsB = resB.body.registrations.map((r) => r.rollNumber);
    assert.ok(rollsB.includes('EC-2027-0102'), 'Student B must see their own roll number');
    assert.ok(!rollsB.includes('EC-2027-0101'), 'Student B must NEVER see Student A roll number');
  });
});
