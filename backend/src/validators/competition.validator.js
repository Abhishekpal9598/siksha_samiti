export const validateCompetition = (data) => {
  const errors = [];
  const sanitized = {};

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Request body must be a valid JSON object'], sanitized: {} };
  }

  // 1. Title
  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
    errors.push('Competition title is required');
  } else {
    sanitized.title = data.title.trim();
    if (sanitized.title.length < 3) errors.push('Title must be at least 3 characters long');
    if (sanitized.title.length > 200) errors.push('Title cannot exceed 200 characters');
  }

  // 2. Description
  sanitized.description = typeof data.description === 'string' ? data.description.trim() : '';

  // 3. Duration in minutes
  const duration = parseInt(data.durationMinutes, 10);
  if (isNaN(duration) || duration < 1) {
    errors.push('Total duration in minutes must be a positive integer greater than 0');
  } else {
    sanitized.durationMinutes = duration;
  }

  // 4. Mode
  const rawMode = (data.mode || 'BOTH').toString().toUpperCase();
  if (!['ONLINE_MCQ', 'OMR', 'BOTH'].includes(rawMode)) {
    errors.push("Examination mode must be 'ONLINE_MCQ', 'OMR', or 'BOTH'");
  } else {
    sanitized.mode = rawMode;
  }

  // 5. Eligible Classes
  let classes = data.eligibleClasses;
  if (typeof classes === 'string') {
    classes = classes.split(',').map((c) => c.trim()).filter(Boolean);
  }
  if (!Array.isArray(classes) || classes.length === 0) {
    errors.push('At least one eligible class must be selected');
  } else {
    sanitized.eligibleClasses = classes.map((c) => String(c).trim()).filter(Boolean);
  }

  // 6. Dates Validation
  const now = new Date();

  // Registration Dates
  const regOpen = data.registrationOpensAt ? new Date(data.registrationOpensAt) : null;
  const regClose = data.registrationClosesAt ? new Date(data.registrationClosesAt) : null;

  if (!regOpen || isNaN(regOpen.getTime())) {
    errors.push('Valid registration opening date (registrationOpensAt) is required');
  } else {
    sanitized.registrationOpensAt = regOpen;
  }

  if (!regClose || isNaN(regClose.getTime())) {
    errors.push('Valid registration closing date (registrationClosesAt) is required');
  } else {
    sanitized.registrationClosesAt = regClose;
  }

  if (regOpen && regClose && !isNaN(regOpen.getTime()) && !isNaN(regClose.getTime())) {
    if (regOpen >= regClose) {
      errors.push('Registration opening date must be strictly before registration closing date');
    }
  }

  // Exam Dates
  const examStart = data.examStartsAt 
    ? new Date(data.examStartsAt) 
    : data.examDate 
      ? new Date(data.examDate) 
      : null;

  if (!examStart || isNaN(examStart.getTime())) {
    errors.push('Valid exam start date/timestamp (examStartsAt or examDate) is required');
  } else {
    sanitized.examStartsAt = examStart;
    sanitized.examDate = examStart;
    // Calculate default exam end if duration provided
    if (sanitized.durationMinutes) {
      sanitized.examEndsAt = new Date(examStart.getTime() + sanitized.durationMinutes * 60 * 1000);
    }
  }

  if (regClose && examStart && !isNaN(regClose.getTime()) && !isNaN(examStart.getTime())) {
    if (regClose > examStart) {
      errors.push('Registration deadline cannot be after the exam start date/time');
    }
  }

  // 7. Times
  sanitized.startTime = typeof data.startTime === 'string' ? data.startTime.trim() : '10:00 AM';
  sanitized.endTime = typeof data.endTime === 'string' ? data.endTime.trim() : '11:00 AM';

  // 8. Marks
  sanitized.totalMarks = data.totalMarks ? parseFloat(data.totalMarks) || 100 : 100;
  sanitized.marksPerQuestion = data.marksPerQuestion ? parseFloat(data.marksPerQuestion) || 1 : 1;

  // 9. Negative Marking
  if (data.negativeMarking && typeof data.negativeMarking === 'object') {
    const deduction = parseFloat(data.negativeMarking.perWrongMark ?? data.negativeMarking.deduction) || 0;
    sanitized.negativeMarking = {
      enabled: Boolean(data.negativeMarking.enabled),
      perWrongMark: Math.max(0, deduction),
      deduction: Math.max(0, deduction)
    };
  } else if (data.negativeMarkingPerWrong !== undefined) {
    const penalty = parseFloat(data.negativeMarkingPerWrong) || 0;
    sanitized.negativeMarking = {
      enabled: penalty > 0,
      perWrongMark: Math.max(0, penalty),
      deduction: Math.max(0, penalty)
    };
  } else {
    sanitized.negativeMarking = { enabled: false, perWrongMark: 0, deduction: 0 };
  }

  // 10. Status
  if (data.status) {
    const s = data.status.toString().toUpperCase();
    if (['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'].includes(s)) {
      sanitized.status = s;
    }
  }

  // 11. Instructions
  if (Array.isArray(data.instructions)) {
    sanitized.instructions = data.instructions.map((i) => String(i).trim()).filter(Boolean);
  }

  // 12. Phase 5 Scoring & Merit Configuration
  if (Array.isArray(data.tieBreakerRules) && data.tieBreakerRules.length > 0) {
    const validRules = ['FINAL_SCORE', 'CORRECT_ANSWERS', 'INCORRECT_ANSWERS', 'SUBMISSION_TIME'];
    sanitized.tieBreakerRules = data.tieBreakerRules.filter((r) => validRules.includes(r));
  }
  if (data.scoreFloorZero !== undefined) {
    sanitized.scoreFloorZero = Boolean(data.scoreFloorZero);
  }
  if (data.isPublicMeritListEnabled !== undefined) {
    sanitized.isPublicMeritListEnabled = Boolean(data.isPublicMeritListEnabled);
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
};

