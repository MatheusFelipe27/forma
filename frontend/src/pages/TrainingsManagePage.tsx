import { ChevronRight, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Card, CardHeader } from '../components/Card'
import { CLICKABLE_ROW } from '../components/interactive'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { fetchAllTrainings, type Training } from '../features/trainings/trainings.api'
import {
  trainingStatusLabel,
  trainingStatusTone,
} from '../features/trainings/training-status'
import { useAsync } from '../hooks/use-async'
import { apiErrorMessage } from '../lib/api'
import { formatDuration } from '../lib/format'
import { PATHS, trainingManagePath } from '../routes/navigation'

export function TrainingsManagePage() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useAsync(fetchAllTrainings)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Gerenciar Treinamentos
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Crie, edite e publique treinamentos.
          </p>
        </div>

        <Button onClick={() => void navigate(PATHS.trainingNew)}>
          <Plus className="size-4" aria-hidden="true" />
          Novo treinamento
        </Button>
      </div>

      <Card>
        {loading && data === null && <LoadingState label="Carregando treinamentos..." />}

        {error !== null && data === null && (
          <ErrorState
            description={apiErrorMessage(error, 'Não foi possível carregar os treinamentos.')}
            onRetry={() => void reload()}
          />
        )}

        {data !== null && data.length === 0 && (
          <EmptyState
            title="Nenhum treinamento criado"
            description="Comece criando um rascunho e adicionando os módulos."
          />
        )}

        {data !== null && data.length > 0 && (
          <>
            <CardHeader
              title={`${String(data.length)} treinamento(s)`}
              description="Rascunhos, publicados e arquivados."
            />

            <ul className="divide-y divide-neutral-200">
              {data.map((training) => (
                <TrainingRow key={training.id} training={training} />
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}

function TrainingRow({ training }: { training: Training }) {
  return (
    <li>
      <Link
        to={trainingManagePath(training.id)}
        className={`flex items-center gap-4 px-5 py-4 ${CLICKABLE_ROW}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-neutral-900">{training.title}</p>
            <Badge tone={trainingStatusTone(training.status)}>
              {trainingStatusLabel(training.status)}
            </Badge>
          </div>

          <p className="mt-0.5 truncate text-xs text-neutral-500">
            {training.category} · {training.instructor} ·{' '}
            {formatDuration(training.estimatedDuration)}
          </p>
        </div>

        <ChevronRight className="size-4 shrink-0 text-neutral-400" aria-hidden="true" />
      </Link>
    </li>
  )
}
