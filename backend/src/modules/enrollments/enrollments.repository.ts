import type {
  Enrollment,
  EnrollmentStatus,
  Module,
  ModuleProgress,
  Prisma,
  Training,
} from '@prisma/client';

import { prisma } from '../../shared/database/prisma';

export type EnrollmentDetail = Enrollment & {
  user: { id: string; name: string; email: string };
  training: Training & {
    modules: Module[];
    assessment: { id: string; minScore: number; maxAttempts: number } | null;
  };
  moduleProgress: ModuleProgress[];
  attempts: { id: string; score: number; passed: boolean; createdAt: Date }[];
};

export type EnrollmentListItem = Enrollment & {
  user: { id: string; name: string; email: string };
  training: {
    id: string;
    title: string;
    category: string;
    status: Training['status'];
    _count: { modules: number };
    assessment: { id: string } | null;
  };
  _count: { moduleProgress: number };
  attempts: { id: string }[];
};

export type EnrollmentListFilter = {
  userId?: string;
  trainingId?: string;
  status?: EnrollmentStatus;
  skip: number;
  take: number;
};

export type EnrollmentCreateData = {
  userId: string;
  trainingId: string;
  dueDate: Date | null;
};

export type AssignManyData = {
  trainingId: string;
  userIds: string[];
  dueDate: Date | null;
};

export type EnrollmentsRepository = {
  findMany: (
    filter: EnrollmentListFilter,
  ) => Promise<{ items: EnrollmentListItem[]; total: number }>;
  findById: (id: string) => Promise<EnrollmentDetail | null>;
  findByUserAndTraining: (userId: string, trainingId: string) => Promise<Enrollment | null>;
  create: (data: EnrollmentCreateData) => Promise<Enrollment>;
  assignMany: (data: AssignManyData) => Promise<{ created: number; enrollments: Enrollment[] }>;
  updateStatus: (id: string, status: EnrollmentStatus) => Promise<Enrollment>;
};

// Exportado para o Dashboard reaproveitar a mesma forma e, com ela, as mesmas
// funções de derivação de status e progresso.
export const enrollmentListInclude = {
  user: { select: { id: true, name: true, email: true } },
  training: {
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      _count: { select: { modules: true } },
      assessment: { select: { id: true } },
    },
  },
  _count: { select: { moduleProgress: true } },
  // Só precisamos saber se existe alguma tentativa aprovada.
  attempts: { where: { passed: true }, select: { id: true }, take: 1 },
} satisfies Prisma.EnrollmentInclude;

export const enrollmentsRepository: EnrollmentsRepository = {
  async findMany({ userId, trainingId, status, skip, take }) {
    const where: Prisma.EnrollmentWhereInput = {
      ...(userId === undefined ? {} : { userId }),
      ...(trainingId === undefined ? {} : { trainingId }),
      ...(status === undefined ? {} : { status }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.enrollment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: enrollmentListInclude,
      }),
      prisma.enrollment.count({ where }),
    ]);

    return { items, total };
  },

  findById(id) {
    return prisma.enrollment.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        training: {
          include: {
            modules: { orderBy: { position: 'asc' } },
            assessment: { select: { id: true, minScore: true, maxAttempts: true } },
          },
        },
        moduleProgress: true,
        attempts: {
          select: { id: true, score: true, passed: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  },

  findByUserAndTraining(userId, trainingId) {
    return prisma.enrollment.findUnique({ where: { userId_trainingId: { userId, trainingId } } });
  },

  create(data) {
    return prisma.enrollment.create({ data });
  },

  /**
   * Atribuição em massa — ver ADR 005.
   *
   * `skipDuplicates` faz a constraint UNIQUE(userId, trainingId) ignorar quem já
   * tem a matrícula em vez de abortar o lote. A transação existe porque são duas
   * operações: a inserção e a leitura do estado resultante, que precisam refletir
   * o mesmo instante.
   */
  assignMany({ trainingId, userIds, dueDate }) {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.enrollment.createMany({
        data: userIds.map((userId) => ({ userId, trainingId, dueDate })),
        skipDuplicates: true,
      });

      const enrollments = await tx.enrollment.findMany({
        where: { trainingId, userId: { in: userIds } },
      });

      return { created: count, enrollments };
    });
  },

  updateStatus(id, status) {
    return prisma.enrollment.update({ where: { id }, data: { status } });
  },
};
