import { Role } from '@prisma/client';
import { Router } from 'express';

import { requireAuth } from '../../shared/middleware/require-auth';
import { requireRole } from '../../shared/middleware/require-role';
import { createAssessmentsController } from './assessments.controller';
import { createAttemptsController } from './attempts.controller';

export function createAssessmentsRoutes(): Router {
  const routes = Router();
  const assessments = createAssessmentsController();
  const attempts = createAttemptsController();

  const canAuthor = [requireAuth, requireRole(Role.MANAGER, Role.ADMIN)];

  routes.get('/trainings/:trainingId/assessment', requireAuth, assessments.get);

  routes.post('/trainings/:trainingId/assessment', canAuthor, assessments.create);
  routes.patch('/trainings/:trainingId/assessment', canAuthor, assessments.update);
  routes.delete('/trainings/:trainingId/assessment', canAuthor, assessments.remove);

  routes.post('/trainings/:trainingId/assessment/questions', canAuthor, assessments.addQuestion);
  routes.patch(
    '/trainings/:trainingId/assessment/questions/:questionId',
    canAuthor,
    assessments.updateQuestion,
  );
  routes.delete(
    '/trainings/:trainingId/assessment/questions/:questionId',
    canAuthor,
    assessments.removeQuestion,
  );

  // Autorização fina (só o matriculado responde) fica no service.
  routes.post('/enrollments/:id/attempts', requireAuth, attempts.submit);
  routes.get('/enrollments/:id/attempts', requireAuth, attempts.list);
  routes.post('/enrollments/:id/attempts/unlock', canAuthor, attempts.unlock);

  return routes;
}
