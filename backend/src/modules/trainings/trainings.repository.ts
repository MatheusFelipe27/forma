import type { Module, Prisma, Training, TrainingStatus } from '@prisma/client';

import { prisma } from '../../shared/database/prisma';

export type TrainingWithModules = Training & { modules: Module[] };

export type TrainingListFilter = {
  statusIn: TrainingStatus[];
  category?: string;
  skip: number;
  take: number;
};

export type TrainingCreateData = Omit<Prisma.TrainingUncheckedCreateInput, 'id' | 'createdAt'>;

// `| undefined` explícito: sob `exactOptionalPropertyTypes`, `Partial<T>` recusa
// o que o `.partial()` do Zod produz.
export type TrainingUpdateData = {
  title?: string | undefined;
  description?: string | undefined;
  category?: string | undefined;
  instructor?: string | undefined;
  estimatedDuration?: number | undefined;
  status?: TrainingStatus | undefined;
};

// Assinaturas como propriedades, não métodos: mantém o dublê dos testes livre
// da regra de `this` não vinculado.
export type TrainingsRepository = {
  findMany: (filter: TrainingListFilter) => Promise<{ items: Training[]; total: number }>;
  findById: (id: string) => Promise<TrainingWithModules | null>;
  create: (data: TrainingCreateData) => Promise<Training>;
  update: (id: string, data: TrainingUpdateData) => Promise<Training>;
  countModules: (trainingId: string) => Promise<number>;
  /** `null` quando o treinamento não tem avaliação. */
  countAssessmentQuestions: (trainingId: string) => Promise<number | null>;
};

export const trainingsRepository: TrainingsRepository = {
  async findMany({ statusIn, category, skip, take }) {
    const where: Prisma.TrainingWhereInput = {
      status: { in: statusIn },
      ...(category === undefined ? {} : { category }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.training.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.training.count({ where }),
    ]);

    return { items, total };
  },

  findById(id) {
    return prisma.training.findUnique({
      where: { id },
      include: { modules: { orderBy: { position: 'asc' } } },
    });
  },

  create(data) {
    return prisma.training.create({ data });
  },

  update(id, data) {
    // `exactOptionalPropertyTypes` torna `{ title?: string | undefined }`
    // incompatível com o input do Prisma; os campos são os mesmos.
    return prisma.training.update({ where: { id }, data: data as Prisma.TrainingUpdateInput });
  },

  countModules(trainingId) {
    return prisma.module.count({ where: { trainingId } });
  },

  async countAssessmentQuestions(trainingId) {
    const assessment = await prisma.assessment.findUnique({
      where: { trainingId },
      select: { _count: { select: { questions: true } } },
    });

    return assessment?._count.questions ?? null;
  },
};
