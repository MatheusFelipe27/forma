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

export type TrainingModule = {
  id: string
  trainingId: string
  title: string
  content: string
  duration: number
  position: number
  materialUrl: string | null
}

export type TrainingWithModules = Training & { modules: TrainingModule[] }

export type TrainingInput = {
  title: string
  description: string
  category: string
  instructor: string
  estimatedDuration: number
}

export type ModuleInput = {
  title: string
  content: string
  duration: number
  materialUrl: string | null
}

export async function fetchAllTrainings(): Promise<Training[]> {
  const { data } = await api.get<Paginated<Training>>('/trainings', { params: { limit: 100 } })

  return data.data
}

export async function fetchTraining(id: string): Promise<TrainingWithModules> {
  const { data } = await api.get<TrainingWithModules>(`/trainings/${id}`)

  return data
}

export async function createTraining(input: TrainingInput): Promise<Training> {
  const { data } = await api.post<Training>('/trainings', input)

  return data
}

export async function updateTraining(
  id: string,
  input: Partial<TrainingInput>,
): Promise<Training> {
  const { data } = await api.patch<Training>(`/trainings/${id}`, input)

  return data
}

export async function changeTrainingStatus(id: string, status: TrainingStatus): Promise<Training> {
  const { data } = await api.patch<Training>(`/trainings/${id}/status`, { status })

  return data
}

export async function createModule(trainingId: string, input: ModuleInput): Promise<TrainingModule> {
  const { data } = await api.post<TrainingModule>(`/trainings/${trainingId}/modules`, input)

  return data
}

export async function updateModule(
  trainingId: string,
  moduleId: string,
  input: Partial<ModuleInput>,
): Promise<TrainingModule> {
  const { data } = await api.patch<TrainingModule>(
    `/trainings/${trainingId}/modules/${moduleId}`,
    input,
  )

  return data
}

export async function deleteModule(trainingId: string, moduleId: string): Promise<void> {
  await api.delete(`/trainings/${trainingId}/modules/${moduleId}`)
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
