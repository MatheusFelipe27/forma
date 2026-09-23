import { Role } from '@prisma/client';
import { Router } from 'express';

import { requireAuth } from '../../shared/middleware/require-auth';
import { requireRole } from '../../shared/middleware/require-role';
import { createDashboardController } from './dashboard.controller';

export function createDashboardRoutes(): Router {
  const routes = Router();
  const dashboard = createDashboardController();

  routes.get('/dashboard/me', requireAuth, dashboard.me);
  routes.get('/dashboard/team', requireAuth, requireRole(Role.MANAGER, Role.ADMIN), dashboard.team);

  return routes;
}
