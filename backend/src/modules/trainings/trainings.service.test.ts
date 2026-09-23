import { Role, TrainingStatus, type Training, type User } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../../shared/types/express';
import { createAuditService } from '../audit/audit.service';
import type { UsersRepository } from '../users/users.repository';
import type {
  TrainingCreateData,
  TrainingListFilter,
  TrainingsRepository,
  TrainingUpdateData,
  TrainingWithModules,
} from './trainings.repository';
import { createTrainingsService } from './trainings.service';

const { DRAFT, PUBLISHED, ARCHIVED } = TrainingStatus;

const EMPLOYEE: AuthenticatedUser = { id: 'user-employee', role: Role.EMPLOYEE };
const MANAGER: AuthenticatedUser = { id: 'user-manager', role: Role.MANAGER };

function trainingWith(status: TrainingStatus, moduleCount = 1): TrainingWithModules {
  return {
    id: 'training-1',
    title: 'Segurança da Informação',
    description: 'descrição',
    category: 'Compliance',
    instructor: 'Aurora',
    estimatedDuration: 120,
    status,
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
  };
}

/** Repositório de auditoria controlável, para exercitar o caminho de falha. */
function auditRepositoryStub(options: { available?: boolean; fails?: boolean } = {}) {
  const { available = true, fails = false } = options;

  return {
    isAvailable: vi.fn(() => available),
    create: fails
      ? vi.fn(() => Promise.reject(new Error('Mongo fora do ar')))
      : vi.fn(() => Promise.resolve()),
    findMany: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
  };
}

function usersRepositoryStub(): UsersRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(() => Promise.resolve({ id: MANAGER.id, name: 'Ana' } as User)),
    findExistingIds: vi.fn(),
  };
}

function repositoryFor(
  training: TrainingWithModules | null,
  auditOptions: { available?: boolean; fails?: boolean } = {},
) {
  const repository: TrainingsRepository = {
    findMany: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
    findById: vi.fn(() => Promise.resolve(training)),
    create: vi.fn((data: TrainingCreateData) =>
      Promise.resolve({ ...trainingWith(DRAFT), ...data } as Training),
    ),
    update: vi.fn((id: string, data: TrainingUpdateData) =>
      Promise.resolve({ ...trainingWith(DRAFT), id, ...data } as Training),
    ),
    countModules: vi.fn(() => Promise.resolve(training?.modules.length ?? 0)),
    countAssessmentQuestions: vi.fn(() => Promise.resolve(null)),
  };

  const audit = auditRepositoryStub(auditOptions);

  return {
    repository,
    audit,
    service: createTrainingsService(
      repository,
      createAuditService({ audit, users: usersRepositoryStub() }),
    ),
  };
}

function filterOf(repository: TrainingsRepository): TrainingListFilter {
  return vi.mocked(repository.findMany).mock.calls[0]?.[0] as TrainingListFilter;
}

const query = { page: 1, limit: 20 };

describe('visibilidade por papel', () => {
  it('EMPLOYEE lista somente treinamentos publicados', async () => {
    const { repository, service } = repositoryFor(null);

    await service.list(query, EMPLOYEE);

    expect(filterOf(repository).statusIn).toEqual([PUBLISHED]);
  });

  it('MANAGER lista rascunhos e arquivados também', async () => {
    const { repository, service } = repositoryFor(null);

    await service.list(query, MANAGER);

    expect(filterOf(repository).statusIn).toEqual([DRAFT, PUBLISHED, ARCHIVED]);
  });

  // Sem o recorte, o filtro do cliente contornaria a regra de visibilidade.
  it('EMPLOYEE pedindo status=DRAFT recebe lista vazia sem consultar o banco', async () => {
    const { repository, service } = repositoryFor(null);

    const result = await service.list({ ...query, status: DRAFT }, EMPLOYEE);

    expect(result).toMatchObject({ data: [], total: 0 });
    expect(repository.findMany).not.toHaveBeenCalled();
  });

  it('EMPLOYEE recebe 404 ao abrir um rascunho', async () => {
    const { service } = repositoryFor(trainingWith(DRAFT));

    await expect(service.getById('training-1', EMPLOYEE)).rejects.toMatchObject({
      statusCode: 404,
      code: 'TRAINING_NOT_FOUND',
    });
  });

  // Arquivado segue visível: matrículas existentes continuam válidas.
  it('EMPLOYEE abre treinamento arquivado', async () => {
    const { service } = repositoryFor(trainingWith(ARCHIVED));

    await expect(service.getById('training-1', EMPLOYEE)).resolves.toMatchObject({
      status: ARCHIVED,
    });
  });

  it('MANAGER abre rascunho', async () => {
    const { service } = repositoryFor(trainingWith(DRAFT));

    await expect(service.getById('training-1', MANAGER)).resolves.toMatchObject({ status: DRAFT });
  });
});

