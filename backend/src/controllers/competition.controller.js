import mongoose from 'mongoose';
import { Competition } from '../models/competition.model.js';
import { Question } from '../models/question.model.js';
import { Registration, generateRollNumber } from '../models/registration.model.js';
import { validateCompetition, validateStudentRegistration } from '../validators/competition.validator.js';

/**
 * PUBLIC / STUDENT ENDPOINTS
 */

// 1. List all PUBLISHED competitions
export const listPublishedCompetitions = async (req, res, next) => {
  try {
    const competitions = await Competition.find({ status: 'PUBLISHED' })
      .sort({ examDate: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: competitions.length,
      competitions: competitions.map((c) => ({
        id: c._id.toString(),
        title: c.title,
        slug: c.slug,
        description: c.description,
        examDate: c.examDate,
        startTime: c.startTime,
        endTime: c.endTime,
        examStartsAt: c.examStartsAt,
        eligibleClasses: c.eligibleClasses,
        durationMinutes: c.durationMinutes,
        mode: c.mode,
        totalMarks: c.totalMarks,
        marksPerQuestion: c.marksPerQuestion,
        negativeMarking: c.negativeMarking,
        registrationOpensAt: c.registrationOpensAt,
        registrationClosesAt: c.registrationClosesAt,
        status: c.status,
        resultStatus: c.resultStatus || 'NOT_EVALUATED',
        isPublicMeritListEnabled: Boolean(c.isPublicMeritListEnabled),
        resultsPublishedAt: c.resultsPublishedAt,
        instructions: c.instructions
      }))
    });
  } catch (err) {
    next(err);
  }
};

// 2. Get details of a single PUBLISHED competition
export const getPublishedCompetitionDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid competition ID format.',
          details: [],
          requestId: req.id
        }
      });
    }

    const competition = await Competition.findOne({ _id: id, status: 'PUBLISHED' });
    if (!competition) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Competition not found or is not open to public.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Include total question count for transparency (without exposing questions or keys)
    const questionCount = await Question.countDocuments({ competitionId: competition._id, isActive: true });

    return res.status(200).json({
      success: true,
      competition: {
        ...competition.toPublicJSON(),
        questionCount
      }
    });
  } catch (err) {
    next(err);
  }
};

// 3. Register Authenticated Student for a Competition
export const registerStudentForCompetition = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid competition ID format.',
          details: [],
          requestId: req.id
        }
      });
    }

    const competition = await Competition.findById(id);
    if (!competition) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Competition not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Validate eligibility, timeline, and exam mode
    const validation = validateStudentRegistration(competition, req.user, req.body.examMode);
    if (!validation.isValid) {
      const statusCode = validation.errorCode === 'INELIGIBLE_CLASS' ? 403 : 400;
      return res.status(statusCode).json({
        error: {
          code: validation.errorCode,
          message: validation.errors[0],
          details: validation.errors,
          requestId: req.id
        }
      });
    }

    // Duplicate Check
    const existingRegistration = await Registration.findOne({
      competitionId: competition._id,
      studentId: req.user._id
    });

    if (existingRegistration) {
      return res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'You are already registered for this competition.',
          details: [`Registered with roll number: ${existingRegistration.rollNumber}`],
          requestId: req.id
        }
      });
    }

    // Concurrency-safe registration insertion with roll-number retry loop
    let registration = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (!registration && attempts < maxAttempts) {
      attempts += 1;
      const rollNumber = await generateRollNumber(competition);

      try {
        registration = await Registration.create({
          competitionId: competition._id,
          studentId: req.user._id,
          rollNumber,
          status: 'registered',
          examMode: validation.assignedMode,
          examModeLocked: true,
          examModeLockedAt: new Date(),
          registeredAt: new Date()
        });
      } catch (insertErr) {
        if (insertErr.code === 11000) {
          // Check if collision is due to duplicate student registration
          const isStudentDuplicate =
            Boolean(insertErr.keyPattern?.studentId) ||
            (insertErr.message && insertErr.message.includes('studentId'));

          if (isStudentDuplicate) {
            return res.status(409).json({
              error: {
                code: 'CONFLICT',
                message: 'You are already registered for this competition.',
                details: [],
                requestId: req.id
              }
            });
          }

          // If collision was on rollNumber and retries remain, loop will acquire next atomic sequence
          if (attempts < maxAttempts) {
            continue;
          }
        }
        throw insertErr;
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Successfully registered for competition.',
      registration: {
        id: registration._id.toString(),
        competitionId: competition._id.toString(),
        competitionTitle: competition.title,
        rollNumber: registration.rollNumber,
        examMode: registration.examMode,
        examModeLocked: registration.examModeLocked,
        status: registration.status,
        registeredAt: registration.registeredAt
      }
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'You are already registered for this competition.',
          details: [],
          requestId: req.id
        }
      });
    }
    next(err);
  }
};

