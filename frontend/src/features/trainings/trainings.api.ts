import { api } from '../../lib/api'
import type { Paginated, TrainingStatus } from '../enrollments/enrollments.types'

export type Training = {
  id: string
  title: string
  description: string
  category: string
  instructor: string
  estimatedDuration: number
  status: TrainingStatus
  createdById: string
  createdAt: string
}

export async function fetchPublishedTrainings(): Promise<Training[]> {
  const { data } = await api.get<Paginated<Training>>('/trainings', {
    params: { status: 'PUBLISHED', limit: 100 },
  })

  return data.data
}

export type AssignmentResult = {
  requested: number
  created: number
  skipped: number
}

export async function assignTraining(input: {
  trainingId: string
  userIds: string[]
  dueDate: string | null
}): Promise<AssignmentResult> {
  const { data } = await api.post<AssignmentResult>('/assignments', input)

  return data
}
