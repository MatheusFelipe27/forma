import type { ModuleProgress } from '@prisma/client';

import { prisma } from '../../shared/database/prisma';

export type ModuleProgressRepository = {
  create: (enrollmentId: string, moduleId: string) => Promise<ModuleProgress>;
  find: (enrollmentId: string, moduleId: string) => Promise<ModuleProgress | null>;
  countByEnrollment: (enrollmentId: string) => Promise<number>;
};

export const moduleProgressRepository: ModuleProgressRepository = {
  create(enrollmentId, moduleId) {
    return prisma.moduleProgress.create({ data: { enrollmentId, moduleId } });
  },

  find(enrollmentId, moduleId) {
    return prisma.moduleProgress.findUnique({
      where: { enrollmentId_moduleId: { enrollmentId, moduleId } },
    });
  },

  countByEnrollment(enrollmentId) {
    return prisma.moduleProgress.count({ where: { enrollmentId } });
  },
};
