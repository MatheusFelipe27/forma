import { ArrowLeft, Info } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Card, CardBody, CardHeader } from '../components/Card'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/toast/use-toast'
import type { TrainingStatus } from '../features/enrollments/enrollments.types'
import { AssessmentAuthoring } from '../features/trainings/AssessmentAuthoring'
import { ModulesSection } from '../features/trainings/ModulesSection'
import {
  allowedTransitions,
  trainingStatusLabel,
  trainingStatusTone,
  transitionLabel,
} from '../features/trainings/training-status'
import { TrainingForm } from '../features/trainings/TrainingForm'
import {
  changeTrainingStatus,
  fetchTraining,
  updateTraining,
  type TrainingWithModules,
} from '../features/trainings/trainings.api'
import { useAsync } from '../hooks/use-async'
import { apiErrorMessage } from '../lib/api'
import { formatDuration } from '../lib/format'
import { PATHS } from '../routes/navigation'

export function TrainingEditPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { data, loading, error, reload } = useAsync(() => fetchTraining(id), [id])

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={PATHS.trainings}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Gerenciar Treinamentos
      </Link>

      {loading && data === null && <LoadingState label="Carregando treinamento..." />}

      {error !== null && data === null && (
        <Card>
          <ErrorState
            description={apiErrorMessage(error, 'Não foi possível carregar este treinamento.')}
            onRetry={() => void reload()}
          />
        </Card>
      )}

      {data !== null && <TrainingEditor training={data} onChanged={() => void reload()} />}
    </div>
  )
}

function TrainingEditor({
  training,
  onChanged,
}: {
  training: TrainingWithModules
  onChanged: () => void
}) {
  const { show } = useToast()
  const [editing, setEditing] = useState(false)
  const [changingTo, setChangingTo] = useState<TrainingStatus | null>(null)

  const editable = training.status === 'DRAFT'
  const noModules = training.modules.length === 0

  const handleStatus = async (status: TrainingStatus) => {
    setChangingTo(status)

    try {
      await changeTrainingStatus(training.id, status)

      show(
        'success',
        status === 'PUBLISHED' ? 'Treinamento publicado.' : 'Treinamento arquivado.',
      )

      onChanged()
    } catch (error) {
      // O backend recusa com 409 (sem módulos, avaliação vazia, transição
      // inválida). A mensagem dele é específica, então é a que aparece.
      show('error', apiErrorMessage(error, 'Não foi possível alterar o status.'))
    } finally {
      setChangingTo(null)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
              {training.title}
            </h1>
            <Badge tone={trainingStatusTone(training.status)}>
              {trainingStatusLabel(training.status)}
            </Badge>
          </div>

          <p className="mt-1 text-sm text-neutral-500">
            {training.category} · {training.instructor} ·{' '}
            {formatDuration(training.estimatedDuration)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allowedTransitions(training.status).map((status) => (
            <Button
              key={status}
              variant={status === 'PUBLISHED' ? 'primary' : 'secondary'}
              loading={changingTo === status}
              disabled={status === 'PUBLISHED' && noModules}
              onClick={() => void handleStatus(status)}
            >
              {transitionLabel(status)}
            </Button>
          ))}
        </div>
      </div>

      {editable && noModules && (
        <div className="flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3 ring-1 ring-amber-200 ring-inset">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-sm text-amber-900">
            Adicione ao menos um módulo para poder publicar. Se criar uma avaliação, ela também
            precisa ter perguntas.
          </p>
        </div>
      )}

      {!editable && (
        <div className="flex items-start gap-3 rounded-lg bg-neutral-100 px-4 py-3 ring-1 ring-neutral-200 ring-inset">
          <Info className="mt-0.5 size-4 shrink-0 text-neutral-500" aria-hidden="true" />
          <p className="text-sm text-neutral-700">
            Treinamentos {trainingStatusLabel(training.status).toLowerCase()}s não podem ser
            editados — há matrículas que dependem deste conteúdo. Arquive e crie uma nova versão
            se precisar alterar.
          </p>
        </div>
      )}

      <Card>
        <CardHeader
          title="Dados do treinamento"
          action={
            editable && !editing ? (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Editar
              </Button>
            ) : undefined
          }
        />

        <CardBody>
          {editing ? (
            <TrainingForm
              initial={{
                title: training.title,
                description: training.description,
                category: training.category,
                instructor: training.instructor,
                estimatedDuration: training.estimatedDuration,
              }}
              submitLabel="Salvar alterações"
              onCancel={() => setEditing(false)}
              onSubmit={async (input) => {
                try {
                  await updateTraining(training.id, input)
                  setEditing(false)
                  show('success', 'Treinamento atualizado.')
                  onChanged()
                } catch (error) {
                  show('error', apiErrorMessage(error, 'Não foi possível salvar as alterações.'))
                }
              }}
            />
          ) : (
            <p className="text-sm whitespace-pre-line text-neutral-700">{training.description}</p>
          )}
        </CardBody>
      </Card>

      <ModulesSection
        trainingId={training.id}
        modules={training.modules}
        editable={editable}
        onChanged={onChanged}
      />

      <AssessmentAuthoring trainingId={training.id} editable={editable} />
    </>
  )
}
