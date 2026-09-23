import { EnrollmentStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  calculateProgress,
  canCompleteTraining,
  deriveEnrollmentStatus,
  storableStatus,
} from './progress';

const { NOT_STARTED, IN_PROGRESS, COMPLETED, OVERDUE } = EnrollmentStatus;

describe('calculateProgress', () => {
  it.each([
    [0, 8, 0],
    [5, 8, 62.5],
    [1, 3, 33.3],
    [2, 3, 66.7],
    [8, 8, 100],
    [1, 1, 100],
  ])('%i de %i módulos → %f%%', (completed, total, percentage) => {
    expect(calculateProgress(completed, total)).toEqual({
      completedModules: completed,
      totalModules: total,
      percentage,
    });
  });

  // Treinamento sem módulos não pode virar divisão por zero.
  it('devolve 0% quando o treinamento não tem módulos', () => {
    expect(calculateProgress(0, 0)).toEqual({
      completedModules: 0,
      totalModules: 0,
      percentage: 0,
    });
  });

  it('não passa de 100% se houver mais concluídos que o total', () => {
    expect(calculateProgress(9, 8)).toMatchObject({ completedModules: 8, percentage: 100 });
  });

  it('não devolve percentual negativo', () => {
    expect(calculateProgress(-3, 8)).toMatchObject({ completedModules: 0, percentage: 0 });
  });
});

describe('canCompleteTraining', () => {
  it('treinamento sem avaliação: basta concluir todos os módulos', () => {
    expect(
      canCompleteTraining({
        completedModules: 4,
        totalModules: 4,
        hasAssessment: false,
        assessmentPassed: false,
      }),
    ).toBe(true);
  });

  it('módulos incompletos nunca concluem', () => {
    expect(
      canCompleteTraining({
        completedModules: 3,
        totalModules: 4,
        hasAssessment: false,
        assessmentPassed: false,
      }),
    ).toBe(false);
  });

  it('com avaliação: todos os módulos mas sem aprovação não conclui', () => {
    expect(
      canCompleteTraining({
        completedModules: 4,
        totalModules: 4,
        hasAssessment: true,
        assessmentPassed: false,
      }),
    ).toBe(false);
  });

  it('com avaliação: todos os módulos e aprovação conclui', () => {
    expect(
      canCompleteTraining({
        completedModules: 4,
        totalModules: 4,
        hasAssessment: true,
        assessmentPassed: true,
      }),
    ).toBe(true);
  });

  it('treinamento sem módulos não conclui', () => {
    expect(
      canCompleteTraining({
        completedModules: 0,
        totalModules: 0,
        hasAssessment: false,
        assessmentPassed: false,
      }),
    ).toBe(false);
  });
});

describe('deriveEnrollmentStatus', () => {
  const now = new Date('2026-09-22T12:00:00Z');
  const ontem = new Date('2026-09-21T12:00:00Z');
  const amanha = new Date('2026-09-23T12:00:00Z');

  const base = { hasAssessment: false, assessmentPassed: false };

  it('sem módulos concluídos e no prazo → NOT_STARTED', () => {
    expect(
      deriveEnrollmentStatus(
        { ...base, completedModules: 0, totalModules: 4, dueDate: amanha },
        now,
      ),
    ).toBe(NOT_STARTED);
  });

  it('parcialmente concluído e no prazo → IN_PROGRESS', () => {
    expect(
      deriveEnrollmentStatus(
        { ...base, completedModules: 2, totalModules: 4, dueDate: amanha },
        now,
      ),
    ).toBe(IN_PROGRESS);
  });

  it('prazo vencido e incompleto → OVERDUE', () => {
    expect(
      deriveEnrollmentStatus(
        { ...base, completedModules: 2, totalModules: 4, dueDate: ontem },
        now,
      ),
    ).toBe(OVERDUE);
  });

  // Terminar depois do prazo ainda é terminar.
  it('concluído com prazo vencido → COMPLETED, não OVERDUE', () => {
    expect(
      deriveEnrollmentStatus(
        { ...base, completedModules: 4, totalModules: 4, dueDate: ontem },
        now,
      ),
    ).toBe(COMPLETED);
  });

  it('sem prazo nunca fica OVERDUE', () => {
    expect(
      deriveEnrollmentStatus({ ...base, completedModules: 1, totalModules: 4, dueDate: null }, now),
    ).toBe(IN_PROGRESS);
  });

  it('todos os módulos mas avaliação não aprovada e prazo vencido → OVERDUE', () => {
    expect(
      deriveEnrollmentStatus(
        {
          completedModules: 4,
          totalModules: 4,
          hasAssessment: true,
          assessmentPassed: false,
          dueDate: ontem,
        },
        now,
      ),
    ).toBe(OVERDUE);
  });
});

describe('storableStatus', () => {
  // OVERDUE depende do instante da leitura e por isso nunca é gravado.
  it('nunca devolve OVERDUE', () => {
    const statuses = [
      storableStatus({
        completedModules: 0,
        totalModules: 4,
        hasAssessment: false,
        assessmentPassed: false,
      }),
      storableStatus({
        completedModules: 2,
        totalModules: 4,
        hasAssessment: false,
        assessmentPassed: false,
      }),
      storableStatus({
        completedModules: 4,
        totalModules: 4,
        hasAssessment: false,
        assessmentPassed: false,
      }),
    ];

    expect(statuses).toEqual([NOT_STARTED, IN_PROGRESS, COMPLETED]);
    expect(statuses).not.toContain(OVERDUE);
  });
});
