import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User, normalizeIndianMobile } from '../src/models/user.model.js';
import { connectDB, disconnectDB } from '../src/config/database.js';

// 1. Mobile Normalizer Unit Tests
test('Mobile Normalizer Unit Tests', () => {
  assert.equal(normalizeIndianMobile('9876543210'), '9876543210');
  assert.equal(normalizeIndianMobile('+91 98765 43210'), '9876543210');
  assert.equal(normalizeIndianMobile('+919876543210'), '9876543210');
  assert.equal(normalizeIndianMobile('09876543210'), '9876543210');
  assert.equal(normalizeIndianMobile('919876543210'), '9876543210');

  // Invalid numbers
  assert.equal(normalizeIndianMobile('1234567890'), null); // starts with 1
  assert.equal(normalizeIndianMobile('5555555555'), null); // starts with 5
  assert.equal(normalizeIndianMobile('987654321'), null);  // 9 digits
  assert.equal(normalizeIndianMobile(''), null);
  assert.equal(normalizeIndianMobile(null), null);
});

// 2. Comprehensive Auth & Authorization Integration Tests
test('Authentication & Role Authorization Integration Tests', async (t) => {
  await connectDB();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  // Deterministic test prefixes
  const studentMobile = '9871' + Math.floor(100000 + Math.random() * 900000);
  const adminMobile = '9872' + Math.floor(100000 + Math.random() * 900000);
  const inactiveMobile = '9873' + Math.floor(100000 + Math.random() * 900000);

  const studentPass = 'Student@Pass123';
  const adminPass = 'Admin@Pass123';

  let studentCookie = '';
  let adminCookie = '';
  let studentToken = '';
  let adminToken = '';

  t.after(async () => {
    // Clean up test records
    await User.deleteMany({
      mobileNormalized: { $in: [studentMobile, adminMobile, inactiveMobile] }
    });
    server.close();
    await disconnectDB();
  });

  // --- REGISTRATION CHECKS ---
  await t.test('1. Student Registration creates student account and returns 201', async () => {
    const payload = {
      fullName: 'Aarav Sharma',
      mobile: `+91 ${studentMobile}`,
      school: 'Kendriya Vidyalaya',
      classOrGrade: 'Class 10',
      password: studentPass,
      confirmPassword: studentPass
    };

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.user.fullName, 'Aarav Sharma');
    assert.equal(body.user.mobileNormalized, studentMobile);
    assert.equal(body.user.role, 'student');
    assert.equal(body.user.passwordHash, undefined);
  });

  await t.test('2. Public Registration Security: Cannot inject admin role', async () => {
    const exploitMobile = '9874' + Math.floor(100000 + Math.random() * 900000);
    const payload = {
      fullName: 'Attacker Attempting Admin',
      mobile: exploitMobile,
      school: 'Hacker School',
      classOrGrade: '12th',
      password: 'Pass@1234567',
      confirmPassword: 'Pass@1234567',
      role: 'admin' // Attempted exploit
    };

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.user.role, 'student', 'Role must strictly be student');

    // Clean up exploit user
    await User.deleteOne({ mobileNormalized: exploitMobile });
  });

  await t.test('3. Duplicate mobile registration returns 409 Conflict', async () => {
    const payload = {
      fullName: 'Duplicate Student',
      mobile: studentMobile,
      school: 'Other School',
      classOrGrade: 'Class 9',
      password: studentPass,
      confirmPassword: studentPass
    };

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, 'CONFLICT');
  });

  // --- SEED ADMIN USER & INACTIVE USER IN DB ---
  const salt = await bcrypt.genSalt(10);
  const adminHash = await bcrypt.hash(adminPass, salt);
  await User.create({
    fullName: 'Committee Chief Admin',
    mobile: adminMobile,
    mobileNormalized: adminMobile,
    school: 'Education Committee HQ',
    classOrGrade: 'Administration',
    passwordHash: adminHash,
    role: 'admin',
    isActive: true
  });

  const inactiveHash = await bcrypt.hash('InactivePass123', salt);
  await User.create({
    fullName: 'Suspended Student',
    mobile: inactiveMobile,
    mobileNormalized: inactiveMobile,
    school: 'Former School',
    classOrGrade: 'Class 8',
    passwordHash: inactiveHash,
    role: 'student',
    isActive: false // Deactivated
  });

  // --- PART 4 & 5: LOGIN TESTS ---
  await t.test('4. Correct student login returns 200, safe profile, and HttpOnly cookie', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: `+91 ${studentMobile}`,
        password: studentPass
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.user.fullName, 'Aarav Sharma');
    assert.equal(body.user.role, 'student');
    assert.equal(body.user.passwordHash, undefined);
    assert.ok(body.token, 'Token must be returned');

    studentToken = body.token;

    // Check Set-Cookie header
    const rawCookie = response.headers.get('set-cookie');
    assert.ok(rawCookie, 'Set-Cookie header must be present');
    assert.ok(rawCookie.includes('auth_token='), 'Cookie name must be auth_token');
    assert.ok(rawCookie.toLowerCase().includes('httponly'), 'Cookie must be HttpOnly');
    assert.ok(rawCookie.toLowerCase().includes('samesite=lax'), 'Cookie must have SameSite=lax');

    // Extract cookie for subsequent calls
    studentCookie = rawCookie.split(';')[0];
  });

  await t.test('5. Incorrect password returns generic 401 UNAUTHENTICATED error', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: studentMobile,
        password: 'WrongPassword999'
      })
    });

    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
    assert.equal(body.error.message, 'Invalid mobile number or password.');
  });

  await t.test('6. Unknown mobile number returns generic 401 UNAUTHENTICATED error', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: '9879999999', // Not in database
        password: 'AnyPassword123'
      })
    });

    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
    assert.equal(body.error.message, 'Invalid mobile number or password.');
  });

  await t.test('7. Inactive user login returns 403 ACCOUNT_INACTIVE', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: inactiveMobile,
        password: 'InactivePass123'
      })
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, 'ACCOUNT_INACTIVE');
    assert.ok(body.error.message.includes('deactivated'));
  });

  await t.test('8. Successful Admin login returns 200, admin role, and HttpOnly cookie', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: adminMobile,
        password: adminPass
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.user.role, 'admin');
    assert.equal(body.user.fullName, 'Committee Chief Admin');

    adminToken = body.token;
    const rawCookie = response.headers.get('set-cookie');
    assert.ok(rawCookie);
    adminCookie = rawCookie.split(';')[0];
  });

  // --- PART 6: AUTHORIZATION & PROTECTED ROUTES ---
  await t.test('9. Unauthenticated request to /auth/me returns 401', async () => {
    const response = await fetch(`${baseUrl}/auth/me`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  await t.test('10. Student accessing /auth/me returns only their own profile', async () => {
    // Via cookie
    const response = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: studentCookie }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.user.fullName, 'Aarav Sharma');
    assert.equal(body.user.role, 'student');
    assert.equal(body.user.mobileNormalized, studentMobile);
    assert.equal(body.user.passwordHash, undefined);
  });

  await t.test('11. Admin accessing /auth/me returns correct admin role and profile', async () => {
    // Via Bearer header
    const response = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.user.fullName, 'Committee Chief Admin');
    assert.equal(body.user.role, 'admin');
    assert.equal(body.user.passwordHash, undefined);
  });

  await t.test('12. Student denied access to Admin-only route (HTTP 403 Forbidden)', async () => {
    const response = await fetch(`${baseUrl}/auth/admin-only`, {
      headers: { Cookie: studentCookie }
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, 'FORBIDDEN');
    assert.ok(body.error.message.includes('admin'));
  });

  await t.test('13. Admin granted access to Admin-only route (HTTP 200 OK)', async () => {
    const response = await fetch(`${baseUrl}/auth/admin-only`, {
      headers: { Cookie: adminCookie }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Admin area accessible.');
  });

  await t.test('14. Admin denied access to Student-only route (HTTP 403 Forbidden)', async () => {
    const response = await fetch(`${baseUrl}/auth/student-only`, {
      headers: { Cookie: adminCookie }
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, 'FORBIDDEN');
    assert.ok(body.error.message.includes('student'));
  });

  await t.test('15. Logout clears cookie and invalidates session on server', async () => {
    const response = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 
        Cookie: studentCookie,
        'X-Requested-With': 'XMLHttpRequest',
        Origin: 'http://localhost:5173'
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);

    const setCookie = response.headers.get('set-cookie');
    assert.ok(setCookie);
    // Cookie expiry is in the past (cleared)
    assert.ok(setCookie.includes('auth_token=;') || setCookie.includes('Expires=Thu, 01 Jan 1970'));
  });

  await t.test('16. Copied / previously issued token is rejected after logout (Server-Side Revocation)', async () => {
    // Attempt to access /auth/me with the student token that was logged out in test 15
    const response = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: studentCookie }
    });

    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
    assert.ok(body.error.message.includes('logged out') || body.error.message.includes('no longer valid'));

    // Also attempt via Bearer header
    const bearerResponse = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert.equal(bearerResponse.status, 401);
    const bearerBody = await bearerResponse.json();
    assert.equal(bearerBody.error.code, 'UNAUTHENTICATED');
  });

  await t.test('17. CSRF Protection: Rejects state-changing cookie request from untrusted origin', async () => {
    // Attempt cross-origin POST using admin session cookie
    const response = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        Origin: 'http://malicious-website.com'
      }
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.ok(body.error.code === 'CSRF_ERROR' || body.error.code === 'CORS_ERROR');
    assert.ok(body.error.message.includes('CORS') || body.error.message.includes('Cross-site'));
  });

  await t.test('18. CSRF Protection: Permits state-changing cookie request from trusted origin with custom header', async () => {
    const response = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
  });
});
