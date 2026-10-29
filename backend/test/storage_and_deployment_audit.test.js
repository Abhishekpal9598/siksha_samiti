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
import { validateProductionEnv } from '../src/config/env.js';

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

  test('S3CompatibleStorageProvider falls back safely to local storage when credentials missing', async () => {
    const provider = new S3CompatibleStorageProvider({
      bucket: '',
      endpoint: '',
      region: 'auto',
      accessKeyId: '',
      secretAccessKey: ''
    });

    const testFile = 'fallback_test.jpg';
    const testBuffer = Buffer.from('FALLBACK_DATA');

    const result = await provider.saveFile({ filename: testFile, buffer: testBuffer });
    assert.strictEqual(result.storageKey, testFile);
    assert.strictEqual(result.provider, 'local');

    const exists = await provider.fileExists(testFile);
    assert.strictEqual(exists, true);

    await provider.deleteFile(testFile);
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
});
