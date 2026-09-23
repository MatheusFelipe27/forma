import { ServerOff } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Card, CardBody, CardHeader } from '../components/Card'
import { Select } from '../components/Select'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import {
  ACTION_LABEL,
  AUDIT_ACTIONS,
  fetchAuditLogs,
  type AuditFilters,
  type AuditLog,
} from '../features/audit/audit.api'
import { useAsync } from '../hooks/use-async'
import { apiErrorCode, apiErrorMessage } from '../lib/api'
import { formatDateTime } from '../lib/format'

export function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>({})
  const [page, setPage] = useState(1)

  const { data, loading, error, reload } = useAsync(
    () => fetchAuditLogs(filters, page),
    [filters.action, filters.resourceId, filters.userId, page],
  )

  const unavailable = apiErrorCode(error) === 'AUDIT_UNAVAILABLE'
  const hasFilters = Object.values(filters).some((value) => value !== undefined)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  const applyFilter = (next: AuditFilters) => {
    setPage(1)
    setFilters((current) => ({ ...current, ...next }))
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Auditoria</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Registro das ações administrativas: quem fez, o quê e quando.
        </p>
      </div>

      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="sm:w-72">
            <Select
              label="Ação"
              value={filters.action ?? ''}
              onChange={(event) =>
                applyFilter({
                  action: event.target.value === '' ? undefined : event.target.value,
                })
              }
            >
              <option value="">Todas as ações</option>
              {AUDIT_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABEL[action]}
                </option>
              ))}
            </Select>
          </div>

          {(filters.userId ?? filters.resourceId) !== undefined && (
            <div className="flex flex-wrap items-center gap-2 pb-1">
              {filters.userId !== undefined && <Badge tone="info">Filtrado por autor</Badge>}
              {filters.resourceId !== undefined && <Badge tone="info">Filtrado por recurso</Badge>}
            </div>
          )}

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="sm:mb-0.5"
              onClick={() => {
                setFilters({})
                setPage(1)
              }}
            >
              Limpar filtros
            </Button>
          )}
        </CardBody>
      </Card>

      <Card>
        {loading && data === null && <LoadingState label="Carregando registros..." />}

        {/* 503: o backend não conseguiu falar com o Mongo. Mostrar lista vazia
            aqui faria o Admin concluir que nada aconteceu. */}
        {unavailable && (
          <CardBody>
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <ServerOff className="size-6 text-amber-600" aria-hidden="true" />
              <p className="text-sm font-semibold text-neutral-900">Auditoria indisponível</p>
              <p className="max-w-sm text-sm text-neutral-500">
                O banco de auditoria não respondeu. Os registros existem, mas não podem ser
                consultados agora — isto não significa que nenhuma ação foi registrada.
              </p>
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => void reload()}>
                Tentar novamente
              </Button>
            </div>
          </CardBody>
        )}

        {error !== null && !unavailable && data === null && (
          <ErrorState
            description={apiErrorMessage(error, 'Não foi possível carregar os registros.')}
            onRetry={() => void reload()}
          />
        )}

        {data !== null && !unavailable && (
          <>
            <CardHeader
              title={`${String(data.total)} registro(s)`}
              description={hasFilters ? 'Resultado filtrado.' : 'Todas as ações registradas.'}
            />

            {data.data.length === 0 ? (
              <EmptyState
                title="Nenhum registro"
                description={
                  hasFilters
                    ? 'Nenhuma ação corresponde aos filtros aplicados.'
                    : 'Nenhuma ação auditável foi executada ainda.'
                }
              />
            ) : (
              <ul className="divide-y divide-neutral-200">
                {data.data.map((log) => (
                  <LogRow key={log.id} log={log} onFilter={applyFilter} />
                ))}
              </ul>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Anterior
                </Button>

                <span className="text-sm text-neutral-500">
                  Página {page} de {totalPages}
                </span>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Próxima
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

function LogRow({
  log,
  onFilter,
}: {
  log: AuditLog
  onFilter: (next: AuditFilters) => void
}) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{ACTION_LABEL[log.action] ?? log.action}</Badge>
        <span className="text-xs text-neutral-400">{formatDateTime(log.createdAt)}</span>
      </div>

      <p className="mt-1.5 text-sm text-neutral-800">{log.description}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        {/* Os filtros da API são por id; clicar poupa o Admin de copiar uuid. */}
        <button
          type="button"
          onClick={() => onFilter({ userId: log.userId })}
          className="cursor-pointer font-medium text-neutral-700 hover:underline"
        >
          {log.userName}
        </button>

        <button
          type="button"
          onClick={() => onFilter({ resourceId: log.resourceId })}
          className="cursor-pointer hover:underline"
        >
          {log.resourceType} · {log.resourceId.slice(0, 8)}
        </button>
      </div>
    </li>
  )
}
