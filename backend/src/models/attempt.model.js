import mongoose from 'mongoose';

const snapshotOptionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      enum: ['A', 'B', 'C', 'D'],
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true
    }
  },
  { _id: false }
);

const snapshotQuestionSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true
    },
    order: {
      type: Number,
      required: true
    },
    prompt: {
      type: String,
      required: true,
      trim: true
    },
    options: {
      type: [snapshotOptionSchema],
      required: true
    },
    marks: {
      type: Number,
      default: 1
    },
    subject: {
      type: String,
      default: 'General'
    },
    topic: {
      type: String,
      default: ''
    }
    // CRITICAL SECURITY: correctOption and explanation are NEVER stored in snapshot
  },
  { _id: false }
);

const answerResponseSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true
    },
    selectedOption: {
      type: String,
      enum: ['A', 'B', 'C', 'D', null],
      default: null
    },
    isMarkedForReview: {
      type: Boolean,
      default: false
    },
    clientVersion: {
      type: Number,
      default: 0
    },
    clientTimestamp: {
      type: Date,
      default: null
    },
    savedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
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
    registrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Registration',
      required: [true, 'Registration ID is required'],
      index: true
    },
    mode: {
      type: String,
      enum: ['ONLINE_MCQ'],
      default: 'ONLINE_MCQ'
    },
    status: {
      type: String,
      enum: ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED'],
      default: 'IN_PROGRESS',
      index: true
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    endsAt: {
      type: Date,
      required: true
    },
    submittedAt: {
      type: Date
    },
    lastSavedAt: {
      type: Date,
      default: Date.now
    },
    questionSnapshot: {
      type: [snapshotQuestionSchema],
      required: [true, 'Question snapshot is required']
    },
    answers: {
      type: [answerResponseSchema],
      default: []
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

// STRICT INTEGRITY INDEXES:
// 1. One attempt per student per competition (Strict Unique Compound Index)
attemptSchema.index({ competitionId: 1, studentId: 1 }, { unique: true });
// 2. Query indexes for expiry monitoring and status filtering
attemptSchema.index({ endsAt: 1, status: 1 });
attemptSchema.index({ competitionId: 1, status: 1 });

/**
 * Safe Student Serializer:
 * Never exposes server secrets, correct answers, or internal metadata.
 */
attemptSchema.methods.toStudentJSON = function () {
  return {
    id: this._id.toString(),
    competitionId: this.competitionId.toString(),
    registrationId: this.registrationId ? this.registrationId.toString() : undefined,
    status: this.status,
    mode: this.mode,
    startedAt: this.startedAt,
    endsAt: this.endsAt,
    submittedAt: this.submittedAt,
    lastSavedAt: this.lastSavedAt,
    serverTime: new Date().toISOString(),
    questions: this.questionSnapshot.map((q) => ({
      questionId: q.questionId.toString(),
      order: q.order,
      prompt: q.prompt,
      options: q.options.map((o) => ({ key: o.key, text: o.text })),
      marks: q.marks,
      subject: q.subject,
      topic: q.topic
    })),
    answers: this.answers.map((a) => ({
      questionId: a.questionId.toString(),
      selectedOption: a.selectedOption,
      isMarkedForReview: a.isMarkedForReview,
      clientVersion: a.clientVersion,
      savedAt: a.savedAt
    }))
  };
};

/**
 * Safe Admin Monitoring Serializer:
 * Does NOT display answer keys or calculate marks in Phase 4.
 */
attemptSchema.methods.toAdminJSON = function () {
  const answeredCount = this.answers.filter((a) => a.selectedOption !== null).length;
  const markedReviewCount = this.answers.filter((a) => a.isMarkedForReview).length;

  return {
    id: this._id.toString(),
    competitionId: this.competitionId.toString(),
    studentId: this.studentId ? (this.studentId._id || this.studentId).toString() : undefined,
    studentName: this.studentId?.fullName || undefined,
    studentMobile: this.studentId?.mobileNormalized || undefined,
    registrationId: this.registrationId ? (this.registrationId._id || this.registrationId).toString() : undefined,
    rollNumber: this.registrationId?.rollNumber || undefined,
    status: this.status,
    mode: this.mode,
    startedAt: this.startedAt,
    endsAt: this.endsAt,
    submittedAt: this.submittedAt,
    lastSavedAt: this.lastSavedAt,
    answeredCount,
    markedReviewCount,
    totalQuestions: this.questionSnapshot.length,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export const Attempt = mongoose.model('Attempt', attemptSchema);
