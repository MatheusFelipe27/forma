import { CircleCheck } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../components/Button'
import { Card, CardBody, CardHeader } from '../components/Card'
import { Input } from '../components/Input'
import { Select } from '../components/Select'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/toast/use-toast'
import { fetchTeamDashboard } from '../features/dashboard/dashboard.api'
import {
  assignTraining,
  fetchPublishedTrainings,
  type AssignmentResult,
} from '../features/trainings/trainings.api'
import { useAsync } from '../hooks/use-async'
import { apiErrorMessage } from '../lib/api'

export function AssignPage() {
  const { show } = useToast()

  const trainings = useAsync(fetchPublishedTrainings)
  const team = useAsync(fetchTeamDashboard)

  const [trainingId, setTrainingId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<AssignmentResult | null>(null)

  const ready = trainings.data !== null && team.data !== null
  const error = trainings.error ?? team.error
  const members = team.data?.members ?? []
  const canSubmit = trainingId !== '' && selected.length > 0

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setResult(null)

    try {
      const assignment = await assignTraining({
        trainingId,
        userIds: selected,
        dueDate: dueDate === '' ? null : new Date(dueDate).toISOString(),
      })

      setResult(assignment)
      setSelected([])

      show(
        'success',
        assignment.created > 0
          ? `${String(assignment.created)} matrícula(s) criada(s).`
          : 'Todos já tinham este treinamento.',
      )
    } catch (submitError) {
      show('error', apiErrorMessage(submitError, 'Não foi possível atribuir o treinamento.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Atribuir treinamento
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Escolha um treinamento publicado e as pessoas que devem fazê-lo.
        </p>
      </div>

      {!ready && error === null && <LoadingState label="Carregando dados..." />}

      {error !== null && !ready && (
        <Card>
          <ErrorState
            description={apiErrorMessage(error, 'Não foi possível carregar treinamentos e equipe.')}
            onRetry={() => {
              void trainings.reload()
              void team.reload()
            }}
          />
        </Card>
      )}

      {ready && result && <ResultPanel result={result} />}

      {ready && (
        <>
          <Card>
            <CardHeader title="Treinamento" description="Somente publicados aceitam matrícula." />
            <CardBody className="flex flex-col gap-4 sm:flex-row">
              <div className="flex-1">
                {trainings.data?.length === 0 ? (
                  <p className="text-sm text-neutral-500">
                    Nenhum treinamento publicado disponível.
                  </p>
                ) : (
                  <Select
                    label="Treinamento"
                    value={trainingId}
                    onChange={(event) => setTrainingId(event.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {trainings.data?.map((training) => (
                      <option key={training.id} value={training.id}>
                        {training.title} · {training.category}
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              <div className="sm:w-52">
                <Input
                  label="Prazo (opcional)"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Funcionários"
              description={`${String(selected.length)} de ${String(members.length)} selecionado(s).`}
              action={
                members.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSelected(
                        selected.length === members.length
                          ? []
                          : members.map((member) => member.id),
                      )
                    }
                  >
                    {selected.length === members.length ? 'Limpar' : 'Selecionar todos'}
                  </Button>
                ) : undefined
              }
            />

            {members.length === 0 ? (
              <EmptyState
                title="Nenhuma pessoa disponível"
                description="Funcionários aparecem aqui quando estão vinculados a você como gestor."
              />
            ) : (
              <ul className="divide-y divide-neutral-200">
                {members.map((member) => (
                  <li key={member.id}>
                    <label className="hover:bg-brand-50 flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors">
                      <input
                        type="checkbox"
                        checked={selected.includes(member.id)}
                        onChange={() => toggle(member.id)}
                        className="accent-brand-600 size-4 cursor-pointer"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-neutral-900">
                          {member.name}
                        </span>
                        <span className="block truncate text-xs text-neutral-500">
                          {member.email}
                          {member.team && ` · ${member.team}`}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="flex items-center gap-3">
            <Button
              loading={submitting}
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
            >
              Atribuir
            </Button>

            <p className="text-sm text-neutral-500">
              {canSubmit
                ? `${String(selected.length)} pessoa(s) receberão este treinamento.`
                : 'Escolha um treinamento e ao menos uma pessoa.'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function ResultPanel({ result }: { result: AssignmentResult }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-emerald-50 px-4 py-3.5 ring-1 ring-emerald-200 ring-inset">
      <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />

      <div>
        <p className="text-sm font-semibold text-emerald-900">Atribuição concluída</p>
        <p className="mt-0.5 text-sm text-emerald-800">
          {result.created} matrícula(s) criada(s) de {result.requested} solicitada(s).
          {result.skipped > 0 &&
            ` ${String(result.skipped)} pessoa(s) já tinham este treinamento e foram ignoradas.`}
        </p>
      </div>
    </div>
  )
}
