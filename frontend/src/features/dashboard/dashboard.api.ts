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

export type TeamMember = {
  id: string
  name: string
  email: string
  team: string | null
  tally: StatusTally
  averageProgress: number
}

export type TeamDashboard = {
  teamSize: number
  tally: StatusTally
  averageProgress: number
  members: TeamMember[]
}

export async function fetchTeamDashboard(): Promise<TeamDashboard> {
  const { data } = await api.get<TeamDashboard>('/dashboard/team')

  return data
}
