import mongoose from 'mongoose';
import { Counter, getNextSequence } from './counter.model.js';

const registrationSchema = new mongoose.Schema(
  {
    competitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competition',
      required: [true, 'Competition ID is required'],
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Student ID is required'],
      index: true
    },
    rollNumber: {
      type: String,
      required: [true, 'Roll number is required'],
      trim: true,
      uppercase: true
    },
    status: {
      type: String,
      enum: ['registered', 'withdrawn', 'disqualified'],
      default: 'registered'
    },
    examMode: {
      type: String,
      enum: {
        values: ['ONLINE_MCQ', 'OMR'],
        message: 'Exam mode must be either ONLINE_MCQ or OMR'
      },
      required: [true, 'Exam mode selection is required']
    },
    examModeLocked: {
      type: Boolean,
      default: true
    },
    examModeLockedAt: {
      type: Date,
      default: Date.now
    },
    registeredAt: {
      type: Date,
      default: Date.now
    },
    omrSheetToken: {
      type: String,
      default: null,
      index: true
    },
    omrSheetGeneratedAt: {
      type: Date,
      default: null
    },
    omrSheetGeneratedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// STRICT SECURITY INDEXES:
// 1. One registration per student per competition
registrationSchema.index({ competitionId: 1, studentId: 1 }, { unique: true });
// 2. Unique roll number within a competition
registrationSchema.index({ competitionId: 1, rollNumber: 1 }, { unique: true });

export const Registration = mongoose.model('Registration', registrationSchema);

/**
 * Concurrency-Safe Atomic Roll Number Generator:
 * 1. Derives competition year from competition examDate (or calendar year).
 * 2. Uses atomic MongoDB Counter collection to prevent simultaneous registration race conditions.
 * 3. Formats as EC-YYYY-XXXX (padded to at least 4 digits).
 * 4. Verifies database index integrity.
 *
 * @param {Object|string} competitionOrId - Competition document or ObjectId
 * @returns {Promise<string>} - Unique roll number
 */
export async function generateRollNumber(competitionOrId) {
  let competitionId = competitionOrId;
  let year = new Date().getFullYear();

  if (competitionOrId && typeof competitionOrId === 'object') {
    competitionId = competitionOrId._id || competitionOrId.id;
    if (competitionOrId.examDate) {
      const examYear = new Date(competitionOrId.examDate).getFullYear();
      if (!isNaN(examYear) && examYear >= 2000) {
        year = examYear;
      }
    }
  }

  const sequenceKey = `roll_${competitionId.toString()}_${year}`;

  // If counter doesn't exist yet, seed it with the highest existing sequence or count
  const existingCounter = await Counter.findById(sequenceKey);
  if (!existingCounter) {
    const highestRegs = await Registration.find({ competitionId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('rollNumber');

    let maxSeq = 0;
    for (const r of highestRegs) {
      const match = r.rollNumber && r.rollNumber.match(/EC-\d{4}-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
    const count = await Registration.countDocuments({ competitionId });
    const seed = Math.max(maxSeq, count);
    if (seed > 0) {
      await Counter.findByIdAndUpdate(
        sequenceKey,
        { $setOnInsert: { seq: seed } },
        { upsert: true }
      );
    }
  }

  // Atomically increment counter
  let seq = await getNextSequence(sequenceKey);
  let candidate = `EC-${year}-${String(seq).padStart(4, '0')}`;

  // Failsafe check against pre-existing un-sequenced records
  let exists = await Registration.findOne({ competitionId, rollNumber: candidate });
  while (exists) {
    seq = await getNextSequence(sequenceKey);
    candidate = `EC-${year}-${String(seq).padStart(4, '0')}`;
    exists = await Registration.findOne({ competitionId, rollNumber: candidate });
  }

  return candidate;
}
