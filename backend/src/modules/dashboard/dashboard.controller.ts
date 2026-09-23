import type { RequestHandler } from 'express';

import { getAuthenticatedUser } from '../../shared/middleware/require-auth';
import { dashboardService, type DashboardService } from './dashboard.service';

export function createDashboardController(service: DashboardService = dashboardService) {
  const me: RequestHandler = async (req, res) => {
    res.status(200).json(await service.me(getAuthenticatedUser(req)));
  };

  const team: RequestHandler = async (req, res) => {
    res.status(200).json(await service.team(getAuthenticatedUser(req)));
  };

  return { me, team };
}