export const validateQuestion = (data) => {
  const errors = [];
  const sanitized = {};

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Request body must be a valid JSON object'], sanitized: {} };
  }

  // 1. Question Prompt
  const prompt = data.prompt || data.questionText;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    errors.push('Question text/prompt is required');
  } else {
    sanitized.prompt = prompt.trim();
    if (sanitized.prompt.length < 3) errors.push('Question prompt must be at least 3 characters long');
  }

  // 2. Options (Must be 4 options: A, B, C, D)
  if (!Array.isArray(data.options) || data.options.length !== 4) {
    errors.push('Question must have exactly 4 answer options (A, B, C, D)');
  } else {
    const keysFound = new Set();
    const parsedOptions = [];

    for (const opt of data.options) {
      if (!opt || typeof opt !== 'object') {
        errors.push('Invalid option structure');
        continue;
      }
      const key = (opt.key || opt.label || '').toString().trim().toUpperCase();
      const text = (opt.text || opt.value || '').toString().trim();

      if (!['A', 'B', 'C', 'D'].includes(key)) {
        errors.push(`Option key '${key}' is invalid. Must be A, B, C, or D`);
      }
      if (keysFound.has(key)) {
        errors.push(`Duplicate option key '${key}'`);
      }
      keysFound.add(key);

      if (!text) {
        errors.push(`Option ${key} text cannot be empty`);
      }

      parsedOptions.push({ key, text });
    }

    if (keysFound.size === 4) {
      sanitized.options = parsedOptions.sort((a, b) => a.key.localeCompare(b.key));
    }
  }

  // 3. Correct Option
  const correct = (data.correctOption || data.correctAnswer || '').toString().trim().toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(correct)) {
    errors.push("Correct answer key (correctOption) is required and must be 'A', 'B', 'C', or 'D'");
  } else {
    sanitized.correctOption = correct;
  }

  // 4. Marks
  const marks = parseFloat(data.marks);
  if (isNaN(marks) || marks <= 0) {
    errors.push('Marks per question must be a positive number greater than 0');
  } else {
    sanitized.marks = marks;
  }

  // 5. Negative Marks
  const neg = parseFloat(data.negativeMarks);
  if (isNaN(neg) || neg < 0) {
    sanitized.negativeMarks = 0;
  } else if (sanitized.marks && neg > sanitized.marks) {
    errors.push(`Negative marks deduction (${neg}) cannot exceed positive marks per question (${sanitized.marks})`);
  } else {
    sanitized.negativeMarks = neg;
  }

  // 6. Metadata
  sanitized.explanation = typeof data.explanation === 'string' ? data.explanation.trim() : '';
  sanitized.classOrGrade = typeof data.classOrGrade === 'string' ? data.classOrGrade.trim() : '';
  sanitized.subject = typeof data.subject === 'string' ? data.subject.trim() : 'General';
  sanitized.topic = typeof data.topic === 'string' ? data.topic.trim() : 'General';
  sanitized.order = parseInt(data.order, 10) || 1;

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
};

export const validateStudentRegistration = (competition, student, requestedMode) => {
  const errors = [];
  let assignedMode = null;

  // 1. Status Check
  if (competition.status !== 'PUBLISHED') {
    return {
      isValid: false,
      errorCode: 'COMPETITION_NOT_OPEN',
      errors: ['Registration is not available for this competition because it is not in PUBLISHED status.']
    };
  }

  // 2. Timeline Check
  const now = new Date();
  if (now < new Date(competition.registrationOpensAt)) {
    return {
      isValid: false,
      errorCode: 'REGISTRATION_NOT_STARTED',
      errors: ['Registration for this competition has not opened yet.']
    };
  }

  if (now > new Date(competition.registrationClosesAt)) {
    return {
      isValid: false,
      errorCode: 'REGISTRATION_CLOSED',
      errors: ['Registration for this competition is closed. The deadline has passed.']
    };
  }

  // 3. Class / Grade Eligibility Check
  const studentClass = (student.classOrGrade || '').trim().toLowerCase();
  const isEligible = competition.eligibleClasses.some((ec) => {
    const cleanEc = ec.trim().toLowerCase();
    return cleanEc === studentClass || studentClass.includes(cleanEc) || cleanEc.includes(studentClass);
  });

  if (!isEligible) {
    return {
      isValid: false,
      errorCode: 'INELIGIBLE_CLASS',
      errors: [`Student in '${student.classOrGrade}' is not eligible for this competition. Eligible classes: ${competition.eligibleClasses.join(', ')}`]
    };
  }

  // 4. Exam Mode Selection
  if (competition.mode === 'BOTH') {
    const modeUpper = (requestedMode || '').toString().trim().toUpperCase();
    if (!['ONLINE_MCQ', 'OMR'].includes(modeUpper)) {
      return {
        isValid: false,
        errorCode: 'MODE_REQUIRED',
        errors: ["For this competition, you must select either 'ONLINE_MCQ' or 'OMR' examination mode."]
      };
    }
    assignedMode = modeUpper;
  } else {
    // If competition is configured as ONLINE_MCQ or OMR, reject conflicting client-supplied mode
    if (requestedMode) {
      const modeUpper = requestedMode.toString().trim().toUpperCase();
      if (modeUpper !== competition.mode) {
        return {
          isValid: false,
          errorCode: 'INVALID_EXAM_MODE',
          errors: [`This competition only supports '${competition.mode}' examination mode. Requested mode '${modeUpper}' is invalid.`]
        };
      }
    }
    assignedMode = competition.mode;
  }

  return {
    isValid: true,
    assignedMode,
    errors: []
  };
};
