import type { RequestHandler } from 'express';

import { getAuthenticatedUser } from '../../shared/middleware/require-auth';
import { completeModuleParamsSchema } from './enrollments.schemas';
import { moduleProgressService, type ModuleProgressService } from './module-progress.service';

export function createModuleProgressController(
  service: ModuleProgressService = moduleProgressService,
) {
  const complete: RequestHandler = async (req, res) => {
    const { id, moduleId } = completeModuleParamsSchema.parse(req.params);
    const result = await service.completeModule(id, moduleId, getAuthenticatedUser(req));

    // 200 nos dois casos, inclusive quando o módulo já estava concluído (ADR 004).
    res.status(200).json(result);
  };

  return { complete };
}
