import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      enum: ['A', 'B', 'C', 'D'],
      required: true
    },
    text: {
      type: String,
      required: [true, 'Option text is required'],
      trim: true
    }
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    competitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competition',
      required: [true, 'Competition ID is required'],
      index: true
    },
    order: {
      type: Number,
      default: 1
    },
    prompt: {
      type: String,
      required: [true, 'Question text/prompt is required'],
      trim: true,
      minlength: [3, 'Question text must be at least 3 characters long']
    },
    options: {
      type: [optionSchema],
      required: [true, 'Options are required'],
      validate: {
        validator: function (v) {
          if (!Array.isArray(v) || v.length !== 4) return false;
          const keys = v.map((o) => o.key);
          const hasAllKeys = ['A', 'B', 'C', 'D'].every((k) => keys.includes(k));
          const allHaveText = v.every((o) => typeof o.text === 'string' && o.text.trim().length > 0);
          return hasAllKeys && allHaveText;
        },
        message: 'Question must have exactly 4 non-empty options with keys A, B, C, and D'
      }
    },
    // CRITICAL SECURITY: correctOption is never selected by default
    correctOption: {
      type: String,
      enum: ['A', 'B', 'C', 'D'],
      required: [true, 'Correct option key (A, B, C, or D) is required'],
      select: false
    },
    marks: {
      type: Number,
      default: 1,
      min: [0.1, 'Marks must be at least 0.1']
    },
    negativeMarks: {
      type: Number,
      default: 0,
      min: [0, 'Negative marks cannot be less than 0']
    },
    // CRITICAL SECURITY: explanation is never selected by default
    explanation: {
      type: String,
      trim: true,
      default: '',
      select: false
    },
    classOrGrade: {
      type: String,
      trim: true,
      default: ''
    },
    subject: {
      type: String,
      trim: true,
      default: 'General'
    },
    topic: {
      type: String,
      trim: true,
      default: 'General'
    },
    isActive: {
      type: Boolean,
      default: true
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

// Indexes
questionSchema.index({ competitionId: 1, order: 1 });
questionSchema.index({ competitionId: 1, isActive: 1 });

/**
 * Public / Student Safe Serializer:
 * STRICTLY omits correctOption, explanation, and server-side secret markers.
 */
questionSchema.methods.toStudentJSON = function () {
  return {
    id: this._id.toString(),
    competitionId: this.competitionId.toString(),
    order: this.order,
    prompt: this.prompt,
    options: this.options.map((o) => ({ key: o.key, text: o.text })),
    marks: this.marks,
    classOrGrade: this.classOrGrade,
    subject: this.subject,
    topic: this.topic
  };
};

/**
 * Admin Safe Serializer:
 * Includes correctOption and explanation for verified administrators.
 */
questionSchema.methods.toAdminJSON = function () {
  return {
    id: this._id.toString(),
    competitionId: this.competitionId.toString(),
    order: this.order,
    prompt: this.prompt,
    options: this.options.map((o) => ({ key: o.key, text: o.text })),
    correctOption: this.correctOption,
    marks: this.marks,
    negativeMarks: this.negativeMarks,
    explanation: this.explanation,
    classOrGrade: this.classOrGrade,
    subject: this.subject,
    topic: this.topic,
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export const Question = mongoose.model('Question', questionSchema);