describe('criação e edição', () => {
  it('nasce como DRAFT e registra o autor, ignorando o que vier do cliente', async () => {
    const { repository, service } = repositoryFor(null);

    await service.create(
      {
        title: 'Novo treinamento',
        description: 'descrição',
        category: 'Compliance',
        instructor: 'Aurora',
        estimatedDuration: 60,
      },
      MANAGER,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: DRAFT, createdById: MANAGER.id }),
    );
  });

  it.each([PUBLISHED, ARCHIVED])('recusa editar treinamento %s', async (status) => {
    const { service } = repositoryFor(trainingWith(status));

    await expect(service.update('training-1', { title: 'Outro título' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'TRAINING_NOT_EDITABLE',
    });
  });

  it('edita rascunho', async () => {
    const { repository, service } = repositoryFor(trainingWith(DRAFT));

    await service.update('training-1', { title: 'Título revisado' });

    expect(repository.update).toHaveBeenCalledWith('training-1', { title: 'Título revisado' });
  });

  it('404 ao editar treinamento inexistente', async () => {
    const { service } = repositoryFor(null);

    await expect(service.update('training-1', { title: 'x' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('transições de status', () => {
  it.each([
    [DRAFT, PUBLISHED],
    [DRAFT, ARCHIVED],
    [PUBLISHED, ARCHIVED],
    [ARCHIVED, PUBLISHED],
  ])('permite %s → %s', async (from, to) => {
    const { repository, service } = repositoryFor(trainingWith(from));

    await service.changeStatus('training-1', to, MANAGER);

    expect(repository.update).toHaveBeenCalledWith('training-1', { status: to });
  });

  // Reabrir para edição mudaria o conteúdo sob quem já está matriculado.
  it.each([
    [PUBLISHED, DRAFT],
    [ARCHIVED, DRAFT],
  ])('recusa %s → %s', async (from, to) => {
    const { service } = repositoryFor(trainingWith(from));

    await expect(service.changeStatus('training-1', to, MANAGER)).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVALID_STATUS_TRANSITION',
    });
  });

  it('recusa publicar treinamento sem módulos', async () => {
    const { service } = repositoryFor(trainingWith(DRAFT, 0));

    await expect(service.changeStatus('training-1', PUBLISHED, MANAGER)).rejects.toMatchObject({
      statusCode: 409,
      code: 'TRAINING_WITHOUT_MODULES',
    });
  });

  it('arquivar não exige módulos', async () => {
    const { repository, service } = repositoryFor(trainingWith(DRAFT, 0));

    await service.changeStatus('training-1', ARCHIVED, MANAGER);

    expect(repository.update).toHaveBeenCalledWith('training-1', { status: ARCHIVED });
  });

  it('mudar para o status atual é no-op, sem escrita', async () => {
    const { repository, service } = repositoryFor(trainingWith(PUBLISHED));

    await expect(service.changeStatus('training-1', PUBLISHED, MANAGER)).resolves.toMatchObject({
      status: PUBLISHED,
    });
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('auditoria da mudança de status', () => {
  it.each([
    [PUBLISHED, 'PUBLISH_TRAINING'],
    [ARCHIVED, 'ARCHIVE_TRAINING'],
  ])('registra %s como %s', async (status, action) => {
    const { audit, service } = repositoryFor(trainingWith(DRAFT));

    await service.changeStatus('training-1', status, MANAGER);

    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action,
        resourceType: 'Training',
        resourceId: 'training-1',
        userId: MANAGER.id,
        userName: 'Ana',
      }),
    );
  });

  it('não registra quando a transição é no-op', async () => {
    const { audit, service } = repositoryFor(trainingWith(PUBLISHED));

    await service.changeStatus('training-1', PUBLISHED, MANAGER);

    expect(audit.create).not.toHaveBeenCalled();
  });

  it('não registra quando a transição é recusada', async () => {
    const { audit, service } = repositoryFor(trainingWith(PUBLISHED));

    await expect(service.changeStatus('training-1', DRAFT, MANAGER)).rejects.toThrow();
    expect(audit.create).not.toHaveBeenCalled();
  });

  // ADR 006: auditoria é registro secundário e não pode derrubar o negócio.
  it('publica normalmente mesmo com a escrita de auditoria falhando', async () => {
    const { repository, audit, service } = repositoryFor(trainingWith(DRAFT), { fails: true });
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.changeStatus('training-1', PUBLISHED, MANAGER)).resolves.toMatchObject({
      status: PUBLISHED,
    });

    expect(repository.update).toHaveBeenCalledWith('training-1', { status: PUBLISHED });
    expect(audit.create).toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledOnce();

    stderr.mockRestore();
  });

  it('publica normalmente com o Mongo indisponível', async () => {
    const { repository, audit, service } = repositoryFor(trainingWith(DRAFT), { available: false });
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.changeStatus('training-1', PUBLISHED, MANAGER)).resolves.toMatchObject({
      status: PUBLISHED,
    });

    expect(repository.update).toHaveBeenCalled();
    expect(audit.create).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledOnce();

    stderr.mockRestore();
  });
});
