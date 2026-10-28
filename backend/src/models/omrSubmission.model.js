import mongoose from 'mongoose';

/**
 * OmrSubmission Model - Phase 6.3 Secure OMR Ingestion Pipeline
 * 
 * Tracks uploaded OMR scan files, cryptographically verified metadata,
 * deduplication hashes, quality checks, immutable machine detections,
 * and complete audit trails.
 */
const omrSubmissionSchema = new mongoose.Schema(
  {
    competitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competition',
      required: [true, 'Competition ID is required'],
      index: true
    },
    registrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Registration',
      default: null,
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    rollNumber: {
      type: String,
      default: null,
      trim: true,
      uppercase: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Uploader User ID is required']
    },
    originalFilename: {
      type: String,
      required: [true, 'Original filename is required']
    },
    storedFilename: {
      type: String,
      required: [true, 'Stored filename is required'],
      unique: true
    },
    storagePath: {
      type: String,
      required: [true, 'Storage path is required']
    },
    fileSizeBytes: {
      type: Number,
      required: [true, 'File size in bytes is required']
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required']
    },
    fileFormat: {
      type: String,
      enum: ['JPEG', 'PNG', 'PDF'],
      required: [true, 'File format is required']
    },
    fileHash: {
      type: String,
      required: [true, 'SHA-256 file hash is required'],
      index: true
    },
    pageCount: {
      type: Number,
      default: 1
    },
    status: {
      type: String,
      enum: ['UPLOADED', 'QUEUED', 'PROCESSING', 'NEEDS_REVIEW', 'IN_REVIEW', 'PARTIALLY_VERIFIED', 'VERIFIED', 'REOPENED', 'FAILED'],
      default: 'UPLOADED',
      index: true
    },
    rejectionReason: {
      type: String,
      default: null
    },
    qrData: {
      raw: { type: String, default: null },
      verified: { type: Boolean, default: false },
      competitionId: { type: String, default: null },
      registrationId: { type: String, default: null },
      omrSheetToken: { type: String, default: null },
      verifiedAt: { type: Date, default: null }
    },
    qualityChecks: {
      magicBytesValid: { type: Boolean, default: false },
      dimensions: {
        width: { type: Number, default: null },
        height: { type: Number, default: null }
      },
      sha256Matched: { type: Boolean, default: false },
      notes: { type: String, default: null }
    },
    // Phase 6.4: Aligned Storage & Quality Metrics
    alignedFilename: {
      type: String,
      default: null
    },
    alignedStoragePath: {
      type: String,
      default: null
    },
    alignedMimeType: {
      type: String,
      default: 'image/png'
    },
    alignedAt: {
      type: Date,
      default: null
    },
    alignment: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    qualityMetrics: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    rawDetections: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    confirmedAnswers: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    auditTrail: [
      {
        action: {
          type: String,
          required: true
        },
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        timestamp: {
          type: Date,
          default: Date.now
        },
        details: {
          type: mongoose.Schema.Types.Mixed
        }
      }
    ]
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : undefined;
        delete ret._id;
        delete ret.__v;
        // Never leak absolute private filesystem path in JSON payloads
        delete ret.storagePath;
        delete ret.alignedStoragePath;
        return ret;
      }
    }
  }
);

// STRICT INTEGRITY INDEXES
omrSubmissionSchema.index({ competitionId: 1, fileHash: 1 });
omrSubmissionSchema.index(
  { competitionId: 1, registrationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      registrationId: { $type: 'objectId' },
      status: { $in: ['UPLOADED', 'QUEUED', 'PROCESSING', 'NEEDS_REVIEW', 'IN_REVIEW', 'PARTIALLY_VERIFIED', 'VERIFIED', 'REOPENED'] }
    }
  }
);
omrSubmissionSchema.index({ competitionId: 1, status: 1 });

export const OmrSubmission = mongoose.model('OmrSubmission', omrSubmissionSchema);
