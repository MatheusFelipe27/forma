import { ArrowLeft, Check, ChevronDown, CircleCheck, FileText } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Card, CardBody, CardHeader } from '../components/Card'
import { CLICKABLE_ROW } from '../components/interactive'
import { ProgressBar } from '../components/ProgressBar'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/toast/use-toast'
import { AssessmentSection } from '../features/assessments/AssessmentSection'
import { completeModule, fetchEnrollment } from '../features/enrollments/enrollments.api'
import type { EnrollmentDetail, EnrollmentModule } from '../features/enrollments/enrollments.types'
import { isAwaitingAssessment, statusChips } from '../features/enrollments/status'
import { useAsync } from '../hooks/use-async'
import { apiErrorMessage } from '../lib/api'
import { formatDate, formatDuration } from '../lib/format'
import { PATHS } from '../routes/navigation'

export function EnrollmentDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { data, loading, error, reload } = useAsync(() => fetchEnrollment(id), [id])

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={PATHS.myTrainings}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Meus Treinamentos
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

      {data !== null && <EnrollmentContent enrollment={data} onChanged={() => void reload()} />}
    </div>
  )
}

function EnrollmentContent({
  enrollment,
  onChanged,
}: {
  enrollment: EnrollmentDetail
  onChanged: () => void
}) {
  const due = formatDate(enrollment.dueDate)
  const allModulesDone = enrollment.progress.completedModules === enrollment.progress.totalModules
  const awaitingAssessment = isAwaitingAssessment(enrollment)

  const firstPending = enrollment.modules.find((module) => !module.completed)
  const [openId, setOpenId] = useState<string | null>(
    firstPending?.id ?? enrollment.modules.at(0)?.id ?? null,
  )

  return (
    <>
      {enrollment.status === 'COMPLETED' && (
        <div className="flex items-start gap-3 rounded-lg bg-emerald-50 px-4 py-3.5 ring-1 ring-emerald-200 ring-inset">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">Treinamento concluído</p>
            <p className="mt-0.5 text-sm text-emerald-800">
              Você concluiu todos os módulos
              {enrollment.training.hasAssessment && ' e foi aprovado na avaliação'}.
            </p>
          </div>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            {enrollment.training.title}
          </h1>
          {statusChips(enrollment).map((chip) => (
            <Badge key={chip.label} tone={chip.tone}>
              {chip.label}
            </Badge>
          ))}
        </div>

        <p className="mt-2 text-sm text-neutral-600">{enrollment.training.description}</p>

        <p className="mt-2 text-xs text-neutral-500">
          {enrollment.training.category} · {enrollment.training.instructor} ·{' '}
          {formatDuration(enrollment.training.estimatedDuration)}
          {due && ` · prazo ${due}`}
        </p>
      </div>

      <Card>
        <CardBody>
          <ProgressBar
            percentage={enrollment.progress.percentage}
            tone={awaitingAssessment ? 'warning' : undefined}
            label={`${String(enrollment.progress.completedModules)} de ${String(enrollment.progress.totalModules)} módulos concluídos`}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Módulos" description="Conclua na ordem que preferir." />
        <ul className="divide-y divide-neutral-200">
          {enrollment.modules.map((module) => (
            <ModuleRow
              key={module.id}
              enrollmentId={enrollment.id}
              module={module}
              open={openId === module.id}
              onToggle={() => setOpenId(openId === module.id ? null : module.id)}
              onCompleted={onChanged}
            />
          ))}
        </ul>
      </Card>

      {enrollment.training.hasAssessment && (
        <AssessmentSection
          enrollmentId={enrollment.id}
          trainingId={enrollment.training.id}
          unlocked={allModulesDone}
          alreadyCompleted={enrollment.status === 'COMPLETED'}
          onFinished={onChanged}
        />
      )}
    </>
  )
}

function ModuleRow({
  enrollmentId,
  module,
  open,
  onToggle,
  onCompleted,
}: {
  enrollmentId: string
  module: EnrollmentModule
  open: boolean
  onToggle: () => void
  onCompleted: () => void
}) {
  const { show } = useToast()
  const [saving, setSaving] = useState(false)

  const handleComplete = async () => {
    setSaving(true)

    try {
      const result = await completeModule(enrollmentId, module.id)

      show(
        result.alreadyCompleted ? 'info' : 'success',
        result.alreadyCompleted
          ? 'Este módulo já estava concluído.'
          : `Módulo "${module.title}" concluído.`,
      )

      onCompleted()
    } catch (error) {
      show('error', apiErrorMessage(error, 'Não foi possível concluir o módulo.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left ${CLICKABLE_ROW}`}
      >
        <span
          aria-hidden="true"
          className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
            module.completed
              ? 'bg-emerald-600 text-white'
              : 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200 ring-inset'
          }`}
        >
          {module.completed ? <Check className="size-3.5" /> : module.position}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-900">
            {module.title}
          </span>
          <span className="block text-xs text-neutral-500">
            {formatDuration(module.duration)}
            {module.completed && ' · concluído'}
          </span>
        </span>

        <ChevronDown
          className={`size-4 shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-neutral-100 bg-neutral-50/60 px-5 py-4">
          <p className="text-sm leading-relaxed whitespace-pre-line text-neutral-700">
            {module.content}
          </p>

          {module.materialUrl && (
            <a
              href={module.materialUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand-700 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            >
              <FileText className="size-4" aria-hidden="true" />
              Material de apoio
            </a>
          )}

          {!module.completed && (
            <div>
              <Button loading={saving} onClick={() => void handleComplete()}>
                Concluir módulo
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
