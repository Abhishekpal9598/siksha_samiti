import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { validateProductionEnv, config } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { checkOmrServiceHealth, alignOmrScan } from '../src/services/omrClient.service.js';

// HTTP request helper
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

test('=== PHASE 8: PRODUCTION READINESS & OPERATIONAL SECURITY AUDIT ===', async (suite) => {
  let testUser = null;

  suite.before(async () => {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/education_committee';
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect(MONGODB_URI);
    }

    await User.deleteMany({ mobileNormalized: { $regex: /^999988/ } });

    const passwordHash = await bcrypt.hash('ProductionTest123!', 8);
    testUser = await User.create({
      fullName: 'Phase 8 Smoke Student',
      mobile: '+91 9999880001',
      mobileNormalized: '9999880001',
      passwordHash,
      role: 'student',
      school: 'Production Audit School',
      classOrGrade: 'Class 10',
      isActive: true
    });
  });

  suite.after(async () => {
    await User.deleteMany({ mobileNormalized: { $regex: /^999988/ } });
    await mongoose.disconnect();
  });

  // ---------------------------------------------------------------------------
  // 1. Startup Environment & Secret Validation
  // ---------------------------------------------------------------------------
  await suite.test('Audit 1.1: validateProductionEnv strictly throws in production mode with default JWT_SECRET', () => {
    assert.throws(
      () => {
        validateProductionEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'dev_secret_key_change_in_production_education_committee_2026',
          OMR_INTERNAL_KEY: 'valid_strong_omr_secret_key_32_characters_long',
          CLIENT_ORIGIN: 'https://portal.educationcommittee.org',
          MONGODB_URI: 'mongodb://127.0.0.1:27017/education_committee'
        });
      },
      (err) => {
        assert.equal(err.code, 'INVALID_PRODUCTION_CONFIG');
        assert.match(err.message, /JWT_SECRET/);
        return true;
      }
    );
  });

  await suite.test('Audit 1.2: validateProductionEnv strictly rejects short JWT_SECRET (< 32 chars)', () => {
    assert.throws(
      () => {
        validateProductionEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'short_key_under_32_chars',
          OMR_INTERNAL_KEY: 'valid_strong_omr_secret_key_32_characters_long',
          CLIENT_ORIGIN: 'https://portal.educationcommittee.org',
          MONGODB_URI: 'mongodb://127.0.0.1:27017/education_committee'
        });
      },
      (err) => {
        assert.equal(err.code, 'INVALID_PRODUCTION_CONFIG');
        assert.match(err.message, /at least 32 characters/);
        return true;
      }
    );
  });

  await suite.test('Audit 1.3: validateProductionEnv strictly rejects default/weak OMR_INTERNAL_KEY in production', () => {
    assert.throws(
      () => {
        validateProductionEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'a_very_secure_strong_production_jwt_secret_64_bytes_test_key',
          OMR_INTERNAL_KEY: 'edu_omr_internal_secret_key_2026',
          CLIENT_ORIGIN: 'https://portal.educationcommittee.org',
          MONGODB_URI: 'mongodb://127.0.0.1:27017/education_committee'
        });
      },
      (err) => {
        assert.equal(err.code, 'INVALID_PRODUCTION_CONFIG');
        assert.match(err.message, /OMR_INTERNAL_KEY/);
        return true;
      }
    );
  });

  await suite.test('Audit 1.4: validateProductionEnv strictly rejects wildcard CORS in production', () => {
    assert.throws(
      () => {
        validateProductionEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'a_very_secure_strong_production_jwt_secret_64_bytes_test_key',
          OMR_INTERNAL_KEY: 'valid_strong_omr_secret_key_32_characters_long',
          CLIENT_ORIGIN: 'http://localhost:5173,*',
          MONGODB_URI: 'mongodb://127.0.0.1:27017/education_committee'
        });
      },
      (err) => {
        assert.equal(err.code, 'INVALID_PRODUCTION_CONFIG');
        assert.match(err.message, /Wildcard/);
        return true;
      }
    );
  });

  await suite.test('Audit 1.5: validateProductionEnv succeeds with hardened production variables', () => {
    const result = validateProductionEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a_very_secure_strong_production_jwt_secret_64_bytes_test_key',
      OMR_INTERNAL_KEY: 'valid_strong_omr_secret_key_32_characters_long',
      CLIENT_ORIGIN: 'https://portal.educationcommittee.org,https://admin.educationcommittee.org',
      MONGODB_URI: 'mongodb+srv://admin:pass@cluster.mongodb.net/prod_db'
    });
    assert.equal(result.valid, true);
  });

  await suite.test('Audit 1.6: validateProductionEnv allows dev secrets when NODE_ENV is development', () => {
    const result = validateProductionEnv({
      NODE_ENV: 'development',
      JWT_SECRET: 'dev_secret_key_change_in_production_education_committee_2026',
      OMR_INTERNAL_KEY: 'edu_omr_internal_secret_key_2026',
      CLIENT_ORIGIN: '*',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/education_committee'
    });
    assert.equal(result.valid, true);
  });

  // ---------------------------------------------------------------------------
  // 2. Production Error Sanitization & Information Leakage Prevention
  // ---------------------------------------------------------------------------
  await suite.test('Audit 2.1: Error handler suppresses internal DB messages and stack trace for 500 errors in production', () => {
    const originalEnv = config.nodeEnv;
    config.nodeEnv = 'production';

    const mockReq = { id: 'req_audit_123', method: 'GET', originalUrl: '/api/v1/test' };
    let capturedStatus = null;
    let capturedBody = null;
    const mockRes = {
      status(s) { capturedStatus = s; return this; },
      json(b) { capturedBody = b; return this; }
    };

    const sensitiveError = new Error('MongoServerError: authentication failed for user "admin_secret_user" at 10.0.4.15');
    sensitiveError.stack = 'Error: MongoServerError at /opt/app/node_modules/mongodb/lib/connection.js:123';

    try {
      errorHandler(sensitiveError, mockReq, mockRes, () => {});

      assert.equal(capturedStatus, 500);
      assert.equal(capturedBody.error.code, 'INTERNAL_ERROR');
      assert.equal(capturedBody.error.message, 'An unexpected internal error occurred. Please contact system administrator.');
      assert.equal(capturedBody.error.stack, undefined);
      assert.deepEqual(capturedBody.error.details, []);
    } finally {
      config.nodeEnv = originalEnv;
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Cookie Security & Authentication Flags
  // ---------------------------------------------------------------------------
  await suite.test('Audit 3.1: Login endpoint sets HttpOnly, SameSite=lax, and valid session cookie', async () => {
    const res = await makeRequest(app, 'POST', '/api/v1/auth/login', {
      body: {
        mobile: '9999880001',
        password: 'ProductionTest123!'
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token, 'Token returned in response');
    assert.ok(res.body.csrfToken, 'CSRF token returned in response');

    // Verify Set-Cookie header contains HttpOnly and SameSite=Lax
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie, 'Set-Cookie header must be present');
    assert.match(setCookie, new RegExp(config.cookieName));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
  });

  // ---------------------------------------------------------------------------
  // 4. OMR Microservice Client Resilience
  // ---------------------------------------------------------------------------
  await suite.test('Audit 4.1: checkOmrServiceHealth handles offline microservice gracefully with zero crash', async () => {
    const health = await checkOmrServiceHealth();
    assert.ok(health.timestamp);
    assert.ok(health.storage);
    assert.equal(health.storage.ready, true);
    // Microservice status is either HEALTHY (if running) or UNAVAILABLE (if offline), never throws
    assert.ok(['HEALTHY', 'DEGRADED'].includes(health.status));
    assert.ok(['HEALTHY', 'UNAVAILABLE'].includes(health.microservice.status));
  });

  await suite.test('Audit 4.2: alignOmrScan returns 503 OMR_SERVICE_UNAVAILABLE on unreachable microservice', async () => {
    const originalUrl = config.omrServiceUrl;
    config.omrServiceUrl = 'http://127.0.0.1:59999'; // deliberately unused port

    try {
      await assert.rejects(
        async () => {
          await alignOmrScan({ inputPath: 'dummy.pdf', outputPath: 'dummy.png' });
        },
        (err) => {
          assert.equal(err.code, 'OMR_SERVICE_UNAVAILABLE');
          assert.equal(err.statusCode, 503);
          return true;
        }
      );
    } finally {
      config.omrServiceUrl = originalUrl;
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Static Asset Protection & SPA Fallback Security
  // ---------------------------------------------------------------------------
  await suite.test('Audit 5.1: Private storage paths return 404 and never serve files or SPA HTML directly', async () => {
    const res = await makeRequest(app, 'GET', '/storage/omr_private/secret_scan.png');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  await suite.test('Audit 5.2: Non-existent API routes return 404 JSON, not HTML', async () => {
    const res = await makeRequest(app, 'GET', '/api/v1/nonexistent-endpoint', {
      headers: { Accept: 'application/json' }
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});
