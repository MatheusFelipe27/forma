import type { BadgeTone } from '../../components/Badge'
import type { EnrollmentStatus, Progress } from './enrollments.types'

const PRESENTATION: Record<EnrollmentStatus, { label: string; tone: BadgeTone }> = {
  NOT_STARTED: { label: 'Não iniciado', tone: 'neutral' },
  IN_PROGRESS: { label: 'Em andamento', tone: 'info' },
  COMPLETED: { label: 'Concluído', tone: 'success' },
  OVERDUE: { label: 'Atrasado', tone: 'danger' },
}

export function statusLabel(status: EnrollmentStatus): string {
  return PRESENTATION[status].label
}

export function statusTone(status: EnrollmentStatus): BadgeTone {
  return PRESENTATION[status].tone
}

type Trackable = { status: EnrollmentStatus; progress: Progress }

/**
 * Todos os módulos concluídos sem a matrícula ter fechado só acontece quando há
 * avaliação e ela ainda não foi aprovada — é assim que o backend deriva o
 * status. Nenhuma consulta extra: o estado já está no que a listagem recebe.
 */
export function isAwaitingAssessment({ status, progress }: Trackable): boolean {
  return (
    progress.totalModules > 0 &&
    progress.completedModules === progress.totalModules &&
    status !== 'COMPLETED'
  )
}

export type StatusChip = { label: string; tone: BadgeTone }

export function statusChips(item: Trackable): StatusChip[] {
  const awaiting = isAwaitingAssessment(item)

  if (awaiting && item.status === 'IN_PROGRESS') {
    return [{ label: 'Avaliação pendente', tone: 'warning' }]
  }

  const chips: StatusChip[] = [
    { label: statusLabel(item.status), tone: statusTone(item.status) },
  ]

  if (awaiting) {
    chips.push({ label: 'Avaliação pendente', tone: 'warning' })
  }

  return chips
}

export function progressCaption(item: Trackable): string {
  if (isAwaitingAssessment(item)) {
    return 'Módulos concluídos · falta a avaliação'
  }

  return `${String(item.progress.completedModules)} de ${String(item.progress.totalModules)} módulos`
}
