import { api } from '../../lib/api'
import type { Paginated } from '../enrollments/enrollments.types'

export const AUDIT_ACTIONS = [
  'ASSIGN_TRAINING',
  'PUBLISH_TRAINING',
  'ARCHIVE_TRAINING',
  'UNLOCK_ATTEMPTS',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const ACTION_LABEL: Record<AuditAction, string> = {
  ASSIGN_TRAINING: 'Atribuição de treinamento',
  PUBLISH_TRAINING: 'Publicação de treinamento',
  ARCHIVE_TRAINING: 'Arquivamento de treinamento',
  UNLOCK_ATTEMPTS: 'Liberação de tentativas',
}

export type AuditLog = {
  id: string
  userId: string
  userName: string
  action: AuditAction
  resourceType: string
  resourceId: string
  description: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export type AuditFilters = {
  action?: string | undefined
  resourceId?: string | undefined
  userId?: string | undefined
}

export async function fetchAuditLogs(
  filters: AuditFilters,
  page: number,
): Promise<Paginated<AuditLog>> {
  const { data } = await api.get<Paginated<AuditLog>>('/audit-logs', {
    params: { ...filters, page, limit: 20 },
  })

  return data
}
