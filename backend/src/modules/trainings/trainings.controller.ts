import type { RequestHandler } from 'express';

import { getAuthenticatedUser } from '../../shared/middleware/require-auth';
import {
  changeStatusSchema,
  createTrainingSchema,
  listTrainingsQuerySchema,
  trainingIdParamSchema,
  updateTrainingSchema,
} from './trainings.schemas';
import { trainingsService, type TrainingsService } from './trainings.service';

export function createTrainingsController(service: TrainingsService = trainingsService) {
  const list: RequestHandler = async (req, res) => {
    const query = listTrainingsQuerySchema.parse(req.query);

    res.status(200).json(await service.list(query, getAuthenticatedUser(req)));
  };

  const getById: RequestHandler = async (req, res) => {
    const { id } = trainingIdParamSchema.parse(req.params);

    res.status(200).json(await service.getById(id, getAuthenticatedUser(req)));
  };

  const create: RequestHandler = async (req, res) => {
    const input = createTrainingSchema.parse(req.body);

    res.status(201).json(await service.create(input, getAuthenticatedUser(req)));
  };

  const update: RequestHandler = async (req, res) => {
    const { id } = trainingIdParamSchema.parse(req.params);
    const input = updateTrainingSchema.parse(req.body);

    res.status(200).json(await service.update(id, input));
  };

  const changeStatus: RequestHandler = async (req, res) => {
    const { id } = trainingIdParamSchema.parse(req.params);
    const { status } = changeStatusSchema.parse(req.body);

    res.status(200).json(await service.changeStatus(id, status));
  };

  return { list, getById, create, update, changeStatus };
}
