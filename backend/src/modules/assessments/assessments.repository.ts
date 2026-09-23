import type { Answer, Assessment, Prisma, Question } from '@prisma/client';

import { prisma } from '../../shared/database/prisma';

export type QuestionWithAnswers = Question & { answers: Answer[] };

export type AssessmentWithQuestions = Assessment & {
  questions: QuestionWithAnswers[];
};

export type AnswerDraft = { text: string; isCorrect: boolean };

export type AssessmentsRepository = {
  findByTrainingId: (trainingId: string) => Promise<AssessmentWithQuestions | null>;
  findQuestionById: (questionId: string) => Promise<QuestionWithAnswers | null>;
  create: (
    trainingId: string,
    data: { minScore: number; maxAttempts: number },
  ) => Promise<Assessment>;
  update: (
    id: string,
    data: { minScore?: number | undefined; maxAttempts?: number | undefined },
  ) => Promise<Assessment>;
  remove: (id: string) => Promise<void>;
  highestQuestionPosition: (assessmentId: string) => Promise<number | null>;
  createQuestion: (
    assessmentId: string,
    data: { text: string; position: number; answers: AnswerDraft[] },
  ) => Promise<QuestionWithAnswers>;
  updateQuestion: (
    questionId: string,
    data: { text?: string | undefined; answers?: AnswerDraft[] | undefined },
  ) => Promise<QuestionWithAnswers>;
  removeQuestion: (questionId: string) => Promise<void>;
};

const questionInclude = { answers: { orderBy: { text: 'asc' } } } as const;

export const assessmentsRepository: AssessmentsRepository = {
  findByTrainingId(trainingId) {
    return prisma.assessment.findUnique({
      where: { trainingId },
      include: { questions: { orderBy: { position: 'asc' }, include: questionInclude } },
    });
  },

  findQuestionById(questionId) {
    return prisma.question.findUnique({ where: { id: questionId }, include: questionInclude });
  },

  create(trainingId, data) {
    return prisma.assessment.create({ data: { ...data, trainingId } });
  },

  update(id, data) {
    // Mesma incompatibilidade de `exactOptionalPropertyTypes` com o input do
    // Prisma tratada nos outros repositories; os campos são os mesmos.
    return prisma.assessment.update({
      where: { id },
      data: data as Prisma.AssessmentUpdateInput,
    });
  },

  async remove(id) {
    await prisma.assessment.delete({ where: { id } });
  },

  async highestQuestionPosition(assessmentId) {
    const last = await prisma.question.findFirst({
      where: { assessmentId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    return last?.position ?? null;
  },

  createQuestion(assessmentId, { text, position, answers }) {
    return prisma.question.create({
      data: { assessmentId, text, position, answers: { create: answers } },
      include: questionInclude,
    });
  },

  // Alternativas são substituídas por inteiro: editar texto in-place exigiria
  // casar cada alternativa por id e não há caso de uso para isso no MVP.
  updateQuestion(questionId, { text, answers }) {
    return prisma.$transaction(async (tx) => {
      if (answers !== undefined) {
        await tx.answer.deleteMany({ where: { questionId } });
      }

      return tx.question.update({
        where: { id: questionId },
        data: {
          ...(text === undefined ? {} : { text }),
          ...(answers === undefined ? {} : { answers: { create: answers } }),
        },
        include: questionInclude,
      });
    });
  },

  async removeQuestion(questionId) {
    await prisma.question.delete({ where: { id: questionId } });
  },
};
