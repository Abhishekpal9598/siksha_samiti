import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { config } from '../src/config/env.js';
import { checkOmrServiceHealth } from '../src/services/omrClient.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const pythonExe = path.resolve(projectRoot, 'omr-service', 'venv', 'Scripts', 'python.exe');

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

test('PHASE 6.1: OMR Service Foundation & Health Checks', async (suite) => {
  let pyProcess = null;
  let adminCookie = null;
  let committeeHeadCookie = null;
  let studentCookie = null;

  suite.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect(MONGODB_URI);
    }

    // Clean up test users
    await User.deleteMany({ mobileNormalized: { $regex: /^9999666/ } });

    const passwordHash = await bcrypt.hash('Phase6Pass@123', 8);

    // 1. Create Admin
    await User.create({
      fullName: 'Phase 6 Test Admin',
      mobile: '+91 9999666001',
      mobileNormalized: '9999666001',
      role: 'admin',
      passwordHash,
      isActive: true,
      classOrGrade: 'Admin Office',
      school: 'HQ'
    });

    // 2. Create Committee Head
    await User.create({
      fullName: 'Phase 6 Committee Head',
      mobile: '+91 9999666002',
      mobileNormalized: '9999666002',
      role: 'committee_head',
      passwordHash,
      isActive: true,
      classOrGrade: 'Chairperson',
      school: 'Board'
    });

    // 3. Create Student
    await User.create({
      fullName: 'Phase 6 Student Candidate',
      mobile: '+91 9999666003',
      mobileNormalized: '9999666003',
      role: 'student',
      passwordHash,
      isActive: true,
      classOrGrade: 'Class 10',
      school: 'Model School'
    });

    const login = async (mobile) => {
      const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
        body: { mobile, password: 'Phase6Pass@123' }
      });
      const cookieHeader = res.headers.get('set-cookie');
      return cookieHeader ? cookieHeader.split(';')[0] : `${config.cookieName}=${res.body.token}`;
    };

    adminCookie = await login('9999666001');
    committeeHeadCookie = await login('9999666002');
    studentCookie = await login('9999666003');

    // Start Python FastAPI Microservice on port 8001
    const omrAppDir = path.resolve(projectRoot, 'omr-service');
    pyProcess = spawn(pythonExe, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001'], {
      cwd: omrAppDir,
      stdio: 'pipe'
    });

    // Wait up to 5 seconds for Python service to listen
    let isReady = false;
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetch('http://127.0.0.1:8001/health', {
          headers: { 'X-Internal-Service-Key': config.omrInternalKey }
        });
        if (res.status === 200) {
          isReady = true;
          break;
        }
      } catch {
        // Retry
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    assert.ok(isReady, 'Python OMR microservice must start and respond on 127.0.0.1:8001');
  });

  suite.after(async () => {
    try {
      await User.deleteMany({ mobileNormalized: { $regex: /^9999666/ } });
    } finally {
      if (pyProcess) {
        pyProcess.kill();
      }
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    }
  });

  // ==========================================
  // SECTION 1: MICROSERVICE SECURITY & ISOLATION
  // ==========================================
  await suite.test('1.1: Microservice rejects health check when X-Internal-Service-Key is missing (HTTP 403)', async () => {
    const res = await fetch('http://127.0.0.1:8001/health');
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.detail.code, 'FORBIDDEN');
  });

  await suite.test('1.2: Microservice rejects health check when X-Internal-Service-Key is invalid (HTTP 403)', async () => {
    const res = await fetch('http://127.0.0.1:8001/health', {
      headers: { 'X-Internal-Service-Key': 'tampered_or_unauthorized_key' }
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.detail.code, 'FORBIDDEN');
  });

  await suite.test('1.3: Microservice responds 200 OK with OpenCV, NumPy, and capabilities when key is valid', async () => {
    const res = await fetch('http://127.0.0.1:8001/health', {
      headers: { 'X-Internal-Service-Key': config.omrInternalKey }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'HEALTHY');
    assert.equal(body.service, 'Education Committee OMR Vision Microservice');
    assert.ok(body.libraries.opencv, 'Must report OpenCV version');
    assert.ok(body.libraries.numpy, 'Must report NumPy version');
    assert.ok(body.libraries.pillow, 'Must report Pillow version');
    assert.ok(body.capabilities.includes('HOMOGRAPHY_PERSPECTIVE_RECTIFICATION'));
    assert.ok(body.capabilities.includes('BUBBLE_FILL_DENSITY_CLASSIFICATION'));
  });

  // ==========================================
  // SECTION 2: NODE.JS CLIENT SERVICE INTEGRATION
  // ==========================================
  await suite.test('2.1: Node.js omrClient.service checks microservice & private storage readiness', async () => {
    const diagnostic = await checkOmrServiceHealth();
    assert.equal(diagnostic.status, 'HEALTHY');
    assert.equal(diagnostic.storage.ready, true);
    assert.ok(diagnostic.storage.path.includes('omr_private'));
    assert.equal(diagnostic.microservice.status, 'HEALTHY');
    assert.ok(diagnostic.microservice.libraries.opencv);
  });

  // ==========================================
  // SECTION 3: ADMIN EXPRESS GATEWAY & ACCESS CONTROL
  // ==========================================
  await suite.test('3.1: Unauthenticated request to GET /api/v1/admin/omr/health returns 401', async () => {
    const res = await makeRequest(app, 'GET', '/api/v1/admin/omr/health');
    assert.equal(res.status, 401);
  });

  await suite.test('3.2: Student role accessing GET /api/v1/admin/omr/health is denied (HTTP 403)', async () => {
    const res = await makeRequest(app, 'GET', '/api/v1/admin/omr/health', {
      cookie: studentCookie
    });
    assert.equal(res.status, 403);
  });

  await suite.test('3.3: Admin role accessing GET /api/v1/admin/omr/health succeeds with diagnostic report (HTTP 200)', async () => {
    const res = await makeRequest(app, 'GET', '/api/v1/admin/omr/health', {
      cookie: adminCookie
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.diagnostic.status, 'HEALTHY');
    assert.equal(res.body.diagnostic.microservice.status, 'HEALTHY');
    assert.ok(res.body.diagnostic.microservice.libraries.opencv);
  });

  await suite.test('3.4: Committee Head accessing GET /api/v1/admin/omr/health succeeds (HTTP 200)', async () => {
    const res = await makeRequest(app, 'GET', '/api/v1/admin/omr/health', {
      cookie: committeeHeadCookie
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.diagnostic.status, 'HEALTHY');
  });
});
