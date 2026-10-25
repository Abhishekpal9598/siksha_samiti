import { Attempt } from '../models/attempt.model.js';

let sweeperIntervalId = null;

/**
 * Sweeps and auto-submits all expired IN_PROGRESS attempts.
 * This runs completely server-side, ensuring attempts are finalized
 * even if the student closes their browser, disconnects, or experiences power loss.
 *
 * @returns {Promise<number>} Count of auto-submitted attempts
 */
export const sweepExpiredAttempts = async () => {
  try {
    const now = new Date();

    // Find all attempts that are IN_PROGRESS and past endsAt
    const expiredAttempts = await Attempt.find({
      status: 'IN_PROGRESS',
      endsAt: { $lte: now }
    }).select('_id endsAt');

    if (expiredAttempts.length === 0) return 0;

    // Use bulkWrite for safe, atomic batch finalization
    const bulkOps = expiredAttempts.map((att) => ({
      updateOne: {
        filter: { _id: att._id, status: 'IN_PROGRESS' },
        update: {
          $set: {
            status: 'AUTO_SUBMITTED',
            submittedAt: att.endsAt
          }
        }
      }
    }));

    const result = await Attempt.bulkWrite(bulkOps);
    return result.modifiedCount || 0;
  } catch (error) {
    console.error('[ERROR] Failed to sweep expired exam attempts:', error.message);
    return 0;
  }
};

/**
 * Starts periodic background sweeper.
 *
 * @param {number} intervalMs - Poll interval in milliseconds (default: 15,000 ms)
 */
export const startAttemptExpirySweeper = (intervalMs = 15000) => {
  if (sweeperIntervalId) clearInterval(sweeperIntervalId);
  sweeperIntervalId = setInterval(sweepExpiredAttempts, intervalMs);

  // unref prevents the timer from hanging short-lived test suites or scripts
  if (sweeperIntervalId && typeof sweeperIntervalId.unref === 'function') {
    sweeperIntervalId.unref();
  }
};

/**
 * Stops periodic background sweeper during graceful server shutdown.
 */
export const stopAttemptExpirySweeper = () => {
  if (sweeperIntervalId) {
    clearInterval(sweeperIntervalId);
    sweeperIntervalId = null;
  }
};
