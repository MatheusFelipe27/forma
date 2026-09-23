import type { RequestHandler } from 'express';

import { listAuditLogsQuerySchema } from './audit.schemas';
import { auditService, type AuditService } from './audit.service';

export function createAuditController(service: AuditService = auditService) {
  const list: RequestHandler = async (req, res) => {
    const query = listAuditLogsQuerySchema.parse(req.query);

    res.status(200).json(await service.list(query));
  };

  return { list };
}
