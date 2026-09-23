import type { Module } from '@prisma/client';

import { AppError } from '../../shared/errors/AppError';
import {
  trainingModulesRepository,
  type TrainingModulesRepository,
} from './training-modules.repository';
import type { CreateModuleInput, UpdateModuleInput } from './training-modules.schemas';
import { createTrainingsService, type TrainingsService } from './trainings.service';

export function createTrainingModulesService(
  repository: TrainingModulesRepository = trainingModulesRepository,
  trainings: TrainingsService = createTrainingsService(),
) {
  // Impede que o moduleId de um treinamento sirva de chave para outro.
  async function findInTraining(trainingId: string, moduleId: string): Promise<Module> {
    const module = await repository.findById(moduleId);

    if (!module || module.trainingId !== trainingId) {
      throw new AppError('Módulo não encontrado.', 404, 'MODULE_NOT_FOUND');
    }

    return module;
  }

  return {
    async add(trainingId: string, input: CreateModuleInput): Promise<Module> {
      await trainings.findEditable(trainingId);

      // Posição é derivada, não recebida do cliente: evita colisão com a
      // constraint UNIQUE(trainingId, position).
      const highest = await repository.highestPosition(trainingId);

      return repository.create({
        ...input,
        materialUrl: input.materialUrl ?? null,
        trainingId,
        position: (highest ?? 0) + 1,
      });
    },

    async update(trainingId: string, moduleId: string, input: UpdateModuleInput): Promise<Module> {
      await trainings.findEditable(trainingId);
      await findInTraining(trainingId, moduleId);

      return repository.update(moduleId, input);
    },

    async remove(trainingId: string, moduleId: string): Promise<void> {
      await trainings.findEditable(trainingId);
      await findInTraining(trainingId, moduleId);

      await repository.remove(moduleId);
    },
  };
}

export type TrainingModulesService = ReturnType<typeof createTrainingModulesService>;

export const trainingModulesService = createTrainingModulesService();
