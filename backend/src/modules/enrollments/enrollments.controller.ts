import type { RequestHandler } from 'express';

import { getAuthenticatedUser } from '../../shared/middleware/require-auth';
import {
  assignTrainingSchema,
  createEnrollmentSchema,
  enrollmentIdParamSchema,
  listEnrollmentsQuerySchema,
} from './enrollments.schemas';
import { enrollmentsService, type EnrollmentsService } from './enrollments.service';

export function createEnrollmentsController(service: EnrollmentsService = enrollmentsService) {
  const list: RequestHandler = async (req, res) => {
    const query = listEnrollmentsQuerySchema.parse(req.query);

    res.status(200).json(await service.list(query, getAuthenticatedUser(req)));
  };

  const getById: RequestHandler = async (req, res) => {
    const { id } = enrollmentIdParamSchema.parse(req.params);

    res.status(200).json(await service.getById(id, getAuthenticatedUser(req)));
  };

  const create: RequestHandler = async (req, res) => {
    const input = createEnrollmentSchema.parse(req.body);
    const { enrollment, alreadyEnrolled } = await service.create(input);

    // 200 quando já existia, 201 quando foi criada agora.
    res.status(alreadyEnrolled ? 200 : 201).json({ enrollment, alreadyEnrolled });
  };

  const assign: RequestHandler = async (req, res) => {
    const input = assignTrainingSchema.parse(req.body);

    res.status(200).json(await service.assign(input, getAuthenticatedUser(req)));
  };

  return { list, getById, create, assign };
}
