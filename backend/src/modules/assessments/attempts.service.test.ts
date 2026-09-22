import { EnrollmentStatus, Role, TrainingStatus, type AssessmentAttempt } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AppError } from '../../shared/errors/AppError';
import type { AuthenticatedUser } from '../../shared/types/express';
import type {
  EnrollmentDetail,
  EnrollmentsRepository,
} from '../enrollments/enrollments.repository';
import type { ModuleProgressRepository } from '../enrollments/module-progress.repository';
import type { AssessmentsRepository, AssessmentWithQuestions } from './assessments.repository';
import { createAttemptsService } from './attempts.service';

const OWNER: AuthenticatedUser = { id: 'user-1', role: Role.EMPLOYEE };
const MANAGER: AuthenticatedUser = { id: 'user-2', role: Role.MANAGER };

const QUESTION_COUNT = 4;

function assessmentWith(minScore = 70, maxAttempts = 3): AssessmentWithQuestions {
  return {
    id: 'assessment-1',
    trainingId: 'training-1',
    minScore,
    maxAttempts,
    questions: Array.from({ length: QUESTION_COUNT }, (_unused, index) => ({
      id: `q${index + 1}`,
      assessmentId: 'assessment-1',
      text: `Pergunta ${index + 1}`,
      position: index + 1,
      answers: [
        { id: `q${index + 1}-a`, questionId: `q${index + 1}`, text: 'certa', isCorrect: true },
        { id: `q${index + 1}-b`, questionId: `q${index + 1}`, text: 'errada', isCorrect: false },
      ],
    })),
  };
}

function submissao(acertos: number) {
  return {
    answers: Array.from({ length: QUESTION_COUNT }, (_unused, index) => ({
      questionId: `q${index + 1}`,
      answerId: index < acertos ? `q${index + 1}-a` : `q${index + 1}-b`,
    })),
  };
}

type SetupOptions = {
  minScore?: number;
  maxAttempts?: number;
  extraAttempts?: number;
  attemptsUsed?: number;
  alreadyPassed?: boolean;
  completedModules?: number;
  withoutAssessment?: boolean;
  withoutQuestions?: boolean;
};

function enrollmentWith(extraAttempts: number, alreadyPassed: boolean): EnrollmentDetail {
  return {
    id: 'enrollment-1',
    userId: OWNER.id,
    trainingId: 'training-1',
    status: EnrollmentStatus.IN_PROGRESS,
    dueDate: null,
    createdAt: new Date(),
    extraAttempts,
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
      modules: [
        {
          id: 'module-1',
          trainingId: 'training-1',
          title: 'Módulo 1',
          content: 'c',
          duration: 30,
          position: 1,
          materialUrl: null,
        },
        {
          id: 'module-2',
          trainingId: 'training-1',
          title: 'Módulo 2',
          content: 'c',
          duration: 30,
          position: 2,
          materialUrl: null,
        },
      ],
      assessment: { id: 'assessment-1', minScore: 70, maxAttempts: 3 },
    },
    moduleProgress: [],
    attempts: alreadyPassed
      ? [{ id: 'attempt-anterior', score: 100, passed: true, createdAt: new Date() }]
      : [],
  };
}

function setup(options: SetupOptions = {}) {
  const {
    minScore = 70,
    maxAttempts = 3,
    extraAttempts = 0,
    attemptsUsed = 0,
    alreadyPassed = false,
    completedModules = 2,
    withoutAssessment = false,
    withoutQuestions = false,
  } = options;

  const assessment = assessmentWith(minScore, maxAttempts);
  if (withoutQuestions) {
    assessment.questions = [];
  }

  const enrollments: EnrollmentsRepository = {
    findMany: vi.fn(),
    findById: vi.fn(() => Promise.resolve(enrollmentWith(extraAttempts, alreadyPassed))),
    findByUserAndTraining: vi.fn(),
    create: vi.fn(),
    assignMany: vi.fn(),
    updateStatus: vi.fn(() => Promise.resolve(enrollmentWith(extraAttempts, alreadyPassed))),
  };

  const assessments: AssessmentsRepository = {
    findByTrainingId: vi.fn(() => Promise.resolve(withoutAssessment ? null : assessment)),
    findQuestionById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    highestQuestionPosition: vi.fn(),
    createQuestion: vi.fn(),
    updateQuestion: vi.fn(),
    removeQuestion: vi.fn(),
  };

  const progress: ModuleProgressRepository = {
    create: vi.fn(),
    find: vi.fn(),
    countByEnrollment: vi.fn(() => Promise.resolve(completedModules)),
  };

  let used = attemptsUsed;

  const attempts = {
    countByEnrollment: vi.fn(() => Promise.resolve(used)),
    findByEnrollment: vi.fn(() => Promise.resolve([] as AssessmentAttempt[])),
    createWithinLimit: vi.fn((data: { limit: number; score: number; passed: boolean }) => {
      if (used >= data.limit) {
        return Promise.resolve({ attempt: null, attemptsUsed: used });
      }

      used += 1;
      return Promise.resolve({
        attempt: {
          id: 'attempt-novo',
          enrollmentId: 'enrollment-1',
          assessmentId: 'assessment-1',
          score: data.score,
          passed: data.passed,
          createdAt: new Date(),
        },
        attemptsUsed: used,
      });
    }),
    grantExtraAttempts: vi.fn((_id: string, amount: number) =>
      Promise.resolve(extraAttempts + amount),
    ),
  };

  return {
    attempts,
    enrollments,
    service: createAttemptsService({ attempts, assessments, enrollments, progress }),
  };
}

