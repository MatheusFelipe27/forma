import { Role, TrainingStatus, type Enrollment } from '@prisma/client';

import { isUniqueViolation } from '../../shared/database/prisma-errors';
import { AppError } from '../../shared/errors/AppError';
import type { AuthenticatedUser } from '../../shared/types/express';
import { usersRepository, type UsersRepository } from '../users/users.repository';
import { trainingsRepository, type TrainingsRepository } from '../trainings/trainings.repository';
import {
  enrollmentsRepository,
  type EnrollmentDetail,
  type EnrollmentListItem,
  type EnrollmentsRepository,
} from './enrollments.repository';
import type {
  AssignTrainingInput,
  CreateEnrollmentInput,
  ListEnrollmentsQuery,
} from './enrollments.schemas';
import { calculateProgress, deriveEnrollmentStatus, type ProgressSummary } from './progress';

export type EnrollmentView = {
  id: string;
  user: { id: string; name: string; email: string };
  training: { id: string; title: string; category: string; status: TrainingStatus };
  status: Enrollment['status'];
  storedStatus: Enrollment['status'];
  dueDate: Date | null;
  createdAt: Date;
  progress: ProgressSummary;
};

export type AssignmentResult = {
  requested: number;
  created: number;
  skipped: number;
  enrollments: Enrollment[];
};

export type EnrollmentsServiceDeps = {
  enrollments?: EnrollmentsRepository;
  trainings?: TrainingsRepository;
  users?: UsersRepository;
};

export function createEnrollmentsService({
  enrollments = enrollmentsRepository,
  trainings = trainingsRepository,
  users = usersRepository,
}: EnrollmentsServiceDeps = {}) {
  // Só PUBLISHED aceita nova matrícula. ARCHIVED recusa, mas as matrículas que
  // já existem seguem válidas — por isso a checagem só acontece na criação.
  async function assertOpenForEnrollment(trainingId: string): Promise<void> {
    const training = await trainings.findById(trainingId);

    if (!training) {
      throw new AppError('Treinamento não encontrado.', 404, 'TRAINING_NOT_FOUND');
    }

    if (training.status !== TrainingStatus.PUBLISHED) {
      throw new AppError(
        training.status === TrainingStatus.ARCHIVED
          ? 'Treinamento arquivado não aceita novas matrículas.'
          : 'Somente treinamentos publicados aceitam matrículas.',
        409,
        'TRAINING_NOT_OPEN_FOR_ENROLLMENT',
      );
    }
  }

  async function assertUsersExist(userIds: string[]): Promise<void> {
    const existing = new Set(await users.findExistingIds(userIds));
    const missing = userIds.filter((id) => !existing.has(id));

    if (missing.length > 0) {
      throw new AppError('Um ou mais funcionários não existem.', 400, 'USERS_NOT_FOUND', {
        missing,
      });
    }
  }

  function canReadEnrollment(enrollment: { userId: string }, actor: AuthenticatedUser): boolean {
    return actor.role !== Role.EMPLOYEE || enrollment.userId === actor.id;
  }

  return {
    async list(query: ListEnrollmentsQuery, actor: AuthenticatedUser) {
      // EMPLOYEE só vê as próprias matrículas, independente do que pedir.
      const userId = actor.role === Role.EMPLOYEE ? actor.id : query.userId;

      const { items, total } = await enrollments.findMany({
        ...(userId === undefined ? {} : { userId }),
        ...(query.trainingId === undefined ? {} : { trainingId: query.trainingId }),
        ...(query.status === undefined ? {} : { status: query.status }),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });

      return {
        data: items.map(toListView),
        page: query.page,
        limit: query.limit,
        total,
      };
    },

    async getById(id: string, actor: AuthenticatedUser) {
      const enrollment = await enrollments.findById(id);

      // 404 e não 403: matrícula de outra pessoa não existe para o EMPLOYEE.
      if (!enrollment || !canReadEnrollment(enrollment, actor)) {
        throw new AppError('Matrícula não encontrada.', 404, 'ENROLLMENT_NOT_FOUND');
      }

      return toDetailView(enrollment);
    },

    /**
     * Matrícula individual idempotente: se já existe, devolve a existente em vez
     * de 409. Mesma filosofia do `skipDuplicates` da ADR 005 e da conclusão de
     * módulo da ADR 004 — reatribuir não é erro.
     */
    async create(
      input: CreateEnrollmentInput,
    ): Promise<{ enrollment: Enrollment; alreadyEnrolled: boolean }> {
      await assertOpenForEnrollment(input.trainingId);
      await assertUsersExist([input.userId]);

      const dueDate = input.dueDate ?? null;

      try {
        const enrollment = await enrollments.create({
          userId: input.userId,
          trainingId: input.trainingId,
          dueDate,
        });

        return { enrollment, alreadyEnrolled: false };
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }

        const existing = await enrollments.findByUserAndTraining(input.userId, input.trainingId);

        // Não achou o conflitante: a violação foi de outra constraint.
        if (!existing) {
          throw error;
        }

        return { enrollment: existing, alreadyEnrolled: true };
      }
    },

    async assign(input: AssignTrainingInput): Promise<AssignmentResult> {
      // Duplicatas no próprio payload contariam como "ignoradas" e confundiriam
      // o relatório devolvido ao Manager.
      const userIds = [...new Set(input.userIds)];

      await assertOpenForEnrollment(input.trainingId);
      await assertUsersExist(userIds);

      const { created, enrollments: rows } = await enrollments.assignMany({
        trainingId: input.trainingId,
        userIds,
        dueDate: input.dueDate ?? null,
      });

      return {
        requested: userIds.length,
        created,
        skipped: userIds.length - created,
        enrollments: rows,
      };
    },
  };
}

