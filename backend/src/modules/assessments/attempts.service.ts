import { Role, type AssessmentAttempt } from '@prisma/client';

import { AppError } from '../../shared/errors/AppError';
import type { AuthenticatedUser } from '../../shared/types/express';
import {
  enrollmentsRepository,
  type EnrollmentDetail,
  type EnrollmentsRepository,
} from '../enrollments/enrollments.repository';
import {
  moduleProgressRepository,
  type ModuleProgressRepository,
} from '../enrollments/module-progress.repository';
import {
  calculateProgress,
  deriveEnrollmentStatus,
  storableStatus,
  type ProgressSummary,
} from '../enrollments/progress';
import {
  assessmentsRepository,
  type AssessmentsRepository,
  type AssessmentWithQuestions,
} from './assessments.repository';
import type { SubmitAttemptInput, UnlockAttemptsInput } from './assessments.schemas';
import { attemptsRepository, type AttemptsRepository } from './attempts.repository';
import { calculateScore, isPassing, type SubmittedAnswer } from './scoring';

export type AttemptResult = {
  attempt: {
    id: string;
    score: number;
    passed: boolean;
    correctCount: number;
    totalQuestions: number;
    createdAt: Date;
  };
  attemptsUsed: number;
  attemptsAllowed: number;
  attemptsRemaining: number;
  enrollment: { id: string; status: EnrollmentDetail['status']; progress: ProgressSummary };
};

export type AttemptsServiceDeps = {
  attempts?: AttemptsRepository;
  assessments?: AssessmentsRepository;
  enrollments?: EnrollmentsRepository;
  progress?: ModuleProgressRepository;
};

