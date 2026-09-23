import { Role } from '@prisma/client';
import { Router } from 'express';

import { requireAuth } from '../../shared/middleware/require-auth';
import { requireRole } from '../../shared/middleware/require-role';
import { createAuditController } from './audit.controller';

export function createAuditRoutes(): Router {
  const routes = Router();
  const audit = createAuditController();

  // Auditoria é só do Admin — nem Manager lê (matriz da seção 6).
  routes.get('/audit-logs', requireAuth, requireRole(Role.ADMIN), audit.list);

  return routes;
}
