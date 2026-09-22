import { describe, expect, it } from 'vitest';

import { calculateScore, isPassing, type ScoringQuestion } from './scoring';

function questions(count: number): ScoringQuestion[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `q${index + 1}`,
    correctAnswerId: `q${index + 1}-correta`,
  }));
}

function respostas(total: number, acertos: number) {
  return Array.from({ length: total }, (_unused, index) => ({
    questionId: `q${index + 1}`,
    answerId: index < acertos ? `q${index + 1}-correta` : `q${index + 1}-errada`,
  }));
}

describe('calculateScore', () => {
  it.each([
    [3, 3, 100],
    [3, 2, 66.7],
    [3, 1, 33.3],
    [3, 0, 0],
    [4, 3, 75],
    [10, 7, 70],
  ])('%i perguntas com %i acertos → %f', (total, acertos, score) => {
    expect(calculateScore(questions(total), respostas(total, acertos))).toEqual({
      correctCount: acertos,
      totalQuestions: total,
      score,
    });
  });

  // Avaliação sem perguntas não pode virar divisão por zero.
  it('devolve 0 sem perguntas', () => {
    expect(calculateScore([], [])).toEqual({ correctCount: 0, totalQuestions: 0, score: 0 });
  });

  it('pergunta sem resposta enviada conta como erro', () => {
    expect(calculateScore(questions(2), [{ questionId: 'q1', answerId: 'q1-correta' }])).toEqual({
      correctCount: 1,
      totalQuestions: 2,
      score: 50,
    });
  });

  it('ignora resposta de pergunta que não está na avaliação', () => {
    const result = calculateScore(questions(2), [
      { questionId: 'q1', answerId: 'q1-correta' },
      { questionId: 'q2', answerId: 'q2-correta' },
      { questionId: 'q99', answerId: 'q99-correta' },
    ]);

    expect(result).toEqual({ correctCount: 2, totalQuestions: 2, score: 100 });
  });

  it('ordem das respostas não altera o score', () => {
    const invertidas = respostas(3, 2).reverse();

    expect(calculateScore(questions(3), invertidas).score).toBe(66.7);
  });
});

describe('isPassing', () => {
  // Nota exata no limite aprova: a comparação é `>=`.
  it('score igual ao mínimo aprova', () => {
    expect(isPassing(70, 70)).toBe(true);
  });

  it('score um décimo abaixo do mínimo reprova', () => {
    expect(isPassing(69.9, 70)).toBe(false);
  });

  it('score acima do mínimo aprova', () => {
    expect(isPassing(100, 70)).toBe(true);
  });

  it('minScore 0 aprova qualquer nota', () => {
    expect(isPassing(0, 0)).toBe(true);
  });

  it('minScore 100 exige tudo certo', () => {
    expect(isPassing(99.9, 100)).toBe(false);
    expect(isPassing(100, 100)).toBe(true);
  });

  // 2 de 3 = 66.7, que reprova num mínimo de 70 — o caso que um arredondamento
  // para cima faria passar por engano.
  it('66.7 não aprova em minScore 70', () => {
    expect(isPassing(calculateScore(questions(3), respostas(3, 2)).score, 70)).toBe(false);
  });
});
