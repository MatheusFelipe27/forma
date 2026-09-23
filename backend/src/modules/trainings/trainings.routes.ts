import { Role } from '@prisma/client';
import { Router } from 'express';

import { requireAuth } from '../../shared/middleware/require-auth';
import { requireRole } from '../../shared/middleware/require-role';
import { createTrainingModulesController } from './training-modules.controller';
import { createTrainingsController } from './trainings.controller';

export function createTrainingsRoutes(): Router {
  const routes = Router();
  const trainings = createTrainingsController();
  const modules = createTrainingModulesController();

  const canWrite = [requireAuth, requireRole(Role.MANAGER, Role.ADMIN)];

  routes.get('/trainings', requireAuth, trainings.list);
  routes.get('/trainings/:id', requireAuth, trainings.getById);

  routes.post('/trainings', canWrite, trainings.create);
  routes.patch('/trainings/:id', canWrite, trainings.update);
  routes.patch('/trainings/:id/status', canWrite, trainings.changeStatus);

  routes.post('/trainings/:trainingId/modules', canWrite, modules.add);
  routes.patch('/trainings/:trainingId/modules/:moduleId', canWrite, modules.update);
  routes.delete('/trainings/:trainingId/modules/:moduleId', canWrite, modules.remove);

  return routes;
}
