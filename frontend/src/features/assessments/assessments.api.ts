import { api } from '../../lib/api'
import type { EnrollmentStatus, Progress } from '../enrollments/enrollments.types'

/** Visão de quem responde: `isCorrect` não existe nesta resposta. */
export type CandidateAssessment = {
  id: string
  trainingId: string
  minScore: number
  maxAttempts: number
  questions: {
    id: string
    text: string
    position: number
    answers: { id: string; text: string }[]
  }[]
}

export type AttemptSummary = {
  id: string
  score: number
  passed: boolean
  createdAt: string
}

export type AttemptsOverview = {
  attempts: AttemptSummary[]
  attemptsUsed: number
  attemptsAllowed: number
  attemptsRemaining: number
  blocked: boolean
}

export type AttemptResult = {
  attempt: {
    id: string
    score: number
    passed: boolean
    correctCount: number
    totalQuestions: number
    createdAt: string
  }
  attemptsUsed: number
  attemptsAllowed: number
  attemptsRemaining: number
  enrollment: { id: string; status: EnrollmentStatus; progress: Progress }
}

export async function fetchAssessment(trainingId: string): Promise<CandidateAssessment> {
  const { data } = await api.get<CandidateAssessment>(`/trainings/${trainingId}/assessment`)

  return data
}

export async function fetchAttempts(enrollmentId: string): Promise<AttemptsOverview> {
  const { data } = await api.get<AttemptsOverview>(`/enrollments/${enrollmentId}/attempts`)

  return data
}

export type UnlockResult = {
  enrollmentId: string
  granted: number
  extraAttempts: number
  attemptsUsed: number
  attemptsAllowed: number
  attemptsRemaining: number
}

export async function unlockAttempts(
  enrollmentId: string,
  extraAttempts: number,
): Promise<UnlockResult> {
  const { data } = await api.post<UnlockResult>(
    `/enrollments/${enrollmentId}/attempts/unlock`,
    { extraAttempts },
  )

  return data
}

export async function submitAttempt(
  enrollmentId: string,
  answers: { questionId: string; answerId: string }[],
): Promise<AttemptResult> {
  const { data } = await api.post<AttemptResult>(`/enrollments/${enrollmentId}/attempts`, {
    answers,
  })

  return data
}
