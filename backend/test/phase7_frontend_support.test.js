import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Competition } from '../src/models/competition.model.js';
import { Registration } from '../src/models/registration.model.js';

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

test('=== PHASE 7: FRONTEND INTEGRATION & REGISTRATION AUDIT ===', async (suite) => {
  let adminUser;
  let headUser;
  let studentUser;
  let adminCookie;
  let headCookie;
  let studentCookie;
  let testComp;

  suite.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect('mongodb://127.0.0.1:27017/education_committee');
    }

    // Clean up any previous test records
    await User.deleteMany({ mobileNormalized: { $regex: /^999977/ } });
    await Competition.deleteMany({ title: { $regex: /^Phase 7 Registration Audit/ } });

    const timestamp = Date.now();
    const passwordHash = await bcrypt.hash('SecurePass123!', 8);

    adminUser = await User.create({
      fullName: 'Phase 7 Admin User',
      mobile: '+91 9999770001',
      mobileNormalized: '9999770001',
      passwordHash,
      role: 'admin',
      school: 'Admin Command College',
      classOrGrade: 'Admin Grade',
      isActive: true
    });

    headUser = await User.create({
      fullName: 'Phase 7 Committee Head',
      mobile: '+91 9999770002',
      mobileNormalized: '9999770002',
      passwordHash,
      role: 'committee_head',
      school: 'Education Board Central',
      classOrGrade: 'Committee President',
      isActive: true
    });

    studentUser = await User.create({
      fullName: 'Phase 7 Registered Student',
      mobile: '+91 9999770003',
      mobileNormalized: '9999770003',
      passwordHash,
      role: 'student',
      school: 'Delhi Public School',
      classOrGrade: 'Class 10',
      isActive: true
    });

    const login = async (mobile) => {
      const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
        body: { mobile, password: 'SecurePass123!' }
      });
      const cookieHeader = res.headers?.get ? res.headers.get('set-cookie') : res.headers['set-cookie'];
      if (!cookieHeader) return null;
      const raw = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
      return raw.split(';')[0];
    };

    adminCookie = await login('9999770001');
    headCookie = await login('9999770002');
    studentCookie = await login('9999770003');

    const now = new Date();
    testComp = await Competition.create({
      title: `Phase 7 Registration Audit Competition ${timestamp}`,
      code: `P7-${timestamp.toString().slice(-6)}`,
      description: 'Audit test for student registration management endpoint',
      category: 'General',
      examDate: new Date(now.getTime() + 86400000),
      examStartsAt: new Date(now.getTime() - 60000),
      examEndsAt: new Date(now.getTime() + 86400000),
      registrationOpensAt: new Date(now.getTime() - 86400000),
      registrationClosesAt: new Date(now.getTime() + 43200000),
      durationMinutes: 60,
      mode: 'BOTH',
      totalMarks: 50,
      marksPerQuestion: 1,
      negativeMarkingEnabled: false,
      eligibleClasses: ['Class 10'],
      status: 'PUBLISHED',
      resultStatus: 'NOT_EVALUATED',
      isPublicMeritListEnabled: false,
      createdBy: adminUser._id
    });

    // Register student for both modes or single
    await Registration.create({
      competitionId: testComp._id,
      studentId: studentUser._id,
      rollNumber: `P7-${timestamp.toString().slice(-4)}-001`,
      examMode: 'OMR',
      status: 'registered',
      examModeLocked: true
    });
  });

  suite.after(async () => {
    if (testComp) {
      await Registration.deleteMany({ competitionId: testComp._id });
      await Competition.deleteOne({ _id: testComp._id });
    }
    if (adminUser) await User.deleteOne({ _id: adminUser._id });
    if (headUser) await User.deleteOne({ _id: headUser._id });
    if (studentUser) await User.deleteOne({ _id: studentUser._id });
  });

  await suite.test('GET /competitions/:id/registrations succeeds for Admin and populates student details', async () => {
    const res = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${testComp._id}/registrations`,
      { cookie: adminCookie }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.registrations));
    assert.equal(res.body.registrations.length, 1);

    const reg = res.body.registrations[0];
    assert.equal(reg.examMode, 'OMR');
    assert.ok(reg.rollNumber);
    assert.equal(reg.studentId.fullName, studentUser.fullName);
    assert.equal(reg.studentId.school, studentUser.school);
    assert.equal(reg.studentId.classOrGrade, studentUser.classOrGrade);
  });

  await suite.test('GET /competitions/:id/registrations succeeds for Committee Head', async () => {
    const res = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${testComp._id}/registrations`,
      { cookie: headCookie }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.registrations.length, 1);
  });

  await suite.test('GET /competitions/:id/registrations is strictly forbidden for Student role (HTTP 403)', async () => {
    const res = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${testComp._id}/registrations`,
      { cookie: studentCookie }
    );

    assert.equal(res.status, 403);
  });

  await suite.test('GET /competitions/:id/registrations rejects unauthenticated request (HTTP 401)', async () => {
    const res = await makeRequest(
      app,
      'GET',
      `/api/v1/admin/competitions/${testComp._id}/registrations`
    );

    assert.equal(res.status, 401);
  });

  suite.after(async () => {
    await mongoose.disconnect();
  });
});
