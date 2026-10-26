import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Competition } from '../src/models/competition.model.js';
import { Registration } from '../src/models/registration.model.js';
import { Question } from '../src/models/question.model.js';
import { config } from '../src/config/env.js';
import {
  computeOmrSignature,
  createOmrTokenPayload,
  verifyOmrTokenPayload,
  generateOmrQrBuffer
} from '../src/services/omrToken.service.js';
import {
  OMR_LAYOUT_SPEC,
  generateGenericOmrPdf,
  generatePersonalizedOmrPdf
} from '../src/services/omrPdfGenerator.service.js';

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
    const contentType = response.headers.get('content-type') || '';

    let data;
    if (contentType.includes('application/pdf')) {
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

test('PHASE 6.2: Printable Generic & Personalized OMR PDF Generation', async (suite) => {
  let adminCookie = null;
  let studentCookie = null;
  let competition = null;
  let student = null;
  let registration = null;

  suite.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect(MONGODB_URI);
    }

    // Clean up test entities
    await User.deleteMany({ mobileNormalized: { $regex: /^9999444/ } });
    await Competition.deleteMany({ title: { $regex: /^Phase6_2Test_/ } });

    const passwordHash = await bcrypt.hash('Phase62Pass@123', 8);

    // 1. Create Admin
    await User.create({
      fullName: 'Phase 6.2 Admin Controller',
      mobile: '+91 9999444001',
      mobileNormalized: '9999444001',
      role: 'admin',
      passwordHash,
      isActive: true,
      classOrGrade: 'Admin Office',
      school: 'HQ'
    });

    // 2. Create Student
    student = await User.create({
      fullName: 'Ananya Sharma',
      mobile: '+91 9999444002',
      mobileNormalized: '9999444002',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Delhi Public School'
    });

    const login = async (mobile) => {
      const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
        body: { mobile, password: 'Phase62Pass@123' }
      });
      const cookieHeader = res.headers.get('set-cookie');
      return cookieHeader ? cookieHeader.split(';')[0] : `${config.cookieName}=${res.body.token}`;
    };

    adminCookie = await login('9999444001');
    studentCookie = await login('9999444002');

    // 3. Create Competition
    const now = new Date();
    competition = await Competition.create({
      title: `Phase6_2Test_Competition_${Date.now()}`,
      titleEn: 'Talent Search Exam 2026',
      titleHi: 'प्रतिभा खोज परीक्षा २०२६',
      examDate: new Date(now.getTime() + 86400000),
      examStartsAt: new Date(now.getTime() + 86400000),
      examEndsAt: new Date(now.getTime() + 90000000),
      registrationOpensAt: new Date(now.getTime() - 86400000),
      registrationClosesAt: new Date(now.getTime() + 43200000),
      durationMinutes: 90,
      mode: 'BOTH',
      status: 'PUBLISHED',
      resultStatus: 'NOT_EVALUATED',
      eligibleClasses: ['Class 10'],
      totalMarks: 50,
      marksPerQuestion: 2,
      isPublicMeritListEnabled: false
    });

    // 4. Create Registration
    registration = await Registration.create({
      competitionId: competition._id,
      studentId: student._id,
      rollNumber: 'OMR-62-001',
      examMode: 'OMR',
      status: 'registered',
      omrSheetToken: 'tok_sec_1234567890abcdef'
    });

    // 5. Create Sample Questions with all 4 options
    await Question.create([
      {
        competitionId: competition._id,
        order: 1,
        prompt: 'Sample Q1',
        options: [
          { key: 'A', text: 'Option A' },
          { key: 'B', text: 'Option B' },
          { key: 'C', text: 'Option C' },
          { key: 'D', text: 'Option D' }
        ],
        correctOption: 'A',
        marks: 2
      },
      {
        competitionId: competition._id,
        order: 2,
        prompt: 'Sample Q2',
        options: [
          { key: 'A', text: 'Option A' },
          { key: 'B', text: 'Option B' },
          { key: 'C', text: 'Option C' },
          { key: 'D', text: 'Option D' }
        ],
        correctOption: 'B',
        marks: 2
      }
    ]);
  });

  suite.after(async () => {
    try {
      await User.deleteMany({ mobileNormalized: { $regex: /^9999444/ } });
      if (competition?._id) {
        await Competition.deleteOne({ _id: competition._id });
        await Registration.deleteMany({ competitionId: competition._id });
        await Question.deleteMany({ competitionId: competition._id });
      }
    } finally {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    }
  });

  // ==========================================
  // SECTION 1: QR SECURITY & HMAC CRYPTOGRAPHY
  // ==========================================
  await suite.test('1.1: createOmrTokenPayload generates compact payload with zero student PII', () => {
    const payload = createOmrTokenPayload({
      competitionId: competition._id,
      registrationId: registration._id,
      omrSheetToken: registration.omrSheetToken
    });

    assert.equal(payload.v, 1);
    assert.equal(payload.cid, competition._id.toString());
    assert.equal(payload.rid, registration._id.toString());
    assert.equal(payload.tok, registration.omrSheetToken);
    assert.ok(payload.sig && payload.sig.length === 16);

    // Assert zero PII
    assert.equal(payload.name, undefined);
    assert.equal(payload.studentName, undefined);
    assert.equal(payload.mobile, undefined);
    assert.equal(payload.rollNumber, undefined);
    assert.equal(payload.school, undefined);
  });

  await suite.test('1.2: verifyOmrTokenPayload accepts valid token payload', () => {
    const payload = createOmrTokenPayload({
      competitionId: competition._id,
      registrationId: registration._id,
      omrSheetToken: registration.omrSheetToken
    });

    const result = verifyOmrTokenPayload(payload);
    assert.equal(result.valid, true);
    assert.equal(result.competitionId, competition._id.toString());
    assert.equal(result.registrationId, registration._id.toString());
    assert.equal(result.omrSheetToken, registration.omrSheetToken);
  });

  await suite.test('1.3: verifyOmrTokenPayload rejects tampered signature or data', () => {
    const payload = createOmrTokenPayload({
      competitionId: competition._id,
      registrationId: registration._id,
      omrSheetToken: registration.omrSheetToken
    });

    // 1. Tampered signature
    const tamperedSig = { ...payload, sig: 'ffffffffffffffff' };
    assert.equal(verifyOmrTokenPayload(tamperedSig).valid, false);

    // 2. Tampered registration ID
    const tamperedRid = { ...payload, rid: '600000000000000000000000' };
    assert.equal(verifyOmrTokenPayload(tamperedRid).valid, false);

    // 3. Tampered secret key (rotation test)
    assert.equal(verifyOmrTokenPayload(payload, 'wrong_secret_key').valid, false);
  });

  await suite.test('1.4: generateOmrQrBuffer creates valid high-contrast PNG buffer', async () => {
    const payload = createOmrTokenPayload({
      competitionId: competition._id,
      registrationId: registration._id,
      omrSheetToken: registration.omrSheetToken
    });

    const pngBuffer = await generateOmrQrBuffer(payload);
    assert.ok(Buffer.isBuffer(pngBuffer));
    assert.ok(pngBuffer.length > 500);

    // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const pngMagic = pngBuffer.subarray(0, 8);
    assert.deepEqual(Array.from(pngMagic), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  // ==========================================
  // SECTION 2: PDF GENERATION ENGINE & GEOMETRY
  // ==========================================
  await suite.test('2.1: OMR_LAYOUT_SPEC exports canonical A4 coordinates and fiducials', () => {
    assert.equal(OMR_LAYOUT_SPEC.version, 'LAYOUT_A4_V1');
    assert.equal(OMR_LAYOUT_SPEC.page.size, 'A4');
    assert.equal(OMR_LAYOUT_SPEC.page.width, 595.28);
    assert.equal(OMR_LAYOUT_SPEC.page.height, 841.89);

    const { topLeft, topRight, bottomLeft, bottomRight, size } = OMR_LAYOUT_SPEC.fiducials;
    assert.equal(size, 26);
    assert.equal(topLeft.x, 25);
    assert.equal(topLeft.y, 25);
    assert.equal(topRight.x, 544.28);
    assert.equal(topRight.y, 25);
    assert.equal(bottomLeft.x, 25);
    assert.equal(bottomLeft.y, 790.89);
    assert.equal(bottomRight.x, 544.28);
    assert.equal(bottomRight.y, 790.89);
  });

  await suite.test('2.2: generateGenericOmrPdf produces valid PDF buffer', async () => {
    const pdfBuffer = await generateGenericOmrPdf({ competition, totalQuestions: 50 });
    assert.ok(Buffer.isBuffer(pdfBuffer));
    assert.ok(pdfBuffer.length > 5000);

    // Verify PDF header %PDF-
    const header = pdfBuffer.subarray(0, 5).toString('ascii');
    assert.equal(header, '%PDF-');
  });

  await suite.test('2.3: generatePersonalizedOmrPdf produces valid PDF buffer with embedded QR', async () => {
    const pdfBuffer = await generatePersonalizedOmrPdf({
      competition,
      registration,
      student,
      totalQuestions: 50
    });
    assert.ok(Buffer.isBuffer(pdfBuffer));
    assert.ok(pdfBuffer.length > 5000);

    const header = pdfBuffer.subarray(0, 5).toString('ascii');
    assert.equal(header, '%PDF-');
  });

  // ==========================================
  // SECTION 3: PROTECTED ADMIN ENDPOINTS & RBAC
  // ==========================================
  await suite.test('3.1: Unauthenticated request to generic PDF returns 401', async () => {
    const res = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${competition._id}/omr/template-generic-pdf`
    );
    assert.equal(res.status, 401);
  });

  await suite.test('3.2: Student role requesting generic PDF is denied (HTTP 403)', async () => {
    const res = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${competition._id}/omr/template-generic-pdf`,
      { cookie: studentCookie }
    );
    assert.equal(res.status, 403);
  });

  await suite.test('3.3: Admin downloads generic OMR PDF successfully (HTTP 200, application/pdf)', async () => {
    const res = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${competition._id}/omr/template-generic-pdf`,
      { cookie: adminCookie }
    );

    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/pdf'));
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.subarray(0, 5).toString('ascii'), '%PDF-');
  });

  await suite.test('3.4: Admin downloads personalized OMR PDF and audit metadata is recorded', async () => {
    const res = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${competition._id}/omr/template-personalized-pdf/${registration._id}`,
      { cookie: adminCookie }
    );

    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/pdf'));
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.subarray(0, 5).toString('ascii'), '%PDF-');

    // Verify registration audit fields updated
    const freshReg = await Registration.findById(registration._id);
    assert.ok(freshReg.omrSheetGeneratedAt);
    assert.ok(freshReg.omrSheetGeneratedBy);
  });

  await suite.test('3.5: Requesting personalized PDF with invalid registration ID returns 404', async () => {
    const fakeRegId = new mongoose.Types.ObjectId();
    const res = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${competition._id}/omr/template-personalized-pdf/${fakeRegId}`,
      { cookie: adminCookie }
    );
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'REGISTRATION_NOT_FOUND');
  });
});
