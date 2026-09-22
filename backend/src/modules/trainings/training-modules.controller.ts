import type { RequestHandler } from 'express';

import {
  createModuleSchema,
  moduleParamsSchema,
  trainingIdOnlyParamSchema,
  updateModuleSchema,
} from './training-modules.schemas';
import { trainingModulesService, type TrainingModulesService } from './training-modules.service';

export function createTrainingModulesController(
  service: TrainingModulesService = trainingModulesService,
) {
  const add: RequestHandler = async (req, res) => {
    const { trainingId } = trainingIdOnlyParamSchema.parse(req.params);
    const input = createModuleSchema.parse(req.body);

    res.status(201).json(await service.add(trainingId, input));
  };

  const update: RequestHandler = async (req, res) => {
    const { trainingId, moduleId } = moduleParamsSchema.parse(req.params);
    const input = updateModuleSchema.parse(req.body);

    res.status(200).json(await service.update(trainingId, moduleId, input));
  };

  const remove: RequestHandler = async (req, res) => {
    const { trainingId, moduleId } = moduleParamsSchema.parse(req.params);

    await service.remove(trainingId, moduleId);
    res.status(204).send();
  };

  return { add, update, remove };
}
