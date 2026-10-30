import { test, suite } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  LocalStorageProvider,
  S3CompatibleStorageProvider,
  signS3Request,
  createStorageProvider
} from '../src/services/storage.service.js';
import { validateProductionEnv, isOriginAllowed } from '../src/config/env.js';

suite('Pre-Deployment Storage & Security Audit Tests', () => {

  // 1. Local Storage Provider & Path Traversal Guard
  test('LocalStorageProvider handles file save, read, exists, and deletion', async () => {
    const testDir = path.resolve('./storage/test_audit_storage');
    const provider = new LocalStorageProvider(testDir);

    const testFile = 'audit_scan_001.jpg';
    const testBuffer = Buffer.from('FAKE_OMR_JPEG_DATA_2026');

    // 1. Save
    const saved = await provider.saveFile({ filename: testFile, buffer: testBuffer });
    assert.strictEqual(saved.storageKey, testFile);
    assert.strictEqual(saved.provider, 'local');

    // 2. Exists
    const exists = await provider.fileExists(testFile);
    assert.strictEqual(exists, true);

    // 3. Read
    const readBuf = await provider.getFileBuffer(testFile);
    assert.deepStrictEqual(readBuf, testBuffer);

    // 4. Delete
    const deleted = await provider.deleteFile(testFile);
    assert.strictEqual(deleted, true);

    const existsAfter = await provider.fileExists(testFile);
    assert.strictEqual(existsAfter, false);

    // Clean up directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  test('LocalStorageProvider strictly blocks directory traversal attempts', async () => {
    const testDir = path.resolve('./storage/test_audit_storage');
    const provider = new LocalStorageProvider(testDir);

    // Traversal payload in filename
    const maliciousFilename = '../../../../windows/system32/cmd.exe';
    // Path basename should sanitize it to cmd.exe inside baseDir
    const result = await provider.saveFile({ filename: maliciousFilename, buffer: Buffer.from('test') });
    assert.strictEqual(result.storageKey, 'cmd.exe');
    assert.strictEqual(result.storagePath.startsWith(testDir), true);

    await provider.deleteFile('cmd.exe');
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  // 2. AWS SigV4 S3 Signature Generation (Cloudflare R2 Compatibility)
  test('signS3Request generates valid AWS Signature Version 4 headers', () => {
    const signed = signS3Request({
      method: 'PUT',
      url: 'https://test-account.r2.cloudflarestorage.com/shiksha-omr-private/scan_test.jpg',
      region: 'auto',
      accessKeyId: 'TEST_ACCESS_KEY_123',
      secretAccessKey: 'TEST_SECRET_KEY_ABCDEF1234567890',
      bodyBuffer: Buffer.from('TEST_OMR_SCAN_PAYLOAD'),
      contentType: 'image/jpeg'
    });

    assert.ok(signed.Authorization, 'Authorization header must be present');
    assert.ok(signed.Authorization.startsWith('AWS4-HMAC-SHA256 Credential=TEST_ACCESS_KEY_123/'), 'Must use AWS4-HMAC-SHA256');
    assert.ok(signed.Authorization.includes('/auto/s3/aws4_request'), 'Credential scope must contain auto/s3/aws4_request');
    assert.ok(signed.Authorization.includes('SignedHeaders='), 'SignedHeaders must be present');
    assert.ok(signed.Authorization.includes('Signature='), 'Signature must be present');
    assert.ok(signed['x-amz-date'], 'x-amz-date must be present');
    assert.ok(signed['x-amz-content-sha256'], 'x-amz-content-sha256 must match payload hash');
    assert.strictEqual(signed['content-type'], 'image/jpeg');
  });

  test('signS3Request generates valid SigV4 headers for Supabase S3 endpoint', () => {
    const supabaseEndpoint = 'https://myprojectref.supabase.co/storage/v1/s3';
    const signed = signS3Request({
      method: 'PUT',
      url: `${supabaseEndpoint}/education-omr-private/scan_001.jpg`,
      region: 'global',
      accessKeyId: 'SUPABASE_S3_KEY_ID_EXAMPLE',
      secretAccessKey: 'SUPABASE_S3_SECRET_KEY_EXAMPLE_ABCDEF',
      bodyBuffer: Buffer.from('TEST_SUPABASE_OMR_SCAN_PAYLOAD'),
      contentType: 'image/jpeg'
    });

    assert.ok(signed.Authorization.startsWith('AWS4-HMAC-SHA256 Credential=SUPABASE_S3_KEY_ID_EXAMPLE/'));
    assert.ok(signed.Authorization.includes('/global/s3/aws4_request'));
    assert.strictEqual(signed.host, 'myprojectref.supabase.co');
    assert.ok(signed['x-amz-content-sha256']);
  });

  test('S3CompatibleStorageProvider strictly throws error when credentials missing (no silent fallback)', async () => {
    const provider = new S3CompatibleStorageProvider({
      bucket: '',
      endpoint: '',
      region: 'auto',
      accessKeyId: '',
      secretAccessKey: ''
    });

    const testFile = 'test_scan.jpg';
    const testBuffer = Buffer.from('DATA');

    await assert.rejects(
      async () => provider.saveFile({ filename: testFile, buffer: testBuffer }),
      (err) => {
        assert.strictEqual(err.code, 'S3_CREDENTIALS_MISSING');
        assert.ok(err.message.includes('Required credentials are missing'));
        return true;
      }
    );

    await assert.rejects(
      async () => provider.getFileBuffer(testFile),
      (err) => {
        assert.strictEqual(err.code, 'S3_CREDENTIALS_MISSING');
        return true;
      }
    );

    await assert.rejects(
      async () => provider.deleteFile(testFile),
      (err) => {
        assert.strictEqual(err.code, 'S3_CREDENTIALS_MISSING');
        return true;
      }
    );

    await assert.rejects(
      async () => provider.fileExists(testFile),
      (err) => {
        assert.strictEqual(err.code, 'S3_CREDENTIALS_MISSING');
        return true;
      }
    );
  });

  test('createStorageProvider strictly throws error when STORAGE_PROVIDER=s3 and credentials missing', () => {
    assert.throws(
      () => createStorageProvider({
        storageProvider: 's3',
        s3Bucket: '',
        s3Endpoint: '',
        s3AccessKeyId: '',
        s3SecretAccessKey: ''
      }),
      (err) => {
        assert.strictEqual(err.code, 'STORAGE_CONFIG_ERROR');
        assert.ok(err.message.includes('Silent fallback to local storage is strictly disabled'));
        return true;
      }
    );
  });

  // 3. Environment Security Validator (validateProductionEnv)
  test('validateProductionEnv accepts secure production configurations', () => {
    const validConfig = {
      NODE_ENV: 'production',
      JWT_SECRET: 'production_secure_entropy_jwt_secret_998877665544332211',
      OMR_INTERNAL_KEY: 'production_omr_service_key_9988776655',
      CLIENT_ORIGIN: 'https://shiksha-samiti.vercel.app,https://portal.educationcommittee.org',
      MONGODB_URI: 'mongodb+srv://admin:pass@cluster0.abc.mongodb.net/education_committee?retryWrites=true&w=majority',
      STORAGE_PROVIDER: 'local'
    };

    const result = validateProductionEnv(validConfig);
    assert.strictEqual(result.valid, true);
  });

  test('validateProductionEnv rejects S3 provider when S3 credentials are missing', () => {
    const s3MissingConfig = {
      NODE_ENV: 'production',
      JWT_SECRET: 'production_secure_entropy_jwt_secret_998877665544332211',
      OMR_INTERNAL_KEY: 'production_omr_service_key_9988776655',
      CLIENT_ORIGIN: 'https://shiksha-samiti.vercel.app',
      MONGODB_URI: 'mongodb+srv://admin:pass@cluster0.abc.mongodb.net/education_committee',
      STORAGE_PROVIDER: 's3',
      S3_BUCKET: '',
      S3_ENDPOINT: '',
      S3_ACCESS_KEY_ID: '',
      S3_SECRET_ACCESS_KEY: ''
    };

    assert.throws(
      () => validateProductionEnv(s3MissingConfig),
      (err) => {
        assert.strictEqual(err.code, 'INVALID_PRODUCTION_CONFIG');
        assert.ok(err.message.includes('required S3 credentials are missing'));
        return true;
      }
    );
  });

  test('validateProductionEnv accepts S3 provider when all S3 credentials provided', () => {
    const s3ValidConfig = {
      NODE_ENV: 'production',
      JWT_SECRET: 'production_secure_entropy_jwt_secret_998877665544332211',
      OMR_INTERNAL_KEY: 'production_omr_service_key_9988776655',
      CLIENT_ORIGIN: 'https://shiksha-samiti.vercel.app',
      MONGODB_URI: 'mongodb+srv://admin:pass@cluster0.abc.mongodb.net/education_committee',
      STORAGE_PROVIDER: 's3',
      S3_BUCKET: 'shiksha-omr-private',
      S3_ENDPOINT: 'https://acc123.r2.cloudflarestorage.com',
      S3_ACCESS_KEY_ID: 'R2_KEY_ID_123',
      S3_SECRET_ACCESS_KEY: 'R2_SECRET_KEY_ABC'
    };

    const result = validateProductionEnv(s3ValidConfig);
    assert.strictEqual(result.valid, true);
  });

  test('validateProductionEnv blocks CORS wildcard in production', () => {
    const wildcardConfig = {
      NODE_ENV: 'production',
      JWT_SECRET: 'production_secure_entropy_jwt_secret_998877665544332211',
      OMR_INTERNAL_KEY: 'production_omr_service_key_9988776655',
      CLIENT_ORIGIN: '*',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/education_committee'
    };

    assert.throws(
      () => validateProductionEnv(wildcardConfig),
      (err) => {
        assert.strictEqual(err.code, 'INVALID_PRODUCTION_CONFIG');
        assert.ok(err.message.includes("CLIENT_ORIGIN contains wildcard '*'"));
        return true;
      }
    );
  });

  // 4. Origin Matching & Cloud URL Compatibility
  test('isOriginAllowed permits Vercel deployments automatically', () => {
    assert.strictEqual(isOriginAllowed('https://shiksha-samiti.vercel.app'), true);
    assert.strictEqual(isOriginAllowed('https://siksha-samiti-1-git-main.vercel.app'), true);
    assert.strictEqual(isOriginAllowed('https://my-exam-portal-abc123.vercel.app/'), true); // trailing slash
  });

  test('isOriginAllowed permits localhost development', () => {
    assert.strictEqual(isOriginAllowed('http://localhost:5173'), true);
    assert.strictEqual(isOriginAllowed('http://localhost:5174/'), true);
    assert.strictEqual(isOriginAllowed('http://127.0.0.1:3000'), true);
  });

  test('isOriginAllowed rejects arbitrary untrusted external origins', () => {
    assert.strictEqual(isOriginAllowed('https://untrusted-malicious-site.com'), false);
    assert.strictEqual(isOriginAllowed('https://evil-hacker.org'), false);
  });
});