// 4. Get Current Student's Registrations
export const getMyRegistrations = async (req, res, next) => {
  try {
    const registrations = await Registration.find({ studentId: req.user._id })
      .populate('competitionId', 'title slug examDate startTime endTime mode status durationMinutes totalMarks')
      .sort({ registeredAt: -1 });

    const formatted = registrations.map((r) => {
      const comp = r.competitionId;
      return {
        id: r._id.toString(),
        rollNumber: r.rollNumber,
        status: r.status,
        examMode: r.examMode,
        examModeLocked: r.examModeLocked,
        registeredAt: r.registeredAt,
        competition: comp
          ? {
              id: comp._id.toString(),
              title: comp.title,
              slug: comp.slug,
              examDate: comp.examDate,
              startTime: comp.startTime,
              endTime: comp.endTime,
              mode: comp.mode,
              status: comp.status,
              durationMinutes: comp.durationMinutes,
              totalMarks: comp.totalMarks
            }
          : null
      };
    });

    return res.status(200).json({
      success: true,
      count: formatted.length,
      registrations: formatted
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN ENDPOINTS
 */

// 5. Admin: List All Competitions (with question & registration counts)
export const listAdminCompetitions = async (req, res, next) => {
  try {
    const query = {};
    if (req.query.status) {
      query.status = req.query.status.toString().toUpperCase();
    }

    const competitions = await Competition.find(query)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'fullName')
      .populate('publishedBy', 'fullName');

    // Aggregate counts for each competition
    const result = await Promise.all(
      competitions.map(async (comp) => {
        const questionCount = await Question.countDocuments({ competitionId: comp._id, isActive: true });
        const registrationCount = await Registration.countDocuments({ competitionId: comp._id, status: 'registered' });
        return {
          id: comp._id.toString(),
          title: comp.title,
          slug: comp.slug,
          description: comp.description,
          examDate: comp.examDate,
          startTime: comp.startTime,
          endTime: comp.endTime,
          examStartsAt: comp.examStartsAt,
          eligibleClasses: comp.eligibleClasses,
          durationMinutes: comp.durationMinutes,
          mode: comp.mode,
          totalMarks: comp.totalMarks,
          marksPerQuestion: comp.marksPerQuestion,
          negativeMarking: comp.negativeMarking,
          registrationOpensAt: comp.registrationOpensAt,
          registrationClosesAt: comp.registrationClosesAt,
          status: comp.status,
          resultStatus: comp.resultStatus || 'NOT_EVALUATED',
          scoringVersion: comp.scoringVersion || 1,
          tieBreakerRules: comp.tieBreakerRules || ['FINAL_SCORE', 'CORRECT_ANSWERS', 'INCORRECT_ANSWERS', 'SUBMISSION_TIME'],
          isPublicMeritListEnabled: Boolean(comp.isPublicMeritListEnabled),
          resultsPublishedAt: comp.resultsPublishedAt,
          instructions: comp.instructions,
          questionCount,
          registrationCount,
          createdBy: comp.createdBy ? comp.createdBy.fullName : null,
          publishedBy: comp.publishedBy ? comp.publishedBy.fullName : null,
          publishedAt: comp.publishedAt,
          createdAt: comp.createdAt,
          updatedAt: comp.updatedAt
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: result.length,
      competitions: result
    });
  } catch (err) {
    next(err);
  }
};

// 6. Admin: Create Competition
export const createCompetition = async (req, res, next) => {
  try {
    const { isValid, errors, sanitized } = validateCompetition(req.body);
    if (!isValid) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: errors[0] || 'Invalid competition data.',
          details: errors,
          requestId: req.id
        }
      });
    }

    const newCompetition = await Competition.create({
      ...sanitized,
      status: sanitized.status || 'DRAFT',
      createdBy: req.user._id
    });

    return res.status(201).json({
      success: true,
      message: 'Competition created successfully in DRAFT status.',
      competition: newCompetition.toJSON()
    });
  } catch (err) {
    next(err);
  }
};

// 7. Admin: Get Competition Details with Question and Registration Counts
export const getAdminCompetitionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid competition ID format.',
          details: [],
          requestId: req.id
        }
      });
    }

    const competition = await Competition.findById(id)
      .populate('createdBy', 'fullName')
      .populate('publishedBy', 'fullName');

    if (!competition) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Competition not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    const questionCount = await Question.countDocuments({ competitionId: competition._id, isActive: true });
    const registrationCount = await Registration.countDocuments({ competitionId: competition._id, status: 'registered' });

    return res.status(200).json({
      success: true,
      competition: {
        ...competition.toJSON(),
        questionCount,
        registrationCount
      }
    });
  } catch (err) {
    next(err);
  }
};

