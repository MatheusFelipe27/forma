import { EnrollmentStatus } from '@prisma/client';
import { z } from 'zod';

// Limite alinhado ao critério de migração para fila documentado na ADR 005.
const MAX_ASSIGNMENT_SIZE = 1000;

export const enrollmentIdParamSchema = z.object({
  id: z.uuid('Identificador de matrícula inválido'),
});

export const completeModuleParamsSchema = z.object({
  id: z.uuid('Identificador de matrícula inválido'),
  moduleId: z.uuid('Identificador de módulo inválido'),
});

export const createEnrollmentSchema = z.object({
  userId: z.uuid(),
  trainingId: z.uuid(),
  dueDate: z.coerce.date().nullish(),
});

export const assignTrainingSchema = z.object({
  trainingId: z.uuid(),
  userIds: z.array(z.uuid()).min(1, 'Informe ao menos um funcionário').max(MAX_ASSIGNMENT_SIZE),
  dueDate: z.coerce.date().nullish(),
});

export const listEnrollmentsQuerySchema = z.object({
  userId: z.uuid().optional(),
  trainingId: z.uuid().optional(),
  status: z.enum(EnrollmentStatus).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type AssignTrainingInput = z.infer<typeof assignTrainingSchema>;
export type ListEnrollmentsQuery = z.infer<typeof listEnrollmentsQuerySchema>;
