import type { RequestHandler } from 'express';

import { getAuthenticatedUser } from '../../shared/middleware/require-auth';
import {
  enrollmentIdParamSchema,
  submitAttemptSchema,
  unlockAttemptsSchema,
} from './assessments.schemas';
import { attemptsService, type AttemptsService } from './attempts.service';

export function createAttemptsController(service: AttemptsService = attemptsService) {
  const submit: RequestHandler = async (req, res) => {
    const { id } = enrollmentIdParamSchema.parse(req.params);
    const input = submitAttemptSchema.parse(req.body);

    res.status(201).json(await service.submit(id, input, getAuthenticatedUser(req)));
  };

  const list: RequestHandler = async (req, res) => {
    const { id } = enrollmentIdParamSchema.parse(req.params);

    res.status(200).json(await service.listByEnrollment(id, getAuthenticatedUser(req)));
  };

  const unlock: RequestHandler = async (req, res) => {
    const { id } = enrollmentIdParamSchema.parse(req.params);
    const input = unlockAttemptsSchema.parse(req.body);

    res.status(200).json(await service.unlock(id, input));
  };

  return { submit, list, unlock };
}
