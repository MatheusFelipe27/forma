import { Role, TrainingStatus, type Training } from '@prisma/client';

import { AppError } from '../../shared/errors/AppError';
import type { AuthenticatedUser } from '../../shared/types/express';
import {
  trainingsRepository,
  type TrainingsRepository,
  type TrainingWithModules,
} from './trainings.repository';
import type {
  CreateTrainingInput,
  ListTrainingsQuery,
  UpdateTrainingInput,
} from './trainings.schemas';

const { DRAFT, PUBLISHED, ARCHIVED } = TrainingStatus;

// Publicado nunca volta a rascunho: a partir da publicação existem matrículas,
// e reabrir para edição mudaria o conteúdo sob quem já está matriculado.
const ALLOWED_TRANSITIONS: Record<TrainingStatus, TrainingStatus[]> = {
  [DRAFT]: [PUBLISHED, ARCHIVED],
  [PUBLISHED]: [ARCHIVED],
  [ARCHIVED]: [PUBLISHED],
};

function listableStatuses(role: Role): TrainingStatus[] {
  return role === Role.EMPLOYEE ? [PUBLISHED] : [DRAFT, PUBLISHED, ARCHIVED];
}

// Arquivado continua visível para quem já está matriculado; rascunho, não.
function canView(training: Training, role: Role): boolean {
  return role !== Role.EMPLOYEE || training.status !== DRAFT;
}

// 404 e não 403: para quem não pode ver, o treinamento não existe.
function assertVisible(training: TrainingWithModules | null, role: Role): TrainingWithModules {
  if (!training || !canView(training, role)) {
    throw new AppError('Treinamento não encontrado.', 404, 'TRAINING_NOT_FOUND');
  }

  return training;
}

export function assertEditable(training: Training): void {
  if (training.status !== DRAFT) {
    throw new AppError(
      'Somente treinamentos em rascunho podem ser editados.',
      409,
      'TRAINING_NOT_EDITABLE',
    );
  }
}

export function createTrainingsService(repository: TrainingsRepository = trainingsRepository) {
  async function findEditable(id: string): Promise<TrainingWithModules> {
    const training = await repository.findById(id);

    if (!training) {
      throw new AppError('Treinamento não encontrado.', 404, 'TRAINING_NOT_FOUND');
    }

    assertEditable(training);
    return training;
  }

  return {
    async list(query: ListTrainingsQuery, actor: AuthenticatedUser) {
      const allowed = listableStatuses(actor.role);
      const statusIn = query.status ? allowed.filter((status) => status === query.status) : allowed;

      if (statusIn.length === 0) {
        return { data: [], page: query.page, limit: query.limit, total: 0 };
      }

      const { items, total } = await repository.findMany({
        statusIn,
        ...(query.category === undefined ? {} : { category: query.category }),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });

      return { data: items, page: query.page, limit: query.limit, total };
    },

    async getById(id: string, actor: AuthenticatedUser): Promise<TrainingWithModules> {
      return assertVisible(await repository.findById(id), actor.role);
    },

    create(input: CreateTrainingInput, actor: AuthenticatedUser): Promise<Training> {
      return repository.create({ ...input, createdById: actor.id, status: DRAFT });
    },

    async update(id: string, input: UpdateTrainingInput): Promise<Training> {
      await findEditable(id);
      return repository.update(id, input);
    },

    async changeStatus(id: string, status: TrainingStatus): Promise<Training> {
      const training = await repository.findById(id);

      if (!training) {
        throw new AppError('Treinamento não encontrado.', 404, 'TRAINING_NOT_FOUND');
      }

      if (training.status === status) {
        return training;
      }

      if (!ALLOWED_TRANSITIONS[training.status].includes(status)) {
        throw new AppError(
          `Transição de ${training.status} para ${status} não é permitida.`,
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      // Sem módulos, o denominador do progresso seria zero.
      if (status === PUBLISHED && (await repository.countModules(id)) === 0) {
        throw new AppError(
          'Um treinamento sem módulos não pode ser publicado.',
          409,
          'TRAINING_WITHOUT_MODULES',
        );
      }

      return repository.update(id, { status });
    },

    findEditable,
  };
}

export type TrainingsService = ReturnType<typeof createTrainingsService>;

export const trainingsService = createTrainingsService();
