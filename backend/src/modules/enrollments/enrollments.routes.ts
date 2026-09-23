import { Role } from '@prisma/client';
import { Router } from 'express';

import { requireAuth } from '../../shared/middleware/require-auth';
import { requireRole } from '../../shared/middleware/require-role';
import { createEnrollmentsController } from './enrollments.controller';
import { createModuleProgressController } from './module-progress.controller';

export function createEnrollmentsRoutes(): Router {
  const routes = Router();
  const enrollments = createEnrollmentsController();
  const progress = createModuleProgressController();

  const canAssign = [requireAuth, requireRole(Role.MANAGER, Role.ADMIN)];

  routes.get('/enrollments', requireAuth, enrollments.list);
  routes.get('/enrollments/:id', requireAuth, enrollments.getById);

  routes.post('/enrollments', canAssign, enrollments.create);
  routes.post('/assignments', canAssign, enrollments.assign);

  // Autorização fina (só o próprio matriculado) fica no service.
  routes.post('/enrollments/:id/modules/:moduleId/complete', requireAuth, progress.complete);

  return routes;
}
