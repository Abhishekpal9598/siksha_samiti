import mongoose from 'mongoose';

const itemBreakdownSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true
    },
    selectedOption: {
      type: String,
      default: null
    },
    correctOption: {
      type: String,
      required: true
    },
    isCorrect: {
      type: Boolean,
      required: true
    },
    isAttempted: {
      type: Boolean,
      required: true
    },
    marksAwarded: {
      type: Number,
      required: true
    },
    marksDeducted: {
      type: Number,
      required: true
    }
  },
  { _id: false }
);

const resultSchema = new mongoose.Schema(
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
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attempt',
      required: [true, 'Attempt ID is required'],
      unique: true,
      index: true
    },
    registrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Registration',
      required: [true, 'Registration ID is required'],
      index: true
    },
    rollNumber: {
      type: String,
      required: [true, 'Roll number is required'],
      trim: true,
      uppercase: true
    },
    studentName: {
      type: String,
      required: [true, 'Student name is required'],
      trim: true
    },
    school: {
      type: String,
      trim: true,
      default: ''
    },
    classOrGrade: {
      type: String,
      trim: true,
      default: ''
    },
    mode: {
      type: String,
      enum: ['ONLINE_MCQ', 'OMR'],
      default: 'ONLINE_MCQ'
    },
    totalQuestions: {
      type: Number,
      required: true
    },
    attemptedQuestions: {
      type: Number,
      required: true
    },
    correctAnswers: {
      type: Number,
      required: true
    },
    incorrectAnswers: {
      type: Number,
      required: true
    },
    unansweredQuestions: {
      type: Number,
      required: true
    },
    positiveMarks: {
      type: Number,
      required: true
    },
    negativeDeduction: {
      type: Number,
      required: true
    },
    finalScore: {
      type: Number,
      required: true
    },
    maximumMarks: {
      type: Number,
      required: true
    },
    rank: {
      type: Number,
      default: null,
      index: true
    },
    scoringVersion: {
      type: Number,
      default: 1
    },
    evaluatedAt: {
      type: Date,
      default: Date.now
    },
    submittedAt: {
      type: Date
    },
    // CRITICAL SECURITY: itemBreakdown is never selected by default; strictly internal audit data
    itemBreakdown: {
      type: [itemBreakdownSchema],
      select: false,
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
        delete ret.itemBreakdown;
        return ret;
      }
    }
  }
);

// STRICT INTEGRITY INDEXES:
// 1. One result per student per competition (Strict Unique Compound Index)
resultSchema.index({ competitionId: 1, studentId: 1 }, { unique: true });
// 2. Ranking and Merit List sorting indexes
resultSchema.index({ competitionId: 1, rank: 1 });
resultSchema.index({ competitionId: 1, finalScore: -1 });

/**
 * Safe Student Serializer:
 * Displays student's own verified scorecard without exposing other students or answer keys.
 */
resultSchema.methods.toStudentJSON = function (competitionTitle = '', isPublicMeritListEnabled = false) {
  return {
    id: this._id.toString(),
    competitionId: (this.competitionId?._id || this.competitionId).toString(),
    competitionTitle: competitionTitle || undefined,
    isPublicMeritListEnabled: Boolean(isPublicMeritListEnabled),
    rollNumber: this.rollNumber,
    studentName: this.studentName,
    school: this.school,
    classOrGrade: this.classOrGrade,
    mode: this.mode,
    totalQuestions: this.totalQuestions,
    attemptedQuestions: this.attemptedQuestions,
    correctAnswers: this.correctAnswers,
    incorrectAnswers: this.incorrectAnswers,
    unansweredQuestions: this.unansweredQuestions,
    positiveMarks: this.positiveMarks,
    negativeDeduction: this.negativeDeduction,
    finalScore: this.finalScore,
    maximumMarks: this.maximumMarks,
    rank: this.rank,
    scoringVersion: this.scoringVersion,
    evaluatedAt: this.evaluatedAt,
    submittedAt: this.submittedAt
  };
};

/**
 * Safe Public Merit List Serializer:
 * Exposes ONLY approved public merit fields when publication is enabled by Committee Head.
 * Strict zero-leak of contact numbers, internal breakdown, or answer keys.
 */
resultSchema.methods.toPublicMeritJSON = function () {
  return {
    rank: this.rank,
    rollNumber: this.rollNumber,
    studentName: this.studentName,
    school: this.school,
    classOrGrade: this.classOrGrade,
    finalScore: this.finalScore,
    maximumMarks: this.maximumMarks
  };
};

/**
 * Internal Admin Merit List Serializer:
 * Full evaluation metrics for authorized committee personnel.
 */
resultSchema.methods.toAdminMeritJSON = function () {
  return {
    id: this._id.toString(),
    competitionId: this.competitionId.toString(),
    studentId: this.studentId.toString(),
    attemptId: this.attemptId.toString(),
    registrationId: this.registrationId.toString(),
    rank: this.rank,
    rollNumber: this.rollNumber,
    studentName: this.studentName,
    school: this.school,
    classOrGrade: this.classOrGrade,
    mode: this.mode,
    totalQuestions: this.totalQuestions,
    attemptedQuestions: this.attemptedQuestions,
    correctAnswers: this.correctAnswers,
    incorrectAnswers: this.incorrectAnswers,
    unansweredQuestions: this.unansweredQuestions,
    positiveMarks: this.positiveMarks,
    negativeDeduction: this.negativeDeduction,
    finalScore: this.finalScore,
    maximumMarks: this.maximumMarks,
    scoringVersion: this.scoringVersion,
    evaluatedAt: this.evaluatedAt,
    submittedAt: this.submittedAt
  };
};

export const Result = mongoose.model('Result', resultSchema);
