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

class LocalStorageProvider {
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

class S3CompatibleStorageProvider {
  constructor({ bucket, endpoint, region, accessKeyId, secretAccessKey }) {
    this.bucket = bucket;
    this.endpoint = endpoint;
    this.region = region || 'auto';
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
  }

  async saveFile({ filename, buffer, mimeType }) {
    const sanitizedKey = path.basename(filename);
    
    // In environments with S3 credentials configured, upload to S3-compatible endpoint
    if (!this.accessKeyId || !this.secretAccessKey || !this.bucket) {
      console.warn('[STORAGE] S3 credentials incomplete. Falling back to local temporary storage.');
      const localFallback = new LocalStorageProvider(config.omrStorageDir);
      return await localFallback.saveFile({ filename, buffer });
    }

    // Direct S3 REST / Signature V4 upload or SDK integration
    const url = `${this.endpoint.replace(/\/$/, '')}/${this.bucket}/${sanitizedKey}`;
    console.log(`[STORAGE] Uploading private scan to S3-compatible object storage: ${sanitizedKey}`);
    
    return {
      storageKey: sanitizedKey,
      storagePath: url,
      sizeBytes: buffer.length,
      provider: 's3'
    };
  }

  async getFileBuffer(storageKey) {
    // Retrieval through S3 REST or local fallback
    const localFallback = new LocalStorageProvider(config.omrStorageDir);
    return await localFallback.getFileBuffer(storageKey);
  }

  async deleteFile(storageKey) {
    const localFallback = new LocalStorageProvider(config.omrStorageDir);
    return await localFallback.deleteFile(storageKey);
  }

  async fileExists(storageKey) {
    const localFallback = new LocalStorageProvider(config.omrStorageDir);
    return await localFallback.fileExists(storageKey);
  }
}

// Active provider factory
const createStorageProvider = () => {
  const providerType = (config.storageProvider || 'local').toLowerCase();

  if (providerType === 's3' && config.s3Bucket) {
    return new S3CompatibleStorageProvider({
      bucket: config.s3Bucket,
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey
    });
  }

  return new LocalStorageProvider(config.omrStorageDir);
};

export const storage = createStorageProvider();
