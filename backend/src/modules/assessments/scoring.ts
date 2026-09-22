export type ScoringQuestion = {
  id: string;
  correctAnswerId: string;
};

export type SubmittedAnswer = {
  questionId: string;
  answerId: string;
};

export type ScoreResult = {
  correctCount: number;
  totalQuestions: number;
  score: number;
};

/**
 * Score calculado no backend — o frontend só exibe o resultado.
 *
 * Pressupõe submissão já validada: uma resposta por pergunta, sem repetição e
 * com alternativa pertencente à pergunta. A validação fica no Service, para esta
 * função não precisar de acesso a dado nenhum.
 */
export function calculateScore(
  questions: ScoringQuestion[],
  submitted: SubmittedAnswer[],
): ScoreResult {
  const totalQuestions = questions.length;

  if (totalQuestions === 0) {
    return { correctCount: 0, totalQuestions: 0, score: 0 };
  }

  const answerByQuestion = new Map(submitted.map((answer) => [answer.questionId, answer.answerId]));

  const correctCount = questions.filter(
    (question) => answerByQuestion.get(question.id) === question.correctAnswerId,
  ).length;

  return {
    correctCount,
    totalQuestions,
    score: Math.round((correctCount / totalQuestions) * 1000) / 10,
  };
}

// Aprovado no limite exato: `>=`, não `>`. Nota igual ao mínimo passa.
export function isPassing(score: number, minScore: number): boolean {
  return score >= minScore;
}
