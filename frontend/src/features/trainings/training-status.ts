import type { BadgeTone } from '../../components/Badge'
import type { TrainingStatus } from '../enrollments/enrollments.types'

const PRESENTATION: Record<TrainingStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  PUBLISHED: { label: 'Publicado', tone: 'success' },
  ARCHIVED: { label: 'Arquivado', tone: 'warning' },
}

export function trainingStatusLabel(status: TrainingStatus): string {
  return PRESENTATION[status].label
}

export function trainingStatusTone(status: TrainingStatus): BadgeTone {
  return PRESENTATION[status].tone
}

/** Espelha a máquina de estados do backend: publicado nunca volta a rascunho. */
const TRANSITIONS: Record<TrainingStatus, TrainingStatus[]> = {
  DRAFT: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['PUBLISHED'],
}

export function allowedTransitions(status: TrainingStatus): TrainingStatus[] {
  return TRANSITIONS[status]
}

export function transitionLabel(status: TrainingStatus): string {
  return status === 'PUBLISHED' ? 'Publicar' : 'Arquivar'
}
