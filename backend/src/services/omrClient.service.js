import fs from 'node:fs/promises';
import { config } from '../config/env.js';

/**
 * Node.js Client for Internal Python OMR Vision Microservice
 */

/**
 * Check health and readiness of the internal Python OMR Vision microservice
 * and verify local private OMR storage readiness.
 *
 * @returns {Promise<Object>} Diagnostic health payload
 */
export async function checkOmrServiceHealth() {
  const startTime = Date.now();
  let microserviceHealth = null;
  let microserviceError = null;

  // 1. Check Python OMR Microservice Connectivity
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${config.omrServiceUrl}/health`, {
      method: 'GET',
      headers: {
        'X-Internal-Service-Key': config.omrInternalKey
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      microserviceHealth = await res.json();
    } else {
      microserviceError = `OMR service returned HTTP ${res.status}: ${res.statusText}`;
    }
  } catch (err) {
    microserviceError = err.name === 'AbortError' 
      ? 'OMR service request timed out after 5000ms'
      : `Cannot connect to OMR service at ${config.omrServiceUrl}: ${err.message}`;
  }

  const latencyMs = Date.now() - startTime;

  // 2. Check Private Storage Directory Access
  let storageReady = false;
  let storageError = null;
  try {
    await fs.mkdir(config.omrStorageDir, { recursive: true });
    // Write test file
    const testFilePath = `${config.omrStorageDir}/.probe_${Date.now()}`;
    await fs.writeFile(testFilePath, 'probe', 'utf8');
    await fs.unlink(testFilePath);
    storageReady = true;
  } catch (err) {
    storageError = `Storage directory error: ${err.message}`;
  }

  const isHealthy = Boolean(microserviceHealth && storageReady);

  return {
    status: isHealthy ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    latencyMs,
    storage: {
      ready: storageReady,
      path: config.omrStorageDir,
      error: storageError
    },
    microservice: microserviceHealth ? {
      status: microserviceHealth.status,
      url: config.omrServiceUrl,
      libraries: microserviceHealth.libraries,
      capabilities: microserviceHealth.capabilities
    } : {
      status: 'UNAVAILABLE',
      url: config.omrServiceUrl,
      error: microserviceError
    }
  };
}
