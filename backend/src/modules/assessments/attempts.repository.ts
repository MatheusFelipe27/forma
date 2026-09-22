import type { AssessmentAttempt } from '@prisma/client';

import { prisma } from '../../shared/database/prisma';

export type AttemptAnswerDraft = { questionId: string; answerId: string };

export type CreateAttemptData = {
  enrollmentId: string;
  assessmentId: string;
  limit: number;
  score: number;
  passed: boolean;
  answers: AttemptAnswerDraft[];
};

export type CreateAttemptOutcome =
  { attempt: AssessmentAttempt; attemptsUsed: number } | { attempt: null; attemptsUsed: number };

export type AttemptsRepository = {
  countByEnrollment: (enrollmentId: string) => Promise<number>;
  findByEnrollment: (enrollmentId: string) => Promise<AssessmentAttempt[]>;
  createWithinLimit: (data: CreateAttemptData) => Promise<CreateAttemptOutcome>;
  grantExtraAttempts: (enrollmentId: string, amount: number) => Promise<number>;
};

export const attemptsRepository: AttemptsRepository = {
  countByEnrollment(enrollmentId) {
    return prisma.assessmentAttempt.count({ where: { enrollmentId } });
  },

  findByEnrollment(enrollmentId) {
    return prisma.assessmentAttempt.findMany({
      where: { enrollmentId },
      orderBy: { createdAt: 'asc' },
    });
  },

  /**
   * Contagem e inserção sob lock da linha da matrícula — ver ADR 010.
   *
   * Tentativas duplicadas são legítimas, então não existe constraint única para
   * apoiar o limite como na ADR 004. O `FOR UPDATE` serializa as submissões
   * concorrentes da mesma matrícula: sem ele, duas requisições simultâneas
   * contariam `maxAttempts - 1` e ambas gravariam.
   *
   * `limit` vem decidido pelo Service; aqui só a precondição numérica é
   * aplicada de forma atômica.
   */
  createWithinLimit({ enrollmentId, assessmentId, limit, score, passed, answers }) {
    return prisma.$transaction(async (tx) => {
      // Sem cast: `enrollments.id` é `text` no Postgres, porque o Prisma mapeia
      // `String @id @default(uuid())` para text, não para o tipo uuid.
      await tx.$queryRaw`SELECT id FROM enrollments WHERE id = ${enrollmentId} FOR UPDATE`;

      const attemptsUsed = await tx.assessmentAttempt.count({ where: { enrollmentId } });

      if (attemptsUsed >= limit) {
        return { attempt: null, attemptsUsed };
      }

      const attempt = await tx.assessmentAttempt.create({
        data: {
          enrollmentId,
          assessmentId,
          score,
          passed,
          answers: { create: answers },
        },
      });

      return { attempt, attemptsUsed: attemptsUsed + 1 };
    });
  },

  async grantExtraAttempts(enrollmentId, amount) {
    const updated = await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { extraAttempts: { increment: amount } },
      select: { extraAttempts: true },
    });

    return updated.extraAttempts;
  },
};