// 8. Admin: Update Competition Fields
export const updateCompetition = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid competition ID format.',
          details: [],
          requestId: req.id
        }
      });
    }

    const competition = await Competition.findById(id);
    if (!competition) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Competition not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Restrict edits if competition is ARCHIVED
    if (competition.status === 'ARCHIVED') {
      return res.status(400).json({
        error: {
          code: 'ARCHIVED_COMPETITION',
          message: 'Archived competitions cannot be modified.',
          details: [],
          requestId: req.id
        }
      });
    }

    // Restrict configuration modifications if results have been APPROVED or PUBLISHED
    if (['APPROVED', 'PUBLISHED'].includes(competition.resultStatus)) {
      const sensitiveFields = ['totalMarks', 'marksPerQuestion', 'negativeMarking', 'mode', 'eligibleClasses', 'scoreFloorZero', 'tieBreakerRules'];
      const hasSensitiveUpdate = sensitiveFields.some((field) => req.body[field] !== undefined);
      if (hasSensitiveUpdate) {
        return res.status(400).json({
          error: {
            code: 'CANNOT_MODIFY_APPROVED_COMPETITION',
            message: `Cannot modify exam or scoring configuration when results are in '${competition.resultStatus}' state. Request revision through the Committee Head first.`,
            details: [],
            requestId: req.id
          }
        });
      }
    }

    const { isValid, errors, sanitized } = validateCompetition({
      ...competition.toObject(),
      ...req.body
    });

    if (!isValid) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: errors[0],
          details: errors,
          requestId: req.id
        }
      });
    }

    // Safeguard active registrations when editing competition mode
    const registrationCount = await Registration.countDocuments({ competitionId: competition._id });
    if (registrationCount > 0 && sanitized.mode && sanitized.mode !== competition.mode) {
      if (sanitized.mode !== 'BOTH') {
        const conflictingReg = await Registration.findOne({
          competitionId: competition._id,
          examMode: sanitized.mode === 'ONLINE_MCQ' ? 'OMR' : 'ONLINE_MCQ'
        });
        if (conflictingReg) {
          return res.status(400).json({
            error: {
              code: 'CONF_MODE_CONFLICT',
              message: `Cannot change examination mode to '${sanitized.mode}' because registered students have already locked in the opposing mode.`,
              details: [`${registrationCount} registered student(s) exist.`],
              requestId: req.id
            }
          });
        }
      }
    }

    Object.assign(competition, sanitized);
    await competition.save();

    return res.status(200).json({
      success: true,
      message: 'Competition updated successfully.',
      competition: competition.toJSON()
    });
  } catch (err) {
    next(err);
  }
};