export function toListView(item: EnrollmentListItem): EnrollmentView {
  const progress = calculateProgress(item._count.moduleProgress, item.training._count.modules);

  return {
    id: item.id,
    user: item.user,
    training: {
      id: item.training.id,
      title: item.training.title,
      category: item.training.category,
      status: item.training.status,
    },
    status: deriveEnrollmentStatus({
      ...progress,
      hasAssessment: item.training.assessment !== null,
      assessmentPassed: item.attempts.length > 0,
      dueDate: item.dueDate,
    }),
    storedStatus: item.status,
    dueDate: item.dueDate,
    createdAt: item.createdAt,
    progress,
  };
}

export function toDetailView(enrollment: EnrollmentDetail) {
  const completedModuleIds = new Set(enrollment.moduleProgress.map((row) => row.moduleId));
  const progress = calculateProgress(completedModuleIds.size, enrollment.training.modules.length);

  return {
    id: enrollment.id,
    user: enrollment.user,
    training: {
      id: enrollment.training.id,
      title: enrollment.training.title,
      description: enrollment.training.description,
      category: enrollment.training.category,
      instructor: enrollment.training.instructor,
      estimatedDuration: enrollment.training.estimatedDuration,
      status: enrollment.training.status,
      hasAssessment: enrollment.training.assessment !== null,
    },
    status: deriveEnrollmentStatus({
      ...progress,
      hasAssessment: enrollment.training.assessment !== null,
      assessmentPassed: enrollment.attempts.some((attempt) => attempt.passed),
      dueDate: enrollment.dueDate,
    }),
    storedStatus: enrollment.status,
    dueDate: enrollment.dueDate,
    createdAt: enrollment.createdAt,
    progress,
    modules: enrollment.training.modules.map((module) => ({
      id: module.id,
      title: module.title,
      duration: module.duration,
      position: module.position,
      materialUrl: module.materialUrl,
      completed: completedModuleIds.has(module.id),
    })),
  };
}

export type EnrollmentsService = ReturnType<typeof createEnrollmentsService>;

export const enrollmentsService = createEnrollmentsService();
