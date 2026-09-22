import { z } from 'zod';

export const trainingIdParamSchema = z.object({
  trainingId: z.uuid('Identificador de treinamento inválido'),
});

export const questionParamsSchema = trainingIdParamSchema.extend({
  questionId: z.uuid('Identificador de pergunta inválido'),
});

export const enrollmentIdParamSchema = z.object({
  id: z.uuid('Identificador de matrícula inválido'),
});

export const createAssessmentSchema = z.object({
  minScore: z.number().int().min(0).max(100),
  maxAttempts: z.number().int().positive().max(10),
});

export const updateAssessmentSchema = createAssessmentSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Informe ao menos um campo para atualizar');

// Exatamente uma alternativa correta: zero torna a pergunta impossível e duas
// tornam o gabarito ambíguo.
const answersSchema = z
  .array(
    z.object({
      text: z.string().trim().min(1).max(500),
      isCorrect: z.boolean().default(false),
    }),
  )
  .min(2, 'Uma pergunta precisa de ao menos duas alternativas')
  .max(6)
  .refine(
    (answers) => answers.filter((answer) => answer.isCorrect).length === 1,
    'Exatamente uma alternativa deve ser a correta',
  );

export const createQuestionSchema = z.object({
  text: z.string().trim().min(3).max(500),
  answers: answersSchema,
});

export const updateQuestionSchema = z
  .object({
    text: z.string().trim().min(3).max(500).optional(),
    answers: answersSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Informe ao menos um campo para atualizar');

export const submitAttemptSchema = z.object({
  answers: z
    .array(z.object({ questionId: z.uuid(), answerId: z.uuid() }))
    .min(1, 'Envie ao menos uma resposta'),
});

export const unlockAttemptsSchema = z.object({
  extraAttempts: z.number().int().positive().max(5).default(1),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
export type UnlockAttemptsInput = z.infer<typeof unlockAttemptsSchema>;