// 9. Admin: Update Competition Status (DRAFT, PUBLISHED, CLOSED, ARCHIVED)
export const updateCompetitionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const targetStatus = (req.body.status || '').toString().toUpperCase();

    if (!['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'].includes(targetStatus)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_STATUS',
          message: "Status must be 'DRAFT', 'PUBLISHED', 'CLOSED', or 'ARCHIVED'.",
          details: [],
          requestId: req.id
        }
      });
    }

    const competition = await Competition.findById(id);
    if (!competition) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Competition not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    const currentStatus = competition.status;

    // 1. Same status is a no-op
    if (currentStatus === targetStatus) {
      return res.status(200).json({
        success: true,
        message: `Competition is already in ${targetStatus} status.`,
        competition: competition.toJSON()
      });
    }

    // 2. ARCHIVED is an immutable terminal state
    if (currentStatus === 'ARCHIVED') {
      return res.status(400).json({
        error: {
          code: 'ARCHIVED_COMPETITION',
          message: 'Archived competitions are immutable and cannot change status.',
          details: ['ARCHIVED is a terminal state.'],
          requestId: req.id
        }
      });
    }

    // 3. Define allowed transitions
    const validTransitions = {
      DRAFT: ['PUBLISHED', 'ARCHIVED'],
      PUBLISHED: ['CLOSED', 'DRAFT'],
      CLOSED: ['PUBLISHED', 'ARCHIVED']
    };

    if (!validTransitions[currentStatus]?.includes(targetStatus)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot transition competition status from '${currentStatus}' to '${targetStatus}'.`,
          details: [`Allowed transitions from ${currentStatus}: ${validTransitions[currentStatus]?.join(', ') || 'none'}`],
          requestId: req.id
        }
      });
    }

    // 4. Gate: Publishing requires at least 1 question and valid schedule
    if (targetStatus === 'PUBLISHED') {
      const questionCount = await Question.countDocuments({ competitionId: competition._id, isActive: true });
      if (questionCount === 0) {
        return res.status(400).json({
          error: {
            code: 'CANNOT_PUBLISH_EMPTY_COMPETITION',
            message: 'Cannot publish competition without questions. Please add at least one question to the Question Bank before publishing.',
            details: ['Question count is currently 0'],
            requestId: req.id
          }
        });
      }

      const regOpens = new Date(competition.registrationOpensAt);
      const regCloses = new Date(competition.registrationClosesAt);
      const examDate = new Date(competition.examDate);

      if (isNaN(regOpens.getTime()) || isNaN(regCloses.getTime()) || isNaN(examDate.getTime())) {
        return res.status(400).json({
          error: {
            code: 'INCOMPLETE_COMPETITION_DATES',
            message: 'Cannot publish competition with invalid or missing dates.',
            details: [],
            requestId: req.id
          }
        });
      }

      if (regOpens >= regCloses) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REGISTRATION_WINDOW',
            message: 'Registration opening date must be strictly before registration closing date.',
            details: [],
            requestId: req.id
          }
        });
      }

      if (regCloses > examDate) {
        return res.status(400).json({
          error: {
            code: 'REGISTRATION_DEADLINE_EXCEEDS_EXAM',
            message: 'Registration closing date cannot be after the examination start date.',
            details: [],
            requestId: req.id
          }
        });
      }

      competition.publishedAt = new Date();
      competition.publishedBy = req.user._id;
    }

    // 5. Reverting PUBLISHED to DRAFT gate: Only allowed if NO student has registered yet!
    if (currentStatus === 'PUBLISHED' && targetStatus === 'DRAFT') {
      const regCount = await Registration.countDocuments({ competitionId: competition._id });
      if (regCount > 0) {
        return res.status(400).json({
          error: {
            code: 'CANNOT_REVERT_WITH_REGISTRATIONS',
            message: `Cannot revert competition to DRAFT because ${regCount} student(s) have already registered. Please close or archive the competition instead.`,
            details: [`Active registration count: ${regCount}`],
            requestId: req.id
          }
        });
      }
    }

    competition.status = targetStatus;
    await competition.save();

    return res.status(200).json({
      success: true,
      message: `Competition status successfully updated to ${targetStatus}.`,
      competition: competition.toJSON()
    });
  } catch (err) {
    next(err);
  }
};
