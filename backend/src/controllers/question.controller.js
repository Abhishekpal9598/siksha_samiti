import mongoose from 'mongoose';
import { Question } from '../models/question.model.js';
import { Competition } from '../models/competition.model.js';
import { validateQuestion } from '../validators/competition.validator.js';

// 1. Admin: List All Questions for a Competition (Includes correctOption and explanation)
export const listAdminQuestions = async (req, res, next) => {
  try {
    const { competitionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(competitionId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid competition ID format.',
          details: [],
          requestId: req.id
        }
      });
    }

    const query = { competitionId, isActive: true };

    // Search filter
    if (req.query.search) {
      query.prompt = { $regex: req.query.search.trim(), $options: 'i' };
    }
    if (req.query.subject && req.query.subject !== 'all') {
      query.subject = req.query.subject.trim();
    }
    if (req.query.classOrGrade && req.query.classOrGrade !== 'all') {
      query.classOrGrade = req.query.classOrGrade.trim();
    }

    // Explicitly select correctOption and explanation for Admin
    const questions = await Question.find(query)
      .select('+correctOption +explanation')
      .sort({ order: 1, createdAt: 1 });

    return res.status(200).json({
      success: true,
      count: questions.length,
      questions: questions.map((q) => q.toAdminJSON())
    });
  } catch (err) {
    next(err);
  }
};

// 2. Admin: Add Question to Competition
export const createQuestion = async (req, res, next) => {
  try {
    const { competitionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(competitionId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid competition ID format.',
          details: [],
          requestId: req.id
        }
      });
    }

    const competition = await Competition.findById(competitionId);
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

    if (competition.status === 'ARCHIVED') {
      return res.status(400).json({
        error: {
          code: 'ARCHIVED_COMPETITION',
          message: 'Cannot add questions to an archived competition.',
          details: [],
          requestId: req.id
        }
      });
    }

    if (competition.status === 'CLOSED') {
      return res.status(400).json({
        error: {
          code: 'CLOSED_COMPETITION',
          message: 'Cannot add questions to a closed competition.',
          details: [],
          requestId: req.id
        }
      });
    }

    if (['APPROVED', 'PUBLISHED'].includes(competition.resultStatus)) {
      return res.status(400).json({
        error: {
          code: 'CANNOT_MUTATE_APPROVED_QUESTIONS',
          message: `Cannot add questions when competition results are in '${competition.resultStatus}' state. Please request revision first.`,
          details: [],
          requestId: req.id
        }
      });
    }

    const { isValid, errors, sanitized } = validateQuestion(req.body);
    if (!isValid) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: errors[0] || 'Invalid question data.',
          details: errors,
          requestId: req.id
        }
      });
    }

    // Determine auto-order if not provided
    let order = sanitized.order;
    if (!req.body.order) {
      const highestOrder = await Question.findOne({ competitionId }).sort({ order: -1 }).select('order');
      order = highestOrder ? highestOrder.order + 1 : 1;
    }

    const newQuestion = await Question.create({
      competitionId,
      ...sanitized,
      order,
      isActive: true
    });

    return res.status(201).json({
      success: true,
      message: 'Question added successfully to Question Bank.',
      question: newQuestion.toAdminJSON()
    });
  } catch (err) {
    next(err);
  }
};

// 3. Admin: Update Question
export const updateQuestion = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid question ID format.',
          details: [],
          requestId: req.id
        }
      });
    }

    const question = await Question.findById(questionId).select('+correctOption +explanation');
    if (!question) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Question not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    const competition = await Competition.findById(question.competitionId);
    if (competition) {
      if (competition.status === 'ARCHIVED') {
        return res.status(400).json({
          error: {
            code: 'ARCHIVED_COMPETITION',
            message: 'Cannot update questions in an archived competition.',
            details: [],
            requestId: req.id
          }
        });
      }
      if (competition.status === 'CLOSED') {
        return res.status(400).json({
          error: {
            code: 'CLOSED_COMPETITION',
            message: 'Cannot update questions in a closed competition.',
            details: [],
            requestId: req.id
          }
        });
      }
      if (['APPROVED', 'PUBLISHED'].includes(competition.resultStatus)) {
        return res.status(400).json({
          error: {
            code: 'CANNOT_MUTATE_APPROVED_QUESTIONS',
            message: `Cannot edit questions when competition results are in '${competition.resultStatus}' state. Please request revision first.`,
            details: [],
            requestId: req.id
          }
        });
      }
    }

    const { isValid, errors, sanitized } = validateQuestion({
      ...question.toObject(),
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

    Object.assign(question, sanitized);
    await question.save();

    return res.status(200).json({
      success: true,
      message: 'Question updated successfully.',
      question: question.toAdminJSON()
    });
  } catch (err) {
    next(err);
  }
};

// 4. Admin: Delete Question
export const deleteQuestion = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid question ID format.',
          details: [],
          requestId: req.id
        }
      });
    }

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Question not found.',
          details: [],
          requestId: req.id
        }
      });
    }

    const competition = await Competition.findById(question.competitionId);
    if (competition) {
      if (competition.status === 'ARCHIVED') {
        return res.status(400).json({
          error: {
            code: 'ARCHIVED_COMPETITION',
            message: 'Cannot delete questions from an archived competition.',
            details: [],
            requestId: req.id
          }
        });
      }
      if (competition.status === 'CLOSED') {
        return res.status(400).json({
          error: {
            code: 'CLOSED_COMPETITION',
            message: 'Cannot delete questions from a closed competition.',
            details: [],
            requestId: req.id
          }
        });
      }
      if (['APPROVED', 'PUBLISHED'].includes(competition.resultStatus)) {
        return res.status(400).json({
          error: {
            code: 'CANNOT_MUTATE_APPROVED_QUESTIONS',
            message: `Cannot delete questions when competition results are in '${competition.resultStatus}' state. Please request revision first.`,
            details: [],
            requestId: req.id
          }
        });
      }
      if (competition.status === 'PUBLISHED') {
        const questionCount = await Question.countDocuments({ competitionId: competition._id, isActive: true });
        if (questionCount <= 1) {
          return res.status(400).json({
            error: {
              code: 'CANNOT_DELETE_LAST_QUESTION',
              message: 'Cannot delete the only question of a PUBLISHED competition. A published competition must retain at least one question.',
              details: [],
              requestId: req.id
            }
          });
        }
      }
    }

    await question.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Question removed from Question Bank.'
    });
  } catch (err) {
    next(err);
  }
};
