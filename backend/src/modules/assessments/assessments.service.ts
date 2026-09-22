import { Role, type Assessment } from '@prisma/client';

import { AppError } from '../../shared/errors/AppError';
import type { AuthenticatedUser } from '../../shared/types/express';
import { createTrainingsService, type TrainingsService } from '../trainings/trainings.service';
import {
  assessmentsRepository,
  type AssessmentsRepository,
  type AssessmentWithQuestions,
  type QuestionWithAnswers,
} from './assessments.repository';
import type {
  CreateAssessmentInput,
  CreateQuestionInput,
  UpdateAssessmentInput,
  UpdateQuestionInput,
} from './assessments.schemas';

/** Visão do autor: inclui o gabarito. */
export function toAuthorView(assessment: AssessmentWithQuestions) {
  return {
    id: assessment.id,
    trainingId: assessment.trainingId,
    minScore: assessment.minScore,
    maxAttempts: assessment.maxAttempts,
    questions: assessment.questions.map((question) => ({
      id: question.id,
      text: question.text,
      position: question.position,
      answers: question.answers.map((answer) => ({
        id: answer.id,
        text: answer.text,
        isCorrect: answer.isCorrect,
      })),
    })),
  };
}

/**
 * Visão de quem responde: `isCorrect` é omitido, não enviado como `false`.
 * A omissão é o ponto — um campo presente com valor falso entregaria o gabarito
 * por eliminação.
 */
export function toCandidateView(assessment: AssessmentWithQuestions) {
  return {
    id: assessment.id,
    trainingId: assessment.trainingId,
    minScore: assessment.minScore,
    maxAttempts: assessment.maxAttempts,
    questions: assessment.questions.map((question) => ({
      id: question.id,
      text: question.text,
      position: question.position,
      answers: question.answers.map((answer) => ({ id: answer.id, text: answer.text })),
    })),
  };
}

export type AssessmentsServiceDeps = {
  assessments?: AssessmentsRepository;
  trainings?: TrainingsService;
};

export function createAssessmentsService({
  assessments = assessmentsRepository,
  trainings = createTrainingsService(),
}: AssessmentsServiceDeps = {}) {
  async function requireAssessment(trainingId: string): Promise<AssessmentWithQuestions> {
    const assessment = await assessments.findByTrainingId(trainingId);

    if (!assessment) {
      throw new AppError('Este treinamento não possui avaliação.', 404, 'ASSESSMENT_NOT_FOUND');
    }

    return assessment;
  }

  // Mesma regra de imutabilidade dos módulos: avaliação só muda em DRAFT,
  // porque alterar o gabarito depois da publicação invalidaria tentativas feitas.
  async function requireEditableAssessment(trainingId: string): Promise<AssessmentWithQuestions> {
    await trainings.findEditable(trainingId);
    return requireAssessment(trainingId);
  }

  async function requireQuestionOf(
    assessmentId: string,
    questionId: string,
  ): Promise<QuestionWithAnswers> {
    const question = await assessments.findQuestionById(questionId);

    if (!question || question.assessmentId !== assessmentId) {
      throw new AppError('Pergunta não encontrada.', 404, 'QUESTION_NOT_FOUND');
    }

    return question;
  }

  return {
    async getForActor(trainingId: string, actor: AuthenticatedUser) {
      // Passa pela visibilidade do treinamento: rascunho não existe para EMPLOYEE.
      await trainings.getById(trainingId, actor);

      const assessment = await requireAssessment(trainingId);

      return actor.role === Role.EMPLOYEE ? toCandidateView(assessment) : toAuthorView(assessment);
    },

    async create(trainingId: string, input: CreateAssessmentInput): Promise<Assessment> {
      await trainings.findEditable(trainingId);

      // Relação 1:1 — trainingId é @unique no schema.
      if (await assessments.findByTrainingId(trainingId)) {
        throw new AppError(
          'Este treinamento já possui uma avaliação.',
          409,
          'ASSESSMENT_ALREADY_EXISTS',
        );
      }

      return assessments.create(trainingId, input);
    },

    async update(trainingId: string, input: UpdateAssessmentInput): Promise<Assessment> {
      const assessment = await requireEditableAssessment(trainingId);

      return assessments.update(assessment.id, input);
    },

    async remove(trainingId: string): Promise<void> {
      const assessment = await requireEditableAssessment(trainingId);

      await assessments.remove(assessment.id);
    },

    async addQuestion(trainingId: string, input: CreateQuestionInput) {
      const assessment = await requireEditableAssessment(trainingId);
      const highest = await assessments.highestQuestionPosition(assessment.id);

      const question = await assessments.createQuestion(assessment.id, {
        text: input.text,
        position: (highest ?? 0) + 1,
        answers: input.answers.map((answer) => ({
          text: answer.text,
          isCorrect: answer.isCorrect,
        })),
      });

      return questionAuthorView(question);
    },

    async updateQuestion(trainingId: string, questionId: string, input: UpdateQuestionInput) {
      const assessment = await requireEditableAssessment(trainingId);
      await requireQuestionOf(assessment.id, questionId);

      const question = await assessments.updateQuestion(questionId, {
        ...(input.text === undefined ? {} : { text: input.text }),
        ...(input.answers === undefined
          ? {}
          : {
              answers: input.answers.map((answer) => ({
                text: answer.text,
                isCorrect: answer.isCorrect,
              })),
            }),
      });

      return questionAuthorView(question);
    },

    async removeQuestion(trainingId: string, questionId: string): Promise<void> {
      const assessment = await requireEditableAssessment(trainingId);
      await requireQuestionOf(assessment.id, questionId);

      await assessments.removeQuestion(questionId);
    },
  };
}

function questionAuthorView(question: QuestionWithAnswers) {
  return {
    id: question.id,
    text: question.text,
    position: question.position,
    answers: question.answers.map((answer) => ({
      id: answer.id,
      text: answer.text,
      isCorrect: answer.isCorrect,
    })),
  };
}

export type AssessmentsService = ReturnType<typeof createAssessmentsService>;

export const assessmentsService = createAssessmentsService();
