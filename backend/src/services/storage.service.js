import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config/env.js';

/**
 * Enterprise Storage Service Abstraction
 * 
 * Supports:
 * 1. 'local' (default): High-performance filesystem storage for local development
 *    and dedicated/VPS servers (Ubuntu + NVMe SSD).
 * 2. 's3': S3-compatible cloud object storage for ephemeral cloud environments (Render, Fly.io, Heroku)
 *    using Cloudflare R2, AWS S3, Supabase Storage, or Backblaze B2.
 */

export class LocalStorageProvider {
  constructor(baseDir) {
    this.baseDir = path.resolve(baseDir);
    this._ensureDir();
  }

  _ensureDir() {
    if (!fsSync.existsSync(this.baseDir)) {
      fsSync.mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });
    }
  }

  _resolveSafe(filename) {
    const sanitized = path.basename(filename);
    const resolved = path.resolve(this.baseDir, sanitized);
    if (!resolved.startsWith(this.baseDir)) {
      const err = new Error('Path traversal detected');
      err.code = 'PATH_TRAVERSAL';
      err.statusCode = 403;
      throw err;
    }
    return resolved;
  }

  async saveFile({ filename, buffer }) {
    this._ensureDir();
    const targetPath = this._resolveSafe(filename);
    await fs.writeFile(targetPath, buffer);
    return {
      storageKey: path.basename(targetPath),
      storagePath: targetPath,
      sizeBytes: buffer.length,
      provider: 'local'
    };
  }

  async getFileBuffer(storageKey) {
    const targetPath = this._resolveSafe(storageKey);
    return await fs.readFile(targetPath);
  }

  async deleteFile(storageKey) {
    try {
      const targetPath = this._resolveSafe(storageKey);
      await fs.unlink(targetPath);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }

  async fileExists(storageKey) {
    try {
      const targetPath = this._resolveSafe(storageKey);
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Computes AWS Signature Version 4 signing key
 */
function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  return kSigning;
}

/**
 * Signs an HTTP request using AWS Signature Version 4 for S3-compatible APIs.
 */
export function signS3Request({
  method,
  url,
  region = 'auto',
  accessKeyId,
  secretAccessKey,
  bodyBuffer = null,
  contentType = null
}) {
  const parsedUrl = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);
  const payloadHash = crypto.createHash('sha256').update(bodyBuffer || Buffer.alloc(0)).digest('hex');

  const headers = {
    host: parsedUrl.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash
  };

  if (contentType) {
    headers['content-type'] = contentType;
  }

  const headerKeys = Object.keys(headers).sort();
  const canonicalHeaders = headerKeys.map(k => `${k}:${headers[k]}\n`).join('');
  const signedHeaders = headerKeys.join(';');

  const canonicalRequest = [
    method.toUpperCase(),
    parsedUrl.pathname,
    parsedUrl.search ? parsedUrl.search.substring(1) : '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, 's3');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...headers,
    Authorization: authorization
  };
}

export class S3CompatibleStorageProvider {
  constructor({ bucket, endpoint, region, accessKeyId, secretAccessKey }) {
    this.bucket = bucket;
    this.endpoint = (endpoint || '').replace(/\/$/, '');
    this.region = region || 'auto';
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
  }

  _assertCredentials() {
    if (!this.accessKeyId || !this.secretAccessKey || !this.bucket || !this.endpoint) {
      const missing = [];
      if (!this.bucket) missing.push('S3_BUCKET');
      if (!this.endpoint) missing.push('S3_ENDPOINT');
      if (!this.accessKeyId) missing.push('S3_ACCESS_KEY_ID');
      if (!this.secretAccessKey) missing.push('S3_SECRET_ACCESS_KEY');
      const err = new Error(`S3_CREDENTIALS_MISSING: Cannot perform S3 operation. Required credentials are missing: ${missing.join(', ')}.`);
      err.code = 'S3_CREDENTIALS_MISSING';
      throw err;
    }
  }

  _getObjectUrl(key) {
    const sanitizedKey = path.basename(key);
    return `${this.endpoint}/${this.bucket}/${sanitizedKey}`;
  }

  async saveFile({ filename, buffer, mimeType = 'application/octet-stream' }) {
    this._assertCredentials();
    const sanitizedKey = path.basename(filename);

    const url = this._getObjectUrl(sanitizedKey);
    const headers = signS3Request({
      method: 'PUT',
      url,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      bodyBuffer: buffer,
      contentType: mimeType
    });

    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: buffer
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`S3 upload failed with HTTP ${res.status}: ${errText || res.statusText}`);
    }

    return {
      storageKey: sanitizedKey,
      storagePath: sanitizedKey,
      sizeBytes: buffer.length,
      provider: 's3'
    };
  }

  async getFileBuffer(storageKey) {
    this._assertCredentials();
    const sanitizedKey = path.basename(storageKey);

    const url = this._getObjectUrl(sanitizedKey);
    const headers = signS3Request({
      method: 'GET',
      url,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey
    });

    const res = await fetch(url, {
      method: 'GET',
      headers
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`S3 download failed with HTTP ${res.status}: ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async deleteFile(storageKey) {
    this._assertCredentials();
    const sanitizedKey = path.basename(storageKey);

    const url = this._getObjectUrl(sanitizedKey);
    const headers = signS3Request({
      method: 'DELETE',
      url,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey
    });

    const res = await fetch(url, {
      method: 'DELETE',
      headers
    });

    return res.status === 204 || res.status === 200 || res.status === 404;
  }

  async fileExists(storageKey) {
    this._assertCredentials();
    const sanitizedKey = path.basename(storageKey);

    const url = this._getObjectUrl(sanitizedKey);
    const headers = signS3Request({
      method: 'HEAD',
      url,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey
    });

    const res = await fetch(url, {
      method: 'HEAD',
      headers
    });

    return res.status === 200;
  }
}

// Active provider factory
export const createStorageProvider = (customConfig = null) => {
  const currentConfig = customConfig || config;
  const providerType = (currentConfig.storageProvider || 'local').toLowerCase();

  if (providerType === 's3') {
    const missing = [];
    if (!currentConfig.s3Bucket) missing.push('S3_BUCKET');
    if (!currentConfig.s3Endpoint) missing.push('S3_ENDPOINT');
    if (!currentConfig.s3AccessKeyId) missing.push('S3_ACCESS_KEY_ID');
    if (!currentConfig.s3SecretAccessKey) missing.push('S3_SECRET_ACCESS_KEY');

    if (missing.length > 0) {
      const err = new Error(`STORAGE_CONFIG_ERROR: STORAGE_PROVIDER is 's3' but required S3 credentials are missing: ${missing.join(', ')}. Silent fallback to local storage is strictly disabled.`);
      err.code = 'STORAGE_CONFIG_ERROR';
      throw err;
    }

    return new S3CompatibleStorageProvider({
      bucket: currentConfig.s3Bucket,
      endpoint: currentConfig.s3Endpoint,
      region: currentConfig.s3Region || 'auto',
      accessKeyId: currentConfig.s3AccessKeyId,
      secretAccessKey: currentConfig.s3SecretAccessKey
    });
  }

  return new LocalStorageProvider(currentConfig.omrStorageDir);
};

export const storage = createStorageProvider();
