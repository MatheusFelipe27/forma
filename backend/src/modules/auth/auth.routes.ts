import { Router } from 'express';

import { createLoginRateLimiter } from '../../shared/middleware/rate-limit';
import { requireAuth } from '../../shared/middleware/require-auth';
import { createAuthController } from './auth.controller';

export function createAuthRoutes(): Router {
  const routes = Router();
  const controller = createAuthController();

  routes.post('/auth/login', createLoginRateLimiter(), controller.login);
  routes.post('/auth/logout', requireAuth, controller.logout);
  routes.get('/auth/me', requireAuth, controller.me);

  return routes;
}
