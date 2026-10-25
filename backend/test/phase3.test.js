import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Competition } from '../src/models/competition.model.js';
import { Question } from '../src/models/question.model.js';
import { Registration } from '../src/models/registration.model.js';
import { connectDB, disconnectDB } from '../src/config/database.js';

test('PHASE 3: Competition Management & Question Bank Integration Tests', async (t) => {
  await connectDB();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  // Deterministic unique mobile numbers
  const studentMobile10 = '9875' + Math.floor(100000 + Math.random() * 900000); // Class 10 student
  const studentMobile8 = '9876' + Math.floor(100000 + Math.random() * 900000);  // Class 8 student (Ineligible)
  const adminMobile = '9877' + Math.floor(100000 + Math.random() * 900000);

  let student10Token = '';
  let student8Token = '';
  let adminToken = '';
  let student10Cookie = '';
  let adminCookie = '';

  let createdCompetitionId = '';
  let draftCompetitionId = '';
  let expiredCompetitionId = '';
  let createdQuestionId = '';

  t.after(async () => {
    // Cleanup test records
    await User.deleteMany({
      mobileNormalized: { $in: [studentMobile10, studentMobile8, adminMobile] }
    });
    if (createdCompetitionId) {
      await Competition.deleteOne({ _id: createdCompetitionId });
      await Question.deleteMany({ competitionId: createdCompetitionId });
      await Registration.deleteMany({ competitionId: createdCompetitionId });
    }
    if (draftCompetitionId) {
      await Competition.deleteOne({ _id: draftCompetitionId });
    }
    if (expiredCompetitionId) {
      await Competition.deleteOne({ _id: expiredCompetitionId });
      await Registration.deleteMany({ competitionId: expiredCompetitionId });
    }
    server.close();
    await disconnectDB();
  });

  // --- SETUP TEST USERS ---
  const salt = await bcrypt.genSalt(10);
  const passHash = await bcrypt.hash('TestSecurePass@123', salt);

  // 1. Eligible Student (Class 10)
  const student10 = await User.create({
    fullName: 'Rohan Sharma',
    mobile: `+91 ${studentMobile10}`,
    mobileNormalized: studentMobile10,
    school: 'Adarsh High School',
    classOrGrade: 'Class 10',
    passwordHash: passHash,
    role: 'student',
    isActive: true
  });

  // 2. Ineligible Student (Class 8)
  const student8 = await User.create({
    fullName: 'Priya Patel',
    mobile: `+91 ${studentMobile8}`,
    mobileNormalized: studentMobile8,
    school: 'Primary Model School',
    classOrGrade: 'Class 8',
    passwordHash: passHash,
    role: 'student',
    isActive: true
  });

  // 3. Admin User
  const adminUser = await User.create({
    fullName: 'Super Administrator',
    mobile: `+91 ${adminMobile}`,
    mobileNormalized: adminMobile,
    school: 'Education Committee Central HQ',
    classOrGrade: 'Chief Administrator',
    passwordHash: passHash,
    role: 'admin',
    isActive: true
  });

  // Login both to get tokens
  const loginS10 = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: studentMobile10, password: 'TestSecurePass@123' })
  });
  const dataS10 = await loginS10.json();
  student10Token = dataS10.token;
  student10Cookie = loginS10.headers.get('set-cookie')?.split(';')[0];

  const loginS8 = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: studentMobile8, password: 'TestSecurePass@123' })
  });
  const dataS8 = await loginS8.json();
  student8Token = dataS8.token;

  const loginAdmin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: adminMobile, password: 'TestSecurePass@123' })
  });
  const dataAdmin = await loginAdmin.json();
  adminToken = dataAdmin.token;
  adminCookie = loginAdmin.headers.get('set-cookie')?.split(';')[0];

  // =========================================================================
  // TEST 1: Admin creates competition
  // =========================================================================
  await t.test('1. Admin creates competition successfully in DRAFT status', async () => {
    const now = Date.now();
    const payload = {
      title: 'Annual State Math Olympiad 2026',
      description: 'Comprehensive math scholarship competition for secondary students.',
      durationMinutes: 60,
      mode: 'BOTH',
      eligibleClasses: ['Class 9', 'Class 10', 'Class 11'],
      totalMarks: 50,
      marksPerQuestion: 2,
      negativeMarking: { enabled: true, perWrongMark: 0.5 },
      registrationOpensAt: new Date(now - 24 * 3600 * 1000).toISOString(),
      registrationClosesAt: new Date(now + 10 * 24 * 3600 * 1000).toISOString(),
      examStartsAt: new Date(now + 15 * 24 * 3600 * 1000).toISOString(),
      startTime: '10:00 AM',
      endTime: '11:00 AM',
      instructions: [
        'Use black or blue ballpoint pen for OMR.',
        'Online exam requires stable network connection.'
      ]
    };

    const response = await fetch(`${baseUrl}/admin/competitions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(payload)
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.ok(body.competition);
    assert.equal(body.competition.title, 'Annual State Math Olympiad 2026');
    assert.equal(body.competition.status, 'DRAFT');
    assert.equal(body.competition.mode, 'BOTH');
    assert.deepEqual(body.competition.eligibleClasses, ['Class 9', 'Class 10', 'Class 11']);

    createdCompetitionId = body.competition.id;
  });

  // =========================================================================
  // TEST 2: Student cannot create competition
  // =========================================================================
  await t.test('2. Student cannot create competition (HTTP 403 Forbidden)', async () => {
    const payload = {
      title: 'Illegal Student-Created Competition',
      durationMinutes: 60,
      mode: 'BOTH',
      eligibleClasses: ['Class 10'],
      registrationOpensAt: new Date().toISOString(),
      registrationClosesAt: new Date(Date.now() + 86400000).toISOString(),
      examStartsAt: new Date(Date.now() + 172800000).toISOString()
    };

    const response = await fetch(`${baseUrl}/admin/competitions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${student10Token}`
      },
      body: JSON.stringify(payload)
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  // =========================================================================
  // TEST 3: Admin creates question
  // =========================================================================
  await t.test('3. Admin creates question in Question Bank for the competition', async () => {
    const questionPayload = {
      prompt: 'What is the sum of angles in a triangle?',
      options: [
        { key: 'A', text: '90 degrees' },
        { key: 'B', text: '180 degrees' },
        { key: 'C', text: '270 degrees' },
        { key: 'D', text: '360 degrees' }
      ],
      correctOption: 'B',
      marks: 2,
      negativeMarks: 0.5,
      explanation: 'The interior angles of any Euclidean triangle always sum to exactly 180 degrees.',
      subject: 'Mathematics',
      topic: 'Geometry',
      classOrGrade: 'Class 10'
    };

    const response = await fetch(`${baseUrl}/admin/competitions/${createdCompetitionId}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(questionPayload)
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.ok(body.question);
    assert.equal(body.question.prompt, questionPayload.prompt);
    assert.equal(body.question.correctOption, 'B'); // Admin can view correct answer
    assert.equal(body.question.marks, 2);

    createdQuestionId = body.question.id;
  });

  // Publish competition for subsequent tests
  const pubRes = await fetch(`${baseUrl}/admin/competitions/${createdCompetitionId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ status: 'PUBLISHED' })
  });
  assert.equal(pubRes.status, 200);

  // Create an unpublished DRAFT competition to verify gating
  const draftComp = await Competition.create({
    title: 'Secret Draft Competition Not Ready',
    durationMinutes: 45,
    mode: 'ONLINE_MCQ',
    eligibleClasses: ['Class 10'],
    examDate: new Date(Date.now() + 20 * 86400000),
    examStartsAt: new Date(Date.now() + 20 * 86400000),
    registrationOpensAt: new Date(Date.now() - 86400000),
    registrationClosesAt: new Date(Date.now() + 10 * 86400000),
    status: 'DRAFT'
  });
  draftCompetitionId = draftComp._id.toString();

  // =========================================================================
  // TEST 4: Student APIs never expose correct answers
  // =========================================================================
  await t.test('4. CRITICAL SECURITY: Student / Public APIs never expose correct answers', async () => {
    // 1. Check competition details endpoint
    const compRes = await fetch(`${baseUrl}/competitions/${createdCompetitionId}`);
    assert.equal(compRes.status, 200);
    const compBody = await compRes.json();
    assert.equal(compBody.competition.correctOption, undefined);
    assert.equal(compBody.competition.answerKey, undefined);

    // 2. Query Question directly in DB as student query serializer
    const dbQuestion = await Question.findById(createdQuestionId);
    const studentView = dbQuestion.toStudentJSON();

    assert.equal(studentView.correctOption, undefined, 'correctOption must NEVER be present');
    assert.equal(studentView.explanation, undefined, 'explanation must NEVER be present');
    assert.equal(studentView.options.length, 4);
    assert.equal(studentView.prompt, 'What is the sum of angles in a triangle?');
  });

  // =========================================================================
  // TEST 5: Student views published competitions
  // =========================================================================
  await t.test('5. Student views published competitions', async () => {
    const response = await fetch(`${baseUrl}/competitions`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.competitions));
    const foundPublished = body.competitions.find((c) => c.id === createdCompetitionId);
    assert.ok(foundPublished, 'Published competition must be in public list');
    assert.equal(foundPublished.status, 'PUBLISHED');
  });

  // =========================================================================
  // TEST 6: Student cannot view unpublished competitions
  // =========================================================================
  await t.test('6. Student cannot view unpublished competitions (DRAFT / ARCHIVED)', async () => {
    // Public list should not include draft competition
    const listRes = await fetch(`${baseUrl}/competitions`);
    const listBody = await listRes.json();
    const foundDraft = listBody.competitions.find((c) => c.id === draftCompetitionId);
    assert.equal(foundDraft, undefined, 'Draft competition must NEVER appear in public list');

    // Querying draft by ID returns 404
    const singleRes = await fetch(`${baseUrl}/competitions/${draftCompetitionId}`);
    assert.equal(singleRes.status, 404);
  });

  // =========================================================================
  // TEST 7: Student registers successfully
  // =========================================================================
  await t.test('7. Eligible Student registers successfully with valid Roll Number', async () => {
    const response = await fetch(`${baseUrl}/competitions/${createdCompetitionId}/registrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${student10Token}`
      },
      body: JSON.stringify({
        examMode: 'ONLINE_MCQ'
      })
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.ok(body.registration);
    assert.ok(body.registration.rollNumber.startsWith('EC-2026-'));
    assert.equal(body.registration.examMode, 'ONLINE_MCQ');
    assert.equal(body.registration.examModeLocked, true);
  });

  // =========================================================================
  // TEST 8: Duplicate registration is rejected
  // =========================================================================
  await t.test('8. Duplicate registration by same student is rejected (HTTP 409 Conflict)', async () => {
    const response = await fetch(`${baseUrl}/competitions/${createdCompetitionId}/registrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${student10Token}`
      },
      body: JSON.stringify({
        examMode: 'OMR'
      })
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, 'CONFLICT');
    assert.ok(body.error.message.includes('already registered'));
  });

  // =========================================================================
  // TEST 9: Ineligible class registration is rejected
  // =========================================================================
  await t.test('9. Ineligible class student is rejected (HTTP 403 Forbidden)', async () => {
    // student8 is Class 8, but competition is for Class 9, 10, 11
    const response = await fetch(`${baseUrl}/competitions/${createdCompetitionId}/registrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${student8Token}`
      },
      body: JSON.stringify({
        examMode: 'OMR'
      })
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, 'INELIGIBLE_CLASS');
    assert.ok(body.error.message.includes('not eligible'));
  });

  // =========================================================================
  // TEST 10: Registration deadline is enforced
  // =========================================================================
  await t.test('10. Registration deadline is strictly enforced (HTTP 400 Registration Closed)', async () => {
    // Create an expired competition (deadline in the past)
    const expiredComp = await Competition.create({
      title: 'Past Deadline Competition',
      durationMinutes: 60,
      mode: 'ONLINE_MCQ',
      eligibleClasses: ['Class 10'],
      examDate: new Date(Date.now() + 5 * 86400000),
      examStartsAt: new Date(Date.now() + 5 * 86400000),
      registrationOpensAt: new Date(Date.now() - 10 * 86400000),
      registrationClosesAt: new Date(Date.now() - 2 * 86400000), // CLOSED 2 days ago
      status: 'PUBLISHED'
    });
    expiredCompetitionId = expiredComp._id.toString();

    const response = await fetch(`${baseUrl}/competitions/${expiredCompetitionId}/registrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${student10Token}`
      },
      body: JSON.stringify({
        examMode: 'ONLINE_MCQ'
      })
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'REGISTRATION_CLOSED');
  });

  // =========================================================================
  // TEST 11: Exam mode selection is locked
  // =========================================================================
  await t.test('11. Exam mode selection is confirmed and locked upon registration', async () => {
    const reg = await Registration.findOne({
      competitionId: createdCompetitionId,
      studentId: student10._id
    });

    assert.ok(reg);
    assert.equal(reg.examMode, 'ONLINE_MCQ');
    assert.equal(reg.examModeLocked, true);
    assert.ok(reg.examModeLockedAt);
  });

  // =========================================================================
  // TEST 12: Admin can edit questions
  // =========================================================================
  await t.test('12. Admin can edit existing questions in Question Bank', async () => {
    const updatePayload = {
      prompt: 'What is the sum of interior angles in a plane triangle?',
      options: [
        { key: 'A', text: '90°' },
        { key: 'B', text: '180°' },
        { key: 'C', text: '270°' },
        { key: 'D', text: '360°' }
      ],
      correctOption: 'B',
      marks: 3,
      negativeMarks: 1,
      explanation: 'Updated detailed mathematical explanation.'
    };

    const response = await fetch(`${baseUrl}/admin/questions/${createdQuestionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(updatePayload)
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.question.prompt, updatePayload.prompt);
    assert.equal(body.question.marks, 3);
    assert.equal(body.question.negativeMarks, 1);
  });
});
