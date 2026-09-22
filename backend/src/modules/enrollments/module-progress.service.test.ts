import {
  EnrollmentStatus,
  Prisma,
  Role,
  TrainingStatus,
  type ModuleProgress,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../../shared/types/express';
import type { EnrollmentDetail, EnrollmentsRepository } from './enrollments.repository';
import type { ModuleProgressRepository } from './module-progress.repository';
import { createModuleProgressService } from './module-progress.service';

const OWNER: AuthenticatedUser = { id: 'user-1', role: Role.EMPLOYEE };
const MANAGER: AuthenticatedUser = { id: 'user-2', role: Role.MANAGER };

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function progressRow(moduleId = 'module-1'): ModuleProgress {
  return {
    id: `progress-${moduleId}`,
    enrollmentId: 'enrollment-1',
    moduleId,
    completedAt: new Date(),
  };
}

type DetailOptions = {
  moduleCount?: number;
  status?: EnrollmentStatus;
  hasAssessment?: boolean;
  assessmentPassed?: boolean;
  dueDate?: Date | null;
};

function detail({
  moduleCount = 2,
  status = EnrollmentStatus.NOT_STARTED,
  hasAssessment = false,
  assessmentPassed = false,
  dueDate = null,
}: DetailOptions = {}): EnrollmentDetail {
  return {
    id: 'enrollment-1',
    userId: OWNER.id,
    trainingId: 'training-1',
    status,
    dueDate,
    createdAt: new Date(),
    user: { id: OWNER.id, name: 'Camila', email: 'camila@forma.dev' },
    training: {
      id: 'training-1',
      title: 'Treinamento',
      description: 'descrição',
      category: 'Compliance',
      instructor: 'Aurora',
      estimatedDuration: 60,
      status: TrainingStatus.PUBLISHED,
      createdById: 'user-manager',
      createdAt: new Date(),
      modules: Array.from({ length: moduleCount }, (_unused, index) => ({
        id: `module-${index + 1}`,
        trainingId: 'training-1',
        title: `Módulo ${index + 1}`,
        content: 'conteúdo',
        duration: 30,
        position: index + 1,
        materialUrl: null,
      })),
      assessment: hasAssessment ? { id: 'assessment-1', minScore: 70, maxAttempts: 3 } : null,
    },
    moduleProgress: [],
    attempts: assessmentPassed
      ? [{ id: 'attempt-1', score: 100, passed: true, createdAt: new Date() }]
      : [],
  };
}

function setup(options: DetailOptions & { completedCount?: number; existing?: boolean } = {}) {
  const { completedCount = 1, existing = false, ...detailOptions } = options;

  const enrollments: EnrollmentsRepository = {
    findMany: vi.fn(),
    findById: vi.fn(() => Promise.resolve(detail(detailOptions))),
    findByUserAndTraining: vi.fn(),
    create: vi.fn(),
    assignMany: vi.fn(),
    updateStatus: vi.fn((id: string, status: EnrollmentStatus) =>
      Promise.resolve({ ...detail(detailOptions), status, id }),
    ),
  };

  const progress: ModuleProgressRepository = {
    create: existing
      ? vi.fn(() => Promise.reject(uniqueViolation()))
      : vi.fn((_enrollmentId: string, moduleId: string) => Promise.resolve(progressRow(moduleId))),
    find: vi.fn(() => Promise.resolve(existing ? progressRow() : null)),
    countByEnrollment: vi.fn(() => Promise.resolve(completedCount)),
  };

  return { enrollments, progress, service: createModuleProgressService({ enrollments, progress }) };
}

describe('idempotência da conclusão de módulo', () => {
  it('primeira conclusão cria o registro', async () => {
    const { progress, service } = setup();

    const result = await service.completeModule('enrollment-1', 'module-1', OWNER);

    expect(result.alreadyCompleted).toBe(false);
    expect(progress.create).toHaveBeenCalledWith('enrollment-1', 'module-1');
  });

  // O ponto central da ADR 004.
  it('P2002 devolve o progresso existente em vez de erro', async () => {
    const { progress, service } = setup({ existing: true });

    const result = await service.completeModule('enrollment-1', 'module-1', OWNER);

    expect(result.alreadyCompleted).toBe(true);
    expect(result.progress).toMatchObject({ enrollmentId: 'enrollment-1', moduleId: 'module-1' });
    expect(progress.find).toHaveBeenCalledWith('enrollment-1', 'module-1');
  });

  // Sem verificação prévia não há janela entre SELECT e INSERT.
  it('tenta escrever sem consultar existência antes', async () => {
    const { progress, service } = setup();

    await service.completeModule('enrollment-1', 'module-1', OWNER);

    expect(progress.find).not.toHaveBeenCalled();
  });

  it('P2002 sem registro conflitante propaga o erro', async () => {
    const { progress, service } = setup({ existing: true });
    vi.mocked(progress.find).mockResolvedValue(null);

    await expect(service.completeModule('enrollment-1', 'module-1', OWNER)).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  it('erro que não é violação de unicidade propaga', async () => {
    const { progress, service } = setup();
    vi.mocked(progress.create).mockRejectedValue(new Error('conexão perdida'));

    await expect(service.completeModule('enrollment-1', 'module-1', OWNER)).rejects.toThrow(
      'conexão perdida',
    );
  });
});

describe('autorização e validação', () => {
  it('404 quando a matrícula não existe', async () => {
    const { enrollments, service } = setup();
    vi.mocked(enrollments.findById).mockResolvedValue(null);

    await expect(service.completeModule('enrollment-1', 'module-1', OWNER)).rejects.toMatchObject({
      statusCode: 404,
      code: 'ENROLLMENT_NOT_FOUND',
    });
  });

  // Concluir módulo é ato de quem estuda.
  it('403 quando quem chama não é o matriculado, mesmo sendo MANAGER', async () => {
    const { progress, service } = setup();

    await expect(service.completeModule('enrollment-1', 'module-1', MANAGER)).rejects.toMatchObject(
      { statusCode: 403, code: 'NOT_ENROLLMENT_OWNER' },
    );
    expect(progress.create).not.toHaveBeenCalled();
  });

  it('404 quando o módulo não pertence ao treinamento da matrícula', async () => {
    const { progress, service } = setup();

    await expect(
      service.completeModule('enrollment-1', 'module-de-outro-treinamento', OWNER),
    ).rejects.toMatchObject({ statusCode: 404, code: 'MODULE_NOT_FOUND' });
    expect(progress.create).not.toHaveBeenCalled();
  });
});

describe('status da matrícula depois da conclusão', () => {
  it('primeira conclusão leva NOT_STARTED para IN_PROGRESS', async () => {
    const { enrollments, service } = setup({ completedCount: 1, moduleCount: 2 });

    const result = await service.completeModule('enrollment-1', 'module-1', OWNER);

    expect(enrollments.updateStatus).toHaveBeenCalledWith(
      'enrollment-1',
      EnrollmentStatus.IN_PROGRESS,
    );
    expect(result.enrollment.status).toBe(EnrollmentStatus.IN_PROGRESS);
    expect(result.enrollment.progress).toMatchObject({ percentage: 50 });
  });

  it('último módulo de treinamento sem avaliação conclui a matrícula', async () => {
    const { enrollments, service } = setup({
      completedCount: 2,
      moduleCount: 2,
      status: EnrollmentStatus.IN_PROGRESS,
    });

    const result = await service.completeModule('enrollment-1', 'module-2', OWNER);

    expect(enrollments.updateStatus).toHaveBeenCalledWith(
      'enrollment-1',
      EnrollmentStatus.COMPLETED,
    );
    expect(result.enrollment.status).toBe(EnrollmentStatus.COMPLETED);
  });

  // Com avaliação pendente, todos os módulos não bastam.
  it('último módulo com avaliação não aprovada mantém IN_PROGRESS', async () => {
    const { enrollments, service } = setup({
      completedCount: 2,
      moduleCount: 2,
      status: EnrollmentStatus.IN_PROGRESS,
      hasAssessment: true,
    });

    const result = await service.completeModule('enrollment-1', 'module-2', OWNER);

    expect(result.enrollment.status).toBe(EnrollmentStatus.IN_PROGRESS);
    expect(enrollments.updateStatus).not.toHaveBeenCalled();
  });

  it('último módulo com avaliação aprovada conclui', async () => {
    const { service } = setup({
      completedCount: 2,
      moduleCount: 2,
      status: EnrollmentStatus.IN_PROGRESS,
      hasAssessment: true,
      assessmentPassed: true,
    });

    const result = await service.completeModule('enrollment-1', 'module-2', OWNER);

    expect(result.enrollment.status).toBe(EnrollmentStatus.COMPLETED);
  });

  it('não grava quando o status calculado já é o atual', async () => {
    const { enrollments, service } = setup({
      completedCount: 1,
      moduleCount: 2,
      status: EnrollmentStatus.IN_PROGRESS,
    });

    await service.completeModule('enrollment-1', 'module-1', OWNER);

    expect(enrollments.updateStatus).not.toHaveBeenCalled();
  });

  // OVERDUE é derivado na resposta, nunca persistido.
  it('prazo vencido devolve OVERDUE sem gravar OVERDUE', async () => {
    const { enrollments, service } = setup({
      completedCount: 1,
      moduleCount: 2,
      dueDate: new Date('2020-01-01T00:00:00Z'),
    });

    const result = await service.completeModule('enrollment-1', 'module-1', OWNER);

    expect(result.enrollment.status).toBe(EnrollmentStatus.OVERDUE);
    expect(enrollments.updateStatus).toHaveBeenCalledWith(
      'enrollment-1',
      EnrollmentStatus.IN_PROGRESS,
    );
  });
});
