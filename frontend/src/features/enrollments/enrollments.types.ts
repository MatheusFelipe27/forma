export type EnrollmentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE'

export type TrainingStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export type Progress = {
  completedModules: number
  totalModules: number
  percentage: number
}

export type EnrollmentListItem = {
  id: string
  user: { id: string; name: string; email: string }
  training: { id: string; title: string; category: string; status: TrainingStatus }
  status: EnrollmentStatus
  storedStatus: EnrollmentStatus
  dueDate: string | null
  createdAt: string
  progress: Progress
}

export type EnrollmentModule = {
  id: string
  title: string
  content: string
  duration: number
  position: number
  materialUrl: string | null
  completed: boolean
}

export type EnrollmentDetail = {
  id: string
  user: { id: string; name: string; email: string }
  training: {
    id: string
    title: string
    description: string
    category: string
    instructor: string
    estimatedDuration: number
    status: TrainingStatus
    hasAssessment: boolean
  }
  status: EnrollmentStatus
  storedStatus: EnrollmentStatus
  dueDate: string | null
  createdAt: string
  progress: Progress
  modules: EnrollmentModule[]
}

export type Paginated<T> = {
  data: T[]
  page: number
  limit: number
  total: number
}

export type CompleteModuleResult = {
  alreadyCompleted: boolean
  enrollment: { id: string; status: EnrollmentStatus; progress: Progress }
}
