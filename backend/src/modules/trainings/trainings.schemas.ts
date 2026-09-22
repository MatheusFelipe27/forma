import { TrainingStatus } from '@prisma/client';
import { z } from 'zod';

export const trainingIdParamSchema = z.object({
  id: z.uuid('Identificador de treinamento inválido'),
});

export const createTrainingSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(1),
  category: z.string().trim().min(1).max(100),
  instructor: z.string().trim().min(1).max(200),
  estimatedDuration: z.number().int().positive(),
});

export const updateTrainingSchema = createTrainingSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Informe ao menos um campo para atualizar');

export const changeStatusSchema = z.object({
  status: z.enum(TrainingStatus),
});

export const listTrainingsQuerySchema = z.object({
  status: z.enum(TrainingStatus).optional(),
  category: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateTrainingInput = z.infer<typeof createTrainingSchema>;
export type UpdateTrainingInput = z.infer<typeof updateTrainingSchema>;
export type ListTrainingsQuery = z.infer<typeof listTrainingsQuerySchema>;
