import { api } from '../../lib/api'
import type {
  CompleteModuleResult,
  EnrollmentDetail,
  EnrollmentListItem,
  Paginated,
} from './enrollments.types'

export async function fetchMyEnrollments(): Promise<Paginated<EnrollmentListItem>> {
  const { data } = await api.get<Paginated<EnrollmentListItem>>('/enrollments', {
    params: { limit: 100 },
  })

  return data
}

export async function fetchEnrollment(id: string): Promise<EnrollmentDetail> {
  const { data } = await api.get<EnrollmentDetail>(`/enrollments/${id}`)

  return data
}

export async function completeModule(
  enrollmentId: string,
  moduleId: string,
): Promise<CompleteModuleResult> {
  const { data } = await api.post<CompleteModuleResult>(
    `/enrollments/${enrollmentId}/modules/${moduleId}/complete`,
  )

  return data
}