export function createAttemptsService({
  attempts = attemptsRepository,
  assessments = assessmentsRepository,
  enrollments = enrollmentsRepository,
  progress = moduleProgressRepository,
}: AttemptsServiceDeps = {}) {
  async function requireEnrollment(id: string): Promise<EnrollmentDetail> {
    const enrollment = await enrollments.findById(id);

    if (!enrollment) {
      throw new AppError('Matrícula não encontrada.', 404, 'ENROLLMENT_NOT_FOUND');
    }

    return enrollment;
  }

  function assertOwner(enrollment: EnrollmentDetail, actor: AuthenticatedUser): void {
    if (enrollment.userId !== actor.id) {
      throw new AppError(
        'Somente o próprio matriculado pode responder à avaliação.',
        403,
        'NOT_ENROLLMENT_OWNER',
      );
    }
  }

  /**
   * Valida a submissão contra o gabarito antes de pontuar: uma resposta por
   * pergunta, sem repetição, sem pergunta de fora e com alternativa pertencente
   * à pergunta. Submissão parcial é recusada em vez de contar como erro — o
   * cliente não deveria conseguir gastar uma tentativa por engano.
   */
  function validateSubmission(
    assessment: AssessmentWithQuestions,
    submitted: SubmittedAnswer[],
  ): void {
    const questionIds = new Set(assessment.questions.map((question) => question.id));
    const seen = new Set<string>();

    for (const answer of submitted) {
      if (!questionIds.has(answer.questionId)) {
        throw new AppError(
          'Resposta enviada para pergunta que não pertence a esta avaliação.',
          400,
          'INVALID_QUESTION',
        );
      }

      if (seen.has(answer.questionId)) {
        throw new AppError(
          'Há mais de uma resposta para a mesma pergunta.',
          400,
          'DUPLICATE_ANSWER',
        );
      }

      seen.add(answer.questionId);

      const question = assessment.questions.find((item) => item.id === answer.questionId);
      const belongs = question?.answers.some((option) => option.id === answer.answerId) ?? false;

      if (!belongs) {
        throw new AppError('Alternativa não pertence à pergunta informada.', 400, 'INVALID_ANSWER');
      }
    }

    if (seen.size !== assessment.questions.length) {
      throw new AppError(
        'Responda todas as perguntas antes de enviar a avaliação.',
        400,
        'INCOMPLETE_SUBMISSION',
      );
    }
  }

  async function refreshEnrollment(enrollment: EnrollmentDetail, assessmentPassed: boolean) {
    const completedModules = await progress.countByEnrollment(enrollment.id);
    const summary = calculateProgress(completedModules, enrollment.training.modules.length);

    const completion = {
      ...summary,
      hasAssessment: true,
      assessmentPassed,
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

  return {
    async submit(
      enrollmentId: string,
      input: SubmitAttemptInput,
      actor: AuthenticatedUser,
    ): Promise<AttemptResult> {
      const enrollment = await requireEnrollment(enrollmentId);
      assertOwner(enrollment, actor);

      const assessment = await assessments.findByTrainingId(enrollment.trainingId);

      if (!assessment) {
        throw new AppError('Este treinamento não possui avaliação.', 404, 'ASSESSMENT_NOT_FOUND');
      }

      if (assessment.questions.length === 0) {
        throw new AppError(
          'Esta avaliação ainda não possui perguntas.',
          409,
          'ASSESSMENT_WITHOUT_QUESTIONS',
        );
      }

      // Já aprovado: nova tentativa não muda nada e gastaria cota.
      if (enrollment.attempts.some((attempt) => attempt.passed)) {
        throw new AppError(
          'Avaliação já aprovada nesta matrícula.',
          409,
          'ASSESSMENT_ALREADY_PASSED',
        );
      }

      const attemptsAllowed = assessment.maxAttempts + enrollment.extraAttempts;
      const attemptsUsed = await attempts.countByEnrollment(enrollmentId);

      // Checagem antecipada para a mensagem clara; o limite real é aplicado de
      // forma atômica no repository (ADR 010).
      if (attemptsUsed >= attemptsAllowed) {
        throw exhaustedError(attemptsUsed, attemptsAllowed);
      }

      validateSubmission(assessment, input.answers);

      const { correctCount, totalQuestions, score } = calculateScore(
        assessment.questions.map((question) => ({
          id: question.id,
          correctAnswerId: question.answers.find((answer) => answer.isCorrect)?.id ?? '',
        })),
        input.answers,
      );

      const passed = isPassing(score, assessment.minScore);

      const outcome = await attempts.createWithinLimit({
        enrollmentId,
        assessmentId: assessment.id,
        limit: attemptsAllowed,
        score,
        passed,
        answers: input.answers,
      });

      // Submissão concorrente consumiu a última tentativa entre a checagem e a escrita.
      if (outcome.attempt === null) {
        throw exhaustedError(outcome.attemptsUsed, attemptsAllowed);
      }

      const enrollmentState = await refreshEnrollment(enrollment, passed);

      return {
        attempt: {
          id: outcome.attempt.id,
          score,
          passed,
          correctCount,
          totalQuestions,
          createdAt: outcome.attempt.createdAt,
        },
        attemptsUsed: outcome.attemptsUsed,
        attemptsAllowed,
        attemptsRemaining: Math.max(0, attemptsAllowed - outcome.attemptsUsed),
        enrollment: enrollmentState,
      };
    },

    async listByEnrollment(
      enrollmentId: string,
      actor: AuthenticatedUser,
    ): Promise<{
      attempts: AssessmentAttempt[];
      attemptsUsed: number;
      attemptsAllowed: number;
      attemptsRemaining: number;
      blocked: boolean;
    }> {
      const enrollment = await requireEnrollment(enrollmentId);

      if (actor.role === Role.EMPLOYEE && enrollment.userId !== actor.id) {
        throw new AppError('Matrícula não encontrada.', 404, 'ENROLLMENT_NOT_FOUND');
      }

      const assessment = await assessments.findByTrainingId(enrollment.trainingId);

      if (!assessment) {
        throw new AppError('Este treinamento não possui avaliação.', 404, 'ASSESSMENT_NOT_FOUND');
      }

      const rows = await attempts.findByEnrollment(enrollmentId);
      const attemptsAllowed = assessment.maxAttempts + enrollment.extraAttempts;
      const passed = rows.some((attempt) => attempt.passed);

      return {
        attempts: rows,
        attemptsUsed: rows.length,
        attemptsAllowed,
        attemptsRemaining: Math.max(0, attemptsAllowed - rows.length),
        blocked: !passed && rows.length >= attemptsAllowed,
      };
    },

    // Desbloqueio concede tentativas em vez de apagar as existentes: o histórico
    // de reprovações é dado de auditoria (ADR 010).
    async unlock(enrollmentId: string, input: UnlockAttemptsInput) {
      const enrollment = await requireEnrollment(enrollmentId);
      const assessment = await assessments.findByTrainingId(enrollment.trainingId);

      if (!assessment) {
        throw new AppError('Este treinamento não possui avaliação.', 404, 'ASSESSMENT_NOT_FOUND');
      }

      const extraAttempts = await attempts.grantExtraAttempts(enrollmentId, input.extraAttempts);
      const attemptsUsed = await attempts.countByEnrollment(enrollmentId);
      const attemptsAllowed = assessment.maxAttempts + extraAttempts;

      return {
        enrollmentId,
        granted: input.extraAttempts,
        extraAttempts,
        attemptsUsed,
        attemptsAllowed,
        attemptsRemaining: Math.max(0, attemptsAllowed - attemptsUsed),
      };
    },
  };
}

// 403 com mensagem clara, nunca 500.
function exhaustedError(attemptsUsed: number, attemptsAllowed: number): AppError {
  return new AppError(
    `Tentativas esgotadas (${attemptsUsed}/${attemptsAllowed}). Um gestor ou administrador precisa liberar novas tentativas.`,
    403,
    'ATTEMPTS_EXHAUSTED',
    { attemptsUsed, attemptsAllowed },
  );
}

export type AttemptsService = ReturnType<typeof createAttemptsService>;

export const attemptsService = createAttemptsService();