describe('submissão e score', () => {
  it('aprova quando o score atinge o mínimo', async () => {
    const { service } = setup({ minScore: 70 });

    const result = await service.submit('enrollment-1', submissao(3), OWNER);

    expect(result.attempt).toMatchObject({ score: 75, passed: true, correctCount: 3 });
  });

  it('reprova quando o score fica abaixo do mínimo', async () => {
    const { service } = setup({ minScore: 70 });

    const result = await service.submit('enrollment-1', submissao(2), OWNER);

    expect(result.attempt).toMatchObject({ score: 50, passed: false });
  });

  // Nota exata no limite.
  it('aprova com score exatamente igual ao minScore', async () => {
    const { service } = setup({ minScore: 75 });

    const result = await service.submit('enrollment-1', submissao(3), OWNER);

    expect(result.attempt).toMatchObject({ score: 75, passed: true });
  });

  it('reprova com score um passo abaixo do minScore', async () => {
    const { service } = setup({ minScore: 76 });

    const result = await service.submit('enrollment-1', submissao(3), OWNER);

    expect(result.attempt).toMatchObject({ score: 75, passed: false });
  });

  it('informa quantas tentativas restam', async () => {
    const { service } = setup({ maxAttempts: 3, attemptsUsed: 1 });

    const result = await service.submit('enrollment-1', submissao(1), OWNER);

    expect(result).toMatchObject({ attemptsUsed: 2, attemptsAllowed: 3, attemptsRemaining: 1 });
  });
});

describe('validação da submissão', () => {
  it.each([
    [
      'submissão incompleta',
      { answers: [{ questionId: 'q1', answerId: 'q1-a' }] },
      'INCOMPLETE_SUBMISSION',
    ],
    [
      'pergunta de outra avaliação',
      {
        answers: [
          { questionId: 'q1', answerId: 'q1-a' },
          { questionId: 'q2', answerId: 'q2-a' },
          { questionId: 'q3', answerId: 'q3-a' },
          { questionId: 'q99', answerId: 'q99-a' },
        ],
      },
      'INVALID_QUESTION',
    ],
    [
      'alternativa de outra pergunta',
      {
        answers: [
          { questionId: 'q1', answerId: 'q2-a' },
          { questionId: 'q2', answerId: 'q2-a' },
          { questionId: 'q3', answerId: 'q3-a' },
          { questionId: 'q4', answerId: 'q4-a' },
        ],
      },
      'INVALID_ANSWER',
    ],
    [
      'resposta repetida para a mesma pergunta',
      {
        answers: [
          { questionId: 'q1', answerId: 'q1-a' },
          { questionId: 'q1', answerId: 'q1-b' },
          { questionId: 'q2', answerId: 'q2-a' },
          { questionId: 'q3', answerId: 'q3-a' },
        ],
      },
      'DUPLICATE_ANSWER',
    ],
  ])('recusa %s com 400', async (_caso, payload, code) => {
    const { attempts, service } = setup();

    await expect(service.submit('enrollment-1', payload, OWNER)).rejects.toMatchObject({
      statusCode: 400,
      code,
    });
    expect(attempts.createWithinLimit).not.toHaveBeenCalled();
  });

  it('avaliação sem perguntas recusa submissão com 409', async () => {
    const { service } = setup({ withoutQuestions: true });

    await expect(service.submit('enrollment-1', submissao(0), OWNER)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ASSESSMENT_WITHOUT_QUESTIONS',
    });
  });

  it('treinamento sem avaliação devolve 404', async () => {
    const { service } = setup({ withoutAssessment: true });

    await expect(service.submit('enrollment-1', submissao(4), OWNER)).rejects.toMatchObject({
      statusCode: 404,
      code: 'ASSESSMENT_NOT_FOUND',
    });
  });
});

