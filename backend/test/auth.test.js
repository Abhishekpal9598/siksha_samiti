import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User, normalizeIndianMobile } from '../src/models/user.model.js';
import { connectDB, disconnectDB } from '../src/config/database.js';

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

test('POST /api/v1/auth/register Integration Tests', async (t) => {
  await connectDB();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  // Unique test mobile number
  const testMobile = '9876' + Math.floor(100000 + Math.random() * 900000);

  t.after(async () => {
    // Clean up test users created during this test
    await User.deleteMany({ mobileNormalized: { $regex: /^9876/ } });
    server.close();
    await disconnectDB();
  });

  await t.test('1. Successful student registration returns 201 and safe user', async () => {
    const payload = {
      fullName: 'Ramesh Kumar',
      mobile: `+91 ${testMobile}`,
      school: 'Government High School, Bilaspur',
      classOrGrade: 'Class 10',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123'
    };

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(response.status, 201);
    const body = await response.json();

    assert.equal(body.success, true);
    assert.ok(body.user);
    assert.equal(body.user.fullName, 'Ramesh Kumar');
    assert.equal(body.user.mobileNormalized, testMobile);
    assert.equal(body.user.role, 'student');
    assert.equal(body.user.school, 'Government High School, Bilaspur');
    assert.equal(body.user.classOrGrade, 'Class 10');
    assert.equal(body.user.passwordHash, undefined, 'passwordHash must never be exposed');

    // Verify in MongoDB directly
    const dbUser = await User.findOne({ mobileNormalized: testMobile }).select('+passwordHash');
    assert.ok(dbUser);
    assert.equal(dbUser.role, 'student');
    assert.ok(dbUser.passwordHash.startsWith('$2')); // valid bcrypt hash
    assert.equal(await bcrypt.compare('SecurePassword123', dbUser.passwordHash), true);
  });

  await t.test('2. Security Rule: Public registration cannot create Admin role', async () => {
    const exploitMobile = '9876' + Math.floor(100000 + Math.random() * 900000);
    const payload = {
      fullName: 'Attacker Attempting Admin',
      mobile: exploitMobile,
      school: 'Test School',
      classOrGrade: '12th',
      password: 'HackerPassword123',
      confirmPassword: 'HackerPassword123',
      role: 'admin' // Attempt mass-assignment exploit
    };

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.user.role, 'student', 'Role must unconditionally be forced to student');

    const dbUser = await User.findOne({ mobileNormalized: exploitMobile });
    assert.equal(dbUser.role, 'student');
  });

  await t.test('3. Duplicate mobile number returns 409 Conflict', async () => {
    const duplicatePayload = {
      fullName: 'Another Person Same Mobile',
      mobile: testMobile,
      school: 'Different School',
      classOrGrade: 'Class 9',
      password: 'AnotherPassword123',
      confirmPassword: 'AnotherPassword123'
    };

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicatePayload)
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, 'CONFLICT');
    assert.ok(body.error.message.includes('already exists'));
  });

  await t.test('4. Validation Error: Password mismatch returns 400', async () => {
    const invalidPayload = {
      fullName: 'Test Student',
      mobile: '9876999999',
      school: 'Test School',
      classOrGrade: '10th',
      password: 'Password123',
      confirmPassword: 'DifferentPassword123'
    };

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload)
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.ok(body.error.details.some(d => d.includes('match')));
  });

  await t.test('5. Validation Error: Invalid mobile number returns 400', async () => {
    const invalidPayload = {
      fullName: 'Test Student',
      mobile: '12345', // invalid
      school: 'Test School',
      classOrGrade: '10th',
      password: 'Password123',
      confirmPassword: 'Password123'
    };

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload)
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.ok(body.error.details.some(d => d.includes('mobile')));
  });
});
