import { normalizeIndianMobile } from '../models/user.model.js';

export const validateStudentRegistration = (data) => {
  const errors = [];
  const trimmed = {};

  // 1. Full Name
  if (!data.fullName || typeof data.fullName !== 'string' || !data.fullName.trim()) {
    errors.push('Full name is required');
  } else {
    trimmed.fullName = data.fullName.trim();
    if (trimmed.fullName.length < 2) {
      errors.push('Full name must be at least 2 characters long');
    } else if (trimmed.fullName.length > 100) {
      errors.push('Full name cannot exceed 100 characters');
    }
  }

  // 2. Mobile
  if (!data.mobile || typeof data.mobile !== 'string' || !data.mobile.trim()) {
    errors.push('Mobile number is required');
  } else {
    trimmed.mobile = data.mobile.trim();
    const normalized = normalizeIndianMobile(trimmed.mobile);
    if (!normalized) {
      errors.push('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9');
    } else {
      trimmed.mobileNormalized = normalized;
    }
  }

  // 3. School Name
  if (!data.school || typeof data.school !== 'string' || !data.school.trim()) {
    errors.push('School/College name is required');
  } else {
    trimmed.school = data.school.trim();
    if (trimmed.school.length < 2) {
      errors.push('School/College name must be at least 2 characters long');
    } else if (trimmed.school.length > 150) {
      errors.push('School/College name cannot exceed 150 characters');
    }
  }

  // 4. Class / Grade (support classOrGrade or classGrade)
  const classVal = data.classOrGrade || data.classGrade;
  if (!classVal || typeof classVal !== 'string' || !classVal.trim()) {
    errors.push('Class / Grade is required');
  } else {
    trimmed.classOrGrade = classVal.trim();
  }

  // 5. Password
  if (!data.password || typeof data.password !== 'string') {
    errors.push('Password is required');
  } else if (data.password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }

  // 6. Confirm Password
  if (!data.confirmPassword && data.confirmPassword !== '') {
    errors.push('Password confirmation is required');
  } else if (data.password !== data.confirmPassword) {
    errors.push('Password and Confirm Password do not match');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: trimmed
  };
};

export const validateLogin = (data) => {
  const errors = [];
  const sanitized = {};

  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      errors: ['Request body must be a valid JSON object'],
      sanitized: {}
    };
  }

  // 1. Mobile
  if (!data.mobile || typeof data.mobile !== 'string' || !data.mobile.trim()) {
    errors.push('Mobile number is required');
  } else {
    const trimmedMobile = data.mobile.trim();
    const normalized = normalizeIndianMobile(trimmedMobile);
    if (!normalized) {
      errors.push('Please enter a valid 10-digit Indian mobile number');
    } else {
      sanitized.mobile = trimmedMobile;
      sanitized.mobileNormalized = normalized;
    }
  }

  // 2. Password
  if (!data.password || typeof data.password !== 'string') {
    errors.push('Password is required');
  } else {
    sanitized.password = data.password;
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
};
