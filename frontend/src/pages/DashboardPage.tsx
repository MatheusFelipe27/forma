import { Link } from 'react-router-dom'

import { useAuth } from '../auth/use-auth'
import { Badge } from '../components/Badge'
import { Card, CardBody, CardHeader } from '../components/Card'
import { CLICKABLE_ROW } from '../components/interactive'
import { ProgressBar } from '../components/ProgressBar'
import { StatCard } from '../components/StatCard'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { fetchMyDashboard } from '../features/dashboard/dashboard.api'
import type { EnrollmentListItem } from '../features/enrollments/enrollments.types'
import { isAwaitingAssessment, statusChips } from '../features/enrollments/status'
import { useAsync } from '../hooks/use-async'
import { apiErrorMessage } from '../lib/api'
import { formatDate } from '../lib/format'
import { PATHS } from '../routes/navigation'

export function DashboardPage() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useAsync(fetchMyDashboard)

  const firstName = user?.name.split(' ').at(0) ?? ''

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Olá, {firstName}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Acompanhe seus treinamentos e o que precisa de atenção.
        </p>
      </div>

      {loading && data === null && <LoadingState label="Carregando seu painel..." />}

      {error !== null && data === null && (
        <Card>
          <ErrorState
            description={apiErrorMessage(error, 'Não foi possível carregar seu painel.')}
            onRetry={() => void reload()}
          />
        </Card>
      )}

      {data !== null && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total" value={data.tally.total} />
            <StatCard label="Em andamento" value={data.tally.inProgress} tone="info" />
            <StatCard label="Concluídos" value={data.tally.completed} tone="success" />
            <StatCard label="Atrasados" value={data.tally.overdue} tone="danger" />
          </div>

          <Card>
            <CardHeader
              title="Progresso médio"
              description="Média entre todos os treinamentos atribuídos a você."
            />
            <CardBody>
              <ProgressBar percentage={data.averageProgress} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Precisa de atenção"
              description="Atrasados primeiro, depois os que já começaram."
              action={
                data.tally.total > 0 ? (
                  <Link
                    to={PATHS.myTrainings}
                    className="text-brand-700 text-sm font-medium hover:underline"
                  >
                    Ver todos
                  </Link>
                ) : undefined
              }
            />

            {data.needsAttention.length === 0 ? (
              <EmptyState
                title={data.tally.total === 0 ? 'Nenhum treinamento atribuído' : 'Tudo em dia'}
                description={
                  data.tally.total === 0
                    ? 'Quando um gestor atribuir um treinamento a você, ele aparece aqui.'
                    : 'Você não tem treinamentos atrasados ou pendentes no momento.'
                }
              />
            ) : (
              <ul className="divide-y divide-neutral-200">
                {data.needsAttention.map((item) => (
                  <AttentionRow key={item.id} item={item} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function AttentionRow({ item }: { item: EnrollmentListItem }) {
  const due = formatDate(item.dueDate)
  const awaiting = isAwaitingAssessment(item)

  return (
    <li>
      <Link
        to={`${PATHS.myTrainings}/${item.id}`}
        className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${CLICKABLE_ROW}`}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-900">{item.training.title}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {item.training.category}
            {due && ` · prazo ${due}`}
            {awaiting && ' · falta a avaliação'}
          </p>
        </div>

        <div className="flex items-center gap-4 sm:w-72">
          <div className="flex-1">
            <ProgressBar
              percentage={item.progress.percentage}
              tone={awaiting ? 'warning' : undefined}
            />
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {statusChips(item).map((chip) => (
              <Badge key={chip.label} tone={chip.tone}>
                {chip.label}
              </Badge>
            ))}
          </div>
        </div>
      </Link>
    </li>
  )
}
