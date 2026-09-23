import { EnrollmentStatus } from '@prisma/client';

const { NOT_STARTED, IN_PROGRESS, COMPLETED, OVERDUE } = EnrollmentStatus;

export type ProgressSummary = {
  completedModules: number;
  totalModules: number;
  percentage: number;
};

export type CompletionInput = {
  completedModules: number;
  totalModules: number;
  hasAssessment: boolean;
  assessmentPassed: boolean;
};

export function calculateProgress(completedModules: number, totalModules: number): ProgressSummary {
  if (totalModules <= 0) {
    return { completedModules: 0, totalModules: 0, percentage: 0 };
  }

  // Defensivo: mais concluídos que o total indicaria dado inconsistente, e o
  // percentual não deve passar de 100.
  const completed = Math.max(0, Math.min(completedModules, totalModules));

  return {
    completedModules: completed,
    totalModules,
    percentage: Math.round((completed / totalModules) * 1000) / 10,
  };
}

// Treinamento sem avaliação depende apenas dos módulos (ver ADR 007).
export function canCompleteTraining({
  completedModules,
  totalModules,
  hasAssessment,
  assessmentPassed,
}: CompletionInput): boolean {
  if (totalModules <= 0 || completedModules < totalModules) {
    return false;
  }

  return hasAssessment ? assessmentPassed : true;
}

/**
 * Status derivado do estado real, não lido da coluna (ver ADR 007).
 * Concluído vence atrasado: terminar depois do prazo ainda é terminar.
 */
export function deriveEnrollmentStatus(
  input: CompletionInput & { dueDate: Date | null },
  now: Date = new Date(),
): EnrollmentStatus {
  if (canCompleteTraining(input)) {
    return COMPLETED;
  }

  if (input.dueDate !== null && input.dueDate.getTime() < now.getTime()) {
    return OVERDUE;
  }

  return input.completedModules > 0 ? IN_PROGRESS : NOT_STARTED;
}

/**
 * Valor gravado na coluna `status`, que só existe para filtro de listagem.
 * `OVERDUE` nunca é persistido — depende do instante da leitura.
 */
export function storableStatus(input: CompletionInput): EnrollmentStatus {
  if (canCompleteTraining(input)) {
    return COMPLETED;
  }

  return input.completedModules > 0 ? IN_PROGRESS : NOT_STARTED;
}
