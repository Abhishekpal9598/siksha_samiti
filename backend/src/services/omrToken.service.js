import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { config } from '../config/env.js';

/**
 * OMR Cryptographic Token & QR Code Service
 * 
 * Ensures machine-readable QR codes on personalized OMR answer sheets
 * are non-guessable, tamper-resistant, verifiable, and free of any student PII.
 */

const TOKEN_VERSION = 1;

/**
 * Compute constant-length HMAC-SHA256 signature for sheet identification
 */
export function computeOmrSignature(competitionId, registrationId, omrSheetToken, secret = config.jwtSecret) {
  const data = `${competitionId}:${registrationId}:${omrSheetToken}`;
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Generate secure QR token payload (Zero PII)
 * 
 * @param {Object} params
 * @param {string|ObjectId} params.competitionId
 * @param {string|ObjectId} params.registrationId
 * @param {string} params.omrSheetToken - Secure 32-char hex token from Registration doc
 * @returns {Object} Compact payload object
 */
export function createOmrTokenPayload({ competitionId, registrationId, omrSheetToken }) {
  if (!competitionId || !registrationId || !omrSheetToken) {
    throw new Error('competitionId, registrationId, and omrSheetToken are required');
  }

  const cid = competitionId.toString();
  const rid = registrationId.toString();
  const sig = computeOmrSignature(cid, rid, omrSheetToken);

  return {
    v: TOKEN_VERSION,
    cid,
    rid,
    tok: omrSheetToken,
    sig
  };
}

/**
 * Verify cryptographic authenticity of scanned OMR QR payload
 * 
 * @param {Object|string} payload - Parsed object or JSON string from QR decoder
 * @param {string} [secret] - Secret key (supports key rotation)
 * @returns {Object} Verification result with extracted IDs
 */
export function verifyOmrTokenPayload(payload, secret = config.jwtSecret) {
  try {
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;

    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'INVALID_PAYLOAD_STRUCTURE' };
    }

    if (data.v !== TOKEN_VERSION) {
      return { valid: false, error: 'UNSUPPORTED_TOKEN_VERSION' };
    }

    const { cid, rid, tok, sig } = data;
    if (!cid || !rid || !tok || !sig) {
      return { valid: false, error: 'MISSING_TOKEN_FIELDS' };
    }

    const expectedSig = computeOmrSignature(cid, rid, tok, secret);

    // Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(sig, 'utf8');
    const expectedBuffer = Buffer.from(expectedSig, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, error: 'INVALID_CRYPTOGRAPHIC_SIGNATURE' };
    }

    return {
      valid: true,
      competitionId: cid,
      registrationId: rid,
      omrSheetToken: tok
    };
  } catch (err) {
    return { valid: false, error: `TOKEN_PARSING_FAILED: ${err.message}` };
  }
}

/**
 * Generate high-contrast PNG Buffer of the QR code for vector PDF embedding
 * 
 * @param {Object} payloadObj - Output from createOmrTokenPayload
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function generateOmrQrBuffer(payloadObj) {
  const qrString = JSON.stringify(payloadObj);
  return QRCode.toBuffer(qrString, {
    errorCorrectionLevel: 'M',
    type: 'png',
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    },
    width: 256
  });
}
