import { z } from 'zod';

export const moduleParamsSchema = z.object({
  trainingId: z.uuid('Identificador de treinamento inválido'),
  moduleId: z.uuid('Identificador de módulo inválido'),
});

export const trainingIdOnlyParamSchema = z.object({
  trainingId: z.uuid('Identificador de treinamento inválido'),
});

export const createModuleSchema = z.object({
  title: z.string().trim().min(3).max(200),
  content: z.string().trim().min(1),
  duration: z.number().int().positive(),
  materialUrl: z.url().nullish(),
});

export const updateModuleSchema = createModuleSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Informe ao menos um campo para atualizar');

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
