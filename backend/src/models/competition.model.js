import mongoose from 'mongoose';

const competitionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Competition title is required'],
      trim: true,
      minlength: [3, 'Competition title must be at least 3 characters'],
      maxlength: [200, 'Competition title cannot exceed 200 characters']
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      index: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    examDate: {
      type: Date,
      required: [true, 'Exam date is required']
    },
    startTime: {
      type: String,
      trim: true,
      default: '10:00 AM'
    },
    endTime: {
      type: String,
      trim: true,
      default: '11:00 AM'
    },
    examStartsAt: {
      type: Date,
      required: [true, 'Exam start timestamp is required']
    },
    examEndsAt: {
      type: Date
    },
    eligibleClasses: {
      type: [String],
      required: [true, 'Eligible classes list is required'],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'At least one eligible class must be selected'
      }
    },
    durationMinutes: {
      type: Number,
      required: [true, 'Exam duration in minutes is required'],
      min: [1, 'Duration must be at least 1 minute']
    },
    mode: {
      type: String,
      enum: {
        values: ['ONLINE_MCQ', 'OMR', 'BOTH'],
        message: 'Mode must be ONLINE_MCQ, OMR, or BOTH'
      },
      default: 'BOTH'
    },
    totalMarks: {
      type: Number,
      default: 100,
      min: [1, 'Total marks must be greater than 0']
    },
    marksPerQuestion: {
      type: Number,
      default: 1,
      min: [0.1, 'Marks per question must be at least 0.1']
    },
    negativeMarking: {
      enabled: {
        type: Boolean,
        default: false
      },
      perWrongMark: {
        type: Number,
        default: 0,
        min: [0, 'Negative marks cannot be negative']
      },
      deduction: {
        type: Number,
        default: 0,
        min: [0, 'Negative deduction cannot be negative']
      }
    },
    registrationOpensAt: {
      type: Date,
      required: [true, 'Registration opening date is required']
    },
    registrationClosesAt: {
      type: Date,
      required: [true, 'Registration closing date is required']
    },
    status: {
      type: String,
      enum: {
        values: ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'],
        message: 'Status must be DRAFT, PUBLISHED, CLOSED, or ARCHIVED'
      },
      default: 'DRAFT',
      index: true
    },
    instructions: {
      type: [String],
      default: []
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    publishedAt: {
      type: Date
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    // PHASE 5: Scoring, Approval Gate & Merit List fields
    resultStatus: {
      type: String,
      enum: {
        values: ['NOT_EVALUATED', 'EVALUATED', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REVISION_REQUIRED'],
        message: 'Invalid resultStatus'
      },
      default: 'NOT_EVALUATED',
      index: true
    },
    scoringVersion: {
      type: Number,
      default: 1
    },
    tieBreakerRules: {
      type: [String],
      default: ['FINAL_SCORE', 'CORRECT_ANSWERS', 'INCORRECT_ANSWERS', 'SUBMISSION_TIME']
    },
    isPublicMeritListEnabled: {
      type: Boolean,
      default: false
    },
    scoreFloorZero: {
      type: Boolean,
      default: true
    },
    evaluatedAt: {
      type: Date
    },
    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: {
      type: Date
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resultsPublishedAt: {
      type: Date
    },
    resultsPublishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    revisionReason: {
      type: String,
      trim: true,
      default: ''
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

// Slug auto-generation & timestamp synchronization middleware
competitionSchema.pre('validate', function () {
  if (this.title && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
  }
  if (this.examDate && !this.examStartsAt) {
    this.examStartsAt = this.examDate;
  }
  if (this.examStartsAt && !this.examDate) {
    this.examDate = this.examStartsAt;
  }
  if (this.examStartsAt && this.durationMinutes && !this.examEndsAt) {
    this.examEndsAt = new Date(this.examStartsAt.getTime() + this.durationMinutes * 60 * 1000);
  }
});

// Indexes for query performance
competitionSchema.index({ status: 1, registrationOpensAt: 1, registrationClosesAt: 1 });
competitionSchema.index({ examDate: 1 });

// Safe public serializer
competitionSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    title: this.title,
    slug: this.slug,
    description: this.description,
    examDate: this.examDate,
    startTime: this.startTime,
    endTime: this.endTime,
    examStartsAt: this.examStartsAt,
    eligibleClasses: this.eligibleClasses,
    durationMinutes: this.durationMinutes,
    mode: this.mode,
    totalMarks: this.totalMarks,
    marksPerQuestion: this.marksPerQuestion,
    negativeMarking: {
      enabled: Boolean(this.negativeMarking?.enabled),
      perWrongMark: this.negativeMarking?.perWrongMark ?? this.negativeMarking?.deduction ?? 0,
      deduction: this.negativeMarking?.deduction ?? this.negativeMarking?.perWrongMark ?? 0
    },
    registrationOpensAt: this.registrationOpensAt,
    registrationClosesAt: this.registrationClosesAt,
    status: this.status,
    resultStatus: this.resultStatus || 'NOT_EVALUATED',
    isPublicMeritListEnabled: Boolean(this.isPublicMeritListEnabled),
    resultsPublishedAt: this.resultsPublishedAt,
    instructions: this.instructions
  };
};

export const Competition = mongoose.model('Competition', competitionSchema);
