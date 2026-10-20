import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * Normalizes Indian mobile numbers:
 * - Removes non-digits
 * - Handles optional leading '91' or '0'
 * - Validates 10-digit format starting with 6, 7, 8, or 9
 */
export const normalizeIndianMobile = (rawMobile) => {
  if (!rawMobile || typeof rawMobile !== 'string') return null;
  const digits = rawMobile.replace(/\D/g, '');

  if (digits.length === 12 && digits.startsWith('91')) {
    const last10 = digits.slice(2);
    if (/^[6-9]\d{9}$/.test(last10)) return last10;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    const last10 = digits.slice(1);
    if (/^[6-9]\d{9}$/.test(last10)) return last10;
  }

  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }

  return null;
};

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters long'],
      maxlength: [100, 'Full name cannot exceed 100 characters']
    },
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true
    },
    mobileNormalized: {
      type: String,
      required: [true, 'Normalized mobile number is required'],
      unique: true,
      index: true
    },
    school: {
      type: String,
      required: [true, 'School/College name is required'],
      trim: true,
      minlength: [2, 'School name must be at least 2 characters long'],
      maxlength: [150, 'School name cannot exceed 150 characters']
    },
    classOrGrade: {
      type: String,
      required: [true, 'Class or Grade is required'],
      trim: true
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false // never returned in default queries
    },
    role: {
      type: String,
      enum: {
        values: ['student', 'admin'],
        message: 'Role must be either student or admin'
      },
      default: 'student'
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
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Compound index for role-based queries
userSchema.index({ role: 1, isActive: 1 });

// Password comparison method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash) {
    throw new Error('Password hash not loaded for comparison');
  }
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Safe object representation
userSchema.methods.toSafeObject = function () {
  return {
    id: this._id.toString(),
    fullName: this.fullName,
    mobile: this.mobile,
    mobileNormalized: this.mobileNormalized,
    school: this.school,
    classOrGrade: this.classOrGrade,
    role: this.role,
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export const User = mongoose.model('User', userSchema);
