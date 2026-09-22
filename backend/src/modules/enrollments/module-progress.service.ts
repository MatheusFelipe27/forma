import type { ModuleProgress } from '@prisma/client';

import { isUniqueViolation } from '../../shared/database/prisma-errors';
import { AppError } from '../../shared/errors/AppError';
import type { AuthenticatedUser } from '../../shared/types/express';
import {
  enrollmentsRepository,
  type EnrollmentDetail,
  type EnrollmentsRepository,
} from './enrollments.repository';
import {
  moduleProgressRepository,
  type ModuleProgressRepository,
} from './module-progress.repository';
import {
  calculateProgress,
  deriveEnrollmentStatus,
  storableStatus,
  type ProgressSummary,
} from './progress';

export type CompleteModuleResult = {
  progress: ModuleProgress;
  alreadyCompleted: boolean;
  enrollment: {
    id: string;
    status: EnrollmentDetail['status'];
    progress: ProgressSummary;
  };
};

export type ModuleProgressServiceDeps = {
  progress?: ModuleProgressRepository;
  enrollments?: EnrollmentsRepository;
};

export function createModuleProgressService({
  progress: progressRepository = moduleProgressRepository,
  enrollments = enrollmentsRepository,
}: ModuleProgressServiceDeps = {}) {
  return {
    /**
     * Conclusão de módulo idempotente — ADR 004.
     *
     * A escrita é tentada de imediato: não existe verificação prévia de
     * existência, porque entre o `SELECT` e o `INSERT` cabe outra requisição. A
     * unicidade é garantida pela constraint UNIQUE(enrollmentId, moduleId), que
     * vale para qualquer número de instâncias da aplicação.
     *
     * A segunda requisição recebe 200 com o progresso existente. Concluir um
     * módulo já concluído atingiu o estado desejado — é sucesso, não conflito.
     */
    async completeModule(
      enrollmentId: string,
      moduleId: string,
      actor: AuthenticatedUser,
    ): Promise<CompleteModuleResult> {
      const enrollment = await enrollments.findById(enrollmentId);

      if (!enrollment) {
        throw new AppError('Matrícula não encontrada.', 404, 'ENROLLMENT_NOT_FOUND');
      }

      // Concluir módulo é ato de quem estuda: nem Manager nem Admin concluem
      // por outra pessoa.
      if (enrollment.userId !== actor.id) {
        throw new AppError(
          'Somente o próprio matriculado pode concluir um módulo.',
          403,
          'NOT_ENROLLMENT_OWNER',
        );
      }

      const belongsToTraining = enrollment.training.modules.some(
        (module) => module.id === moduleId,
      );

      if (!belongsToTraining) {
        throw new AppError(
          'Módulo não pertence ao treinamento desta matrícula.',
          404,
          'MODULE_NOT_FOUND',
        );
      }

      const { progress, alreadyCompleted } = await createOrRecover(enrollmentId, moduleId);
      const enrollmentState = await refreshStatus(enrollment);

      return { progress, alreadyCompleted, enrollment: enrollmentState };
    },
  };

  async function createOrRecover(
    enrollmentId: string,
    moduleId: string,
  ): Promise<{ progress: ModuleProgress; alreadyCompleted: boolean }> {
    try {
      return {
        progress: await progressRepository.create(enrollmentId, moduleId),
        alreadyCompleted: false,
      };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const existing = await progressRepository.find(enrollmentId, moduleId);

      // Sem registro conflitante, a violação foi de outra constraint.
      if (!existing) {
        throw error;
      }

      return { progress: existing, alreadyCompleted: true };
    }
  }

  /**
   * Recalcula a partir das linhas de `module_progress` e atualiza a coluna
   * `status`, que existe apenas para filtro de listagem (ADR 007). A coluna é
   * best-effort; o status devolvido na resposta é sempre derivado.
   */
  async function refreshStatus(enrollment: EnrollmentDetail) {
    const completedModules = await progressRepository.countByEnrollment(enrollment.id);
    const summary = calculateProgress(completedModules, enrollment.training.modules.length);

    const completion = {
      ...summary,
      hasAssessment: enrollment.training.assessment !== null,
      assessmentPassed: enrollment.attempts.some((attempt) => attempt.passed),
    };

    const stored = storableStatus(completion);

    if (stored !== enrollment.status) {
      await enrollments.updateStatus(enrollment.id, stored);
    }

    return {
      id: enrollment.id,
      status: deriveEnrollmentStatus({ ...completion, dueDate: enrollment.dueDate }),
      progress: summary,
    };
  }
}

export type ModuleProgressService = ReturnType<typeof createModuleProgressService>;

export const moduleProgressService = createModuleProgressService();
