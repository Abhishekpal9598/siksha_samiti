import mongoose from 'mongoose';

const evaluationAuditLogSchema = new mongoose.Schema(
  {
    competitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competition',
      required: [true, 'Competition ID is required'],
      index: true
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Actor ID is required']
    },
    actorRole: {
      type: String,
      required: [true, 'Actor role is required'],
      trim: true
    },
    actorName: {
      type: String,
      required: [true, 'Actor name is required'],
      trim: true
    },
    action: {
      type: String,
      enum: {
        values: [
          'EVALUATE',
          'RE_EVALUATE',
          'REQUEST_APPROVAL',
          'APPROVE',
          'REJECT',
          'REVISION_REQUIRED',
          'PUBLISH',
          'UNPUBLISH',
          'UPDATE_TIE_BREAKER',
          'TOGGLE_PUBLIC_MERIT_LIST'
        ],
        message: 'Invalid evaluation audit action'
      },
      required: [true, 'Action is required']
    },
    scoringVersion: {
      type: Number,
      default: 1
    },
    reason: {
      type: String,
      trim: true,
      default: ''
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
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

evaluationAuditLogSchema.index({ competitionId: 1, timestamp: -1 });

export const EvaluationAuditLog = mongoose.model('EvaluationAuditLog', evaluationAuditLogSchema);
