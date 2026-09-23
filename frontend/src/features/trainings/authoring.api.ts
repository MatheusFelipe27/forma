import { api } from '../../lib/api'

export type AuthorAnswer = { id: string; text: string; isCorrect: boolean }

export type AuthorQuestion = {
  id: string
  text: string
  position: number
  answers: AuthorAnswer[]
}

export type AuthorAssessment = {
  id: string
  trainingId: string
  minScore: number
  maxAttempts: number
  questions: AuthorQuestion[]
}

export type AnswerDraft = { text: string; isCorrect: boolean }

export async function fetchAuthorAssessment(trainingId: string): Promise<AuthorAssessment> {
  const { data } = await api.get<AuthorAssessment>(`/trainings/${trainingId}/assessment`)

  return data
}

export async function createAssessment(
  trainingId: string,
  input: { minScore: number; maxAttempts: number },
): Promise<void> {
  await api.post(`/trainings/${trainingId}/assessment`, input)
}

export async function deleteAssessment(trainingId: string): Promise<void> {
  await api.delete(`/trainings/${trainingId}/assessment`)
}

export async function createQuestion(
  trainingId: string,
  input: { text: string; answers: AnswerDraft[] },
): Promise<AuthorQuestion> {
  const { data } = await api.post<AuthorQuestion>(
    `/trainings/${trainingId}/assessment/questions`,
    input,
  )

  return data
}

export async function deleteQuestion(trainingId: string, questionId: string): Promise<void> {
  await api.delete(`/trainings/${trainingId}/assessment/questions/${questionId}`)
}
