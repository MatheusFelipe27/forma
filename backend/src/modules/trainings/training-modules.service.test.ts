import { TrainingStatus, type Module } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { TrainingModulesRepository } from './training-modules.repository';
import { createTrainingModulesService } from './training-modules.service';
import type { TrainingsRepository, TrainingWithModules } from './trainings.repository';
import { createTrainingsService } from './trainings.service';

const { DRAFT, PUBLISHED } = TrainingStatus;

function moduleOf(overrides: Partial<Module> = {}): Module {
  return {
    id: 'module-1',
    trainingId: 'training-1',
    title: 'Módulo 1',
    content: 'conteúdo',
    duration: 30,
    position: 1,
    materialUrl: null,
    ...overrides,
  };
}

function trainingOf(status: TrainingStatus): TrainingWithModules {
  return {
    id: 'training-1',
    title: 'Treinamento',
    description: 'descrição',
    category: 'Compliance',
    instructor: 'Aurora',
    estimatedDuration: 60,
    status,
    createdById: 'user-manager',
    createdAt: new Date(),
    modules: [],
  };
}

function setup(status: TrainingStatus, existingModule: Module | null = moduleOf(), highest = 2) {
  const trainingsRepository: TrainingsRepository = {
    findMany: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
    findById: vi.fn(() => Promise.resolve(trainingOf(status))),
    create: vi.fn(),
    update: vi.fn(),
    countModules: vi.fn(() => Promise.resolve(0)),
    countAssessmentQuestions: vi.fn(() => Promise.resolve(null)),
  };

  const modulesRepository: TrainingModulesRepository = {
    findById: vi.fn(() => Promise.resolve(existingModule)),
    highestPosition: vi.fn(() => Promise.resolve(highest)),
    create: vi.fn((data) => Promise.resolve(moduleOf(data as Partial<Module>))),
    update: vi.fn(() => Promise.resolve(moduleOf())),
    remove: vi.fn(() => Promise.resolve()),
  };

  return {
    modulesRepository,
    service: createTrainingModulesService(
      modulesRepository,
      createTrainingsService(trainingsRepository),
    ),
  };
}

const novoModulo = { title: 'Novo módulo', content: 'conteúdo', duration: 25 };

describe('adicionar módulo', () => {
  it('atribui a próxima posição livre em vez de aceitar a do cliente', async () => {
    const { modulesRepository, service } = setup(DRAFT, null, 2);

    await service.add('training-1', novoModulo);

    expect(modulesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ trainingId: 'training-1', position: 3 }),
    );
  });

  it('primeiro módulo do treinamento recebe posição 1', async () => {
    const { modulesRepository, service } = setup(DRAFT, null, 0);
    vi.mocked(modulesRepository.highestPosition).mockResolvedValue(null);

    await service.add('training-1', novoModulo);

    expect(modulesRepository.create).toHaveBeenCalledWith(expect.objectContaining({ position: 1 }));
  });

  // O conjunto de módulos é o denominador do progresso de quem já está matriculado.
  it('recusa adicionar módulo a treinamento publicado', async () => {
    const { modulesRepository, service } = setup(PUBLISHED, null);

    await expect(service.add('training-1', novoModulo)).rejects.toMatchObject({
      statusCode: 409,
      code: 'TRAINING_NOT_EDITABLE',
    });
    expect(modulesRepository.create).not.toHaveBeenCalled();
  });
});

describe('editar e remover módulo', () => {
  it('edita módulo de rascunho', async () => {
    const { modulesRepository, service } = setup(DRAFT);

    await service.update('training-1', 'module-1', { title: 'Título novo' });

    expect(modulesRepository.update).toHaveBeenCalledWith('module-1', { title: 'Título novo' });
  });

  it('remove módulo de rascunho', async () => {
    const { modulesRepository, service } = setup(DRAFT);

    await service.remove('training-1', 'module-1');

    expect(modulesRepository.remove).toHaveBeenCalledWith('module-1');
  });

  it.each([
    ['editar', (s: ReturnType<typeof setup>['service']) => s.update('training-1', 'module-1', {})],
    ['remover', (s: ReturnType<typeof setup>['service']) => s.remove('training-1', 'module-1')],
  ])('recusa %s módulo de treinamento publicado', async (_acao, run) => {
    const { service } = setup(PUBLISHED);

    await expect(run(service)).rejects.toMatchObject({ code: 'TRAINING_NOT_EDITABLE' });
  });

  // O id de um módulo não pode servir de chave para outro treinamento.
  it('404 quando o módulo pertence a outro treinamento', async () => {
    const { modulesRepository, service } = setup(
      DRAFT,
      moduleOf({ trainingId: 'outro-treinamento' }),
    );

    await expect(service.remove('training-1', 'module-1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'MODULE_NOT_FOUND',
    });
    expect(modulesRepository.remove).not.toHaveBeenCalled();
  });

  it('404 quando o módulo não existe', async () => {
    const { service } = setup(DRAFT, null);

    await expect(service.update('training-1', 'module-1', { title: 'x' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'MODULE_NOT_FOUND',
    });
  });
});
