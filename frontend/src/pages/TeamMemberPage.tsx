import { ArrowLeft, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Card, CardHeader } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/toast/use-toast'
import { fetchAttempts, unlockAttempts } from '../features/assessments/assessments.api'
import { fetchTeamDashboard } from '../features/dashboard/dashboard.api'
import { fetchEnrollmentsForUser } from '../features/enrollments/enrollments.api'
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

export function TeamMemberPage() {
  const { userId = '' } = useParams<{ userId: string }>()

  const team = useAsync(fetchTeamDashboard)
  const enrollments = useAsync(() => fetchEnrollmentsForUser(userId), [userId])

  const member = team.data?.members.find((item) => item.id === userId) ?? null
  const ready = enrollments.data !== null
  const error = enrollments.error ?? team.error

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={PATHS.team}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Equipe
      </Link>

      {!ready && error === null && <LoadingState label="Carregando matrículas..." />}

      {error !== null && !ready && (
        <Card>
          <ErrorState
            description={apiErrorMessage(error, 'Não foi possível carregar este funcionário.')}
            onRetry={() => {
              void team.reload()
              void enrollments.reload()
            }}
          />
        </Card>
      )}

      {ready && (
        <>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
              {member?.name ?? enrollments.data?.data.at(0)?.user.name ?? 'Funcionário'}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {member?.email ?? enrollments.data?.data.at(0)?.user.email ?? ''}
              {member?.team && ` · ${member.team}`}
            </p>
          </div>

          <Card>
            <CardHeader
              title="Matrículas"
              description="Libere tentativas quando a avaliação estiver bloqueada."
            />

            {enrollments.data?.data.length === 0 ? (
              <EmptyState
                title="Nenhum treinamento atribuído"
                description="Use a tela de Atribuir para designar um treinamento a esta pessoa."
              />
            ) : (
              <ul className="divide-y divide-neutral-200">
                {enrollments.data?.data.map((item) => (
                  <EnrollmentRow
                    key={item.id}
                    item={item}
                    onUnlocked={() => void enrollments.reload()}
                  />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function EnrollmentRow({
  item,
  onUnlocked,
}: {
  item: EnrollmentListItem
  onUnlocked: () => void
}) {
  const awaiting = isAwaitingAssessment(item)
  const due = formatDate(item.dueDate)

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
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
        </div>

        <div className="sm:w-48">
          <ProgressBar
            percentage={item.progress.percentage}
            tone={awaiting ? 'warning' : undefined}
          />
        </div>
      </div>

      {/* Só quem terminou os módulos sem fechar a matrícula pode estar bloqueado. */}
      {awaiting && <AttemptsPanel enrollmentId={item.id} onUnlocked={onUnlocked} />}
    </li>
  )
}

function AttemptsPanel({
  enrollmentId,
  onUnlocked,
}: {
  enrollmentId: string
  onUnlocked: () => void
}) {
  const { show } = useToast()
  const { data, loading, reload } = useAsync(() => fetchAttempts(enrollmentId), [enrollmentId])
  const [unlocking, setUnlocking] = useState(false)

  const handleUnlock = async () => {
    setUnlocking(true)

    try {
      const result = await unlockAttempts(enrollmentId, 1)

      show(
        'success',
        `Tentativa liberada. Agora são ${String(result.attemptsRemaining)} restante(s).`,
      )

      await reload()
      onUnlocked()
    } catch (error) {
      show('error', apiErrorMessage(error, 'Não foi possível liberar a tentativa.'))
    } finally {
      setUnlocking(false)
    }
  }

  if (loading && data === null) {
    return <p className="mt-3 text-xs text-neutral-400">Verificando tentativas...</p>
  }

  if (data === null) {
    return null
  }

  if (!data.blocked) {
    return (
      <p className="mt-3 text-xs text-neutral-500">
        Avaliação pendente · {data.attemptsUsed} de {data.attemptsAllowed} tentativa(s) usadas
      </p>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-md bg-red-50 px-3.5 py-3 ring-1 ring-red-200 ring-inset sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-red-900">Tentativas esgotadas</p>
        <p className="mt-0.5 text-xs text-red-800">
          {data.attemptsUsed} de {data.attemptsAllowed} usadas, sem atingir a nota mínima.
        </p>
      </div>

      <Button variant="secondary" size="sm" loading={unlocking} onClick={() => void handleUnlock()}>
        <KeyRound className="size-4" aria-hidden="true" />
        Liberar tentativa
      </Button>
    </div>
  )
}
