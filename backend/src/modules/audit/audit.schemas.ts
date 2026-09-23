import { z } from 'zod';

import { AUDIT_ACTIONS } from './audit-log.schema';

export const listAuditLogsQuerySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional(),
  resourceType: z.string().trim().min(1).max(50).optional(),
  resourceId: z.uuid().optional(),
  userId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
