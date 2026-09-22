import type { RequestHandler } from 'express';

import { getAuthenticatedUser } from '../../shared/middleware/require-auth';
import {
  createAssessmentSchema,
  createQuestionSchema,
  questionParamsSchema,
  trainingIdParamSchema,
  updateAssessmentSchema,
  updateQuestionSchema,
} from './assessments.schemas';
import { assessmentsService, type AssessmentsService } from './assessments.service';

export function createAssessmentsController(service: AssessmentsService = assessmentsService) {
  const get: RequestHandler = async (req, res) => {
    const { trainingId } = trainingIdParamSchema.parse(req.params);

    res.status(200).json(await service.getForActor(trainingId, getAuthenticatedUser(req)));
  };

  const create: RequestHandler = async (req, res) => {
    const { trainingId } = trainingIdParamSchema.parse(req.params);
    const input = createAssessmentSchema.parse(req.body);

    res.status(201).json(await service.create(trainingId, input));
  };

  const update: RequestHandler = async (req, res) => {
    const { trainingId } = trainingIdParamSchema.parse(req.params);
    const input = updateAssessmentSchema.parse(req.body);

    res.status(200).json(await service.update(trainingId, input));
  };

  const remove: RequestHandler = async (req, res) => {
    const { trainingId } = trainingIdParamSchema.parse(req.params);

    await service.remove(trainingId);
    res.status(204).send();
  };

  const addQuestion: RequestHandler = async (req, res) => {
    const { trainingId } = trainingIdParamSchema.parse(req.params);
    const input = createQuestionSchema.parse(req.body);

    res.status(201).json(await service.addQuestion(trainingId, input));
  };

  const updateQuestion: RequestHandler = async (req, res) => {
    const { trainingId, questionId } = questionParamsSchema.parse(req.params);
    const input = updateQuestionSchema.parse(req.body);

    res.status(200).json(await service.updateQuestion(trainingId, questionId, input));
  };

  const removeQuestion: RequestHandler = async (req, res) => {
    const { trainingId, questionId } = questionParamsSchema.parse(req.params);

    await service.removeQuestion(trainingId, questionId);
    res.status(204).send();
  };

  return { get, create, update, remove, addQuestion, updateQuestion, removeQuestion };
}