describe('tentativas esgotadas', () => {
  // 403 com mensagem clara, nunca 500.
  it('bloqueia com 403 ao atingir maxAttempts sem aprovação', async () => {
    const { attempts, service } = setup({ maxAttempts: 2, attemptsUsed: 2 });

    const erro = await service.submit('enrollment-1', submissao(4), OWNER).then(
      () => null,
      (thrown: unknown) => thrown as AppError,
    );

    expect(erro?.statusCode).toBe(403);
    expect(erro?.code).toBe('ATTEMPTS_EXHAUSTED');
    expect(erro?.message).toContain('2/2');
    expect(attempts.createWithinLimit).not.toHaveBeenCalled();
  });

  it('última tentativa disponível ainda é aceita', async () => {
    const { service } = setup({ maxAttempts: 2, attemptsUsed: 1 });

    const result = await service.submit('enrollment-1', submissao(4), OWNER);

    expect(result.attemptsRemaining).toBe(0);
  });

  // O limite real é aplicado no repository; a checagem antecipada pode estar velha.
  it('repositório recusando por limite também vira 403', async () => {
    const { attempts, service } = setup({ maxAttempts: 3, attemptsUsed: 0 });
    attempts.createWithinLimit.mockResolvedValue({ attempt: null, attemptsUsed: 3 });

    await expect(service.submit('enrollment-1', submissao(4), OWNER)).rejects.toMatchObject({
      statusCode: 403,
      code: 'ATTEMPTS_EXHAUSTED',
    });
  });

  it('tentativas extras concedidas liberam nova submissão', async () => {
    const { service } = setup({ maxAttempts: 2, attemptsUsed: 2, extraAttempts: 1 });

    const result = await service.submit('enrollment-1', submissao(4), OWNER);

    expect(result).toMatchObject({ attemptsAllowed: 3, attemptsUsed: 3 });
  });

  it('já aprovado recusa nova tentativa com 409', async () => {
    const { service } = setup({ alreadyPassed: true });

    await expect(service.submit('enrollment-1', submissao(4), OWNER)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ASSESSMENT_ALREADY_PASSED',
    });
  });
});

describe('autorização', () => {
  it('MANAGER não responde pelo funcionário', async () => {
    const { attempts, service } = setup();

    await expect(service.submit('enrollment-1', submissao(4), MANAGER)).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_ENROLLMENT_OWNER',
    });
    expect(attempts.createWithinLimit).not.toHaveBeenCalled();
  });

  it('matrícula inexistente devolve 404', async () => {
    const { enrollments, service } = setup();
    vi.mocked(enrollments.findById).mockResolvedValue(null);

    await expect(service.submit('enrollment-1', submissao(4), OWNER)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('conclusão do treinamento com avaliação', () => {
  it('aprovação com todos os módulos conclui a matrícula', async () => {
    const { enrollments, service } = setup({ minScore: 70, completedModules: 2 });

    const result = await service.submit('enrollment-1', submissao(4), OWNER);

    expect(result.attempt.passed).toBe(true);
    expect(result.enrollment.status).toBe(EnrollmentStatus.COMPLETED);
    expect(enrollments.updateStatus).toHaveBeenCalledWith(
      'enrollment-1',
      EnrollmentStatus.COMPLETED,
    );
  });

  // Aprovar sem terminar os módulos não conclui.
  it('aprovação com módulos pendentes mantém IN_PROGRESS', async () => {
    const { service } = setup({ minScore: 70, completedModules: 1 });

    const result = await service.submit('enrollment-1', submissao(4), OWNER);

    expect(result.attempt.passed).toBe(true);
    expect(result.enrollment.status).toBe(EnrollmentStatus.IN_PROGRESS);
  });

  it('reprovação com todos os módulos mantém IN_PROGRESS', async () => {
    const { service } = setup({ minScore: 70, completedModules: 2 });

    const result = await service.submit('enrollment-1', submissao(1), OWNER);

    expect(result.attempt.passed).toBe(false);
    expect(result.enrollment.status).toBe(EnrollmentStatus.IN_PROGRESS);
  });
});

describe('desbloqueio', () => {
  it('concede tentativas extras sem apagar o histórico', async () => {
    const { attempts, service } = setup({ maxAttempts: 2, attemptsUsed: 2 });

    const result = await service.unlock('enrollment-1', { extraAttempts: 2 });

    expect(attempts.grantExtraAttempts).toHaveBeenCalledWith('enrollment-1', 2);
    expect(result).toMatchObject({ granted: 2, attemptsAllowed: 4, attemptsRemaining: 2 });
  });
});
