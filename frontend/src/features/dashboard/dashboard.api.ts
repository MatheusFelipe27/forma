import { api } from '../../lib/api'
import type { EnrollmentListItem } from '../enrollments/enrollments.types'

export type StatusTally = {
  total: number
  notStarted: number
  inProgress: number
  completed: number
  overdue: number
}

export type MyDashboard = {
  tally: StatusTally
  averageProgress: number
  needsAttention: EnrollmentListItem[]
}

export async function fetchMyDashboard(): Promise<MyDashboard> {
  const { data } = await api.get<MyDashboard>('/dashboard/me')

  return data
}
