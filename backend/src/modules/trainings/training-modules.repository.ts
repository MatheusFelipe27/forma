import type { Module, Prisma } from '@prisma/client';

import { prisma } from '../../shared/database/prisma';

export type ModuleCreateData = Omit<Prisma.ModuleUncheckedCreateInput, 'id'>;

export type ModuleUpdateData = {
  title?: string | undefined;
  content?: string | undefined;
  duration?: number | undefined;
  materialUrl?: string | null | undefined;
};

export type TrainingModulesRepository = {
  findById: (moduleId: string) => Promise<Module | null>;
  highestPosition: (trainingId: string) => Promise<number | null>;
  create: (data: ModuleCreateData) => Promise<Module>;
  update: (moduleId: string, data: ModuleUpdateData) => Promise<Module>;
  remove: (moduleId: string) => Promise<void>;
};

export const trainingModulesRepository: TrainingModulesRepository = {
  findById(moduleId) {
    return prisma.module.findUnique({ where: { id: moduleId } });
  },

  async highestPosition(trainingId) {
    const last = await prisma.module.findFirst({
      where: { trainingId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    return last?.position ?? null;
  },

  create(data) {
    return prisma.module.create({ data });
  },

  update(moduleId, data) {
    return prisma.module.update({
      where: { id: moduleId },
      data: data as Prisma.ModuleUpdateInput,
    });
  },

  async remove(moduleId) {
    await prisma.module.delete({ where: { id: moduleId } });
  },
};
