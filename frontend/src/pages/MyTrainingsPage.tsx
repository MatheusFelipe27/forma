import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '../components/Badge'
import { Card } from '../components/Card'
import { CLICKABLE_ROW } from '../components/interactive'
import { ProgressBar } from '../components/ProgressBar'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { fetchMyEnrollments } from '../features/enrollments/enrollments.api'
import type { EnrollmentListItem } from '../features/enrollments/enrollments.types'
import {
  isAwaitingAssessment,
  progressCaption,
  statusChips,
} from '../features/enrollments/status'
import { useAsync } from '../hooks/use-async'
import { apiErrorMessage } from '../lib/api'
import { formatDate } from '../lib/format'
import { PATHS } from '../routes/navigation'

export function MyTrainingsPage() {
  const { data, loading, error, reload } = useAsync(fetchMyEnrollments)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Meus Treinamentos
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {data ? `${String(data.total)} matrícula(s)` : 'Treinamentos atribuídos a você.'}
        </p>
      </div>

      <Card>
        {loading && data === null && <LoadingState label="Carregando seus treinamentos..." />}

        {error !== null && data === null && (
          <ErrorState
            description={apiErrorMessage(error, 'Não foi possível carregar suas matrículas.')}
            onRetry={() => void reload()}
          />
        )}

        {data !== null && data.data.length === 0 && (
          <EmptyState
            title="Nenhum treinamento atribuído"
            description="Quando um gestor atribuir um treinamento a você, ele aparece aqui."
          />
        )}

        {data !== null && data.data.length > 0 && (
          <ul className="divide-y divide-neutral-200">
            {data.data.map((item) => (
              <EnrollmentRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function EnrollmentRow({ item }: { item: EnrollmentListItem }) {
  const due = formatDate(item.dueDate)
  const awaiting = isAwaitingAssessment(item)

  return (
    <li>
      <Link
        to={`${PATHS.myTrainings}/${item.id}`}
        className={`flex items-center gap-4 px-5 py-4 ${CLICKABLE_ROW}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-neutral-900">{item.training.title}</p>
            {statusChips(item).map((chip) => (
              <Badge key={chip.label} tone={chip.tone}>
                {chip.label}
              </Badge>
            ))}
          </div>

          <p className="mt-0.5 text-xs text-neutral-500">
            {item.training.category}
            {due && ` · prazo ${due}`}
            {` · ${progressCaption(item)}`}
          </p>

          <div className="mt-2.5 max-w-sm">
            <ProgressBar
              percentage={item.progress.percentage}
              tone={awaiting ? 'warning' : undefined}
            />
          </div>
        </div>

        <ChevronRight className="size-4 shrink-0 text-neutral-400" aria-hidden="true" />
      </Link>
    </li>
  )
}
