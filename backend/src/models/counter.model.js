import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true
    },
    seq: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

export const Counter = mongoose.model('Counter', counterSchema);

/**
 * Concurrency-Safe Atomic Sequence Generator
 * Atomically increments sequence using findOneAndUpdate with upsert in MongoDB
 *
 * @param {string} sequenceId - Unique identifier for the counter (e.g. roll_competitionId_year)
 * @returns {Promise<number>} - Incremented sequence number
 */
export async function getNextSequence(sequenceId) {
  const result = await Counter.findOneAndUpdate(
    { _id: sequenceId },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return result.seq;
}
