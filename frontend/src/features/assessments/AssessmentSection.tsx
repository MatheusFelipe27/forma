import { Lock } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card, CardBody, CardHeader } from '../../components/Card'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { useToast } from '../../components/toast/use-toast'
import { useAsync } from '../../hooks/use-async'
import { apiErrorCode, apiErrorMessage } from '../../lib/api'
import { formatDate } from '../../lib/format'
import {
  fetchAssessment,
  fetchAttempts,
  submitAttempt,
  type AttemptResult,
} from './assessments.api'

type Props = {
  enrollmentId: string
  trainingId: string
  unlocked: boolean
  alreadyCompleted: boolean
  onFinished: () => void
}

export function AssessmentSection({
  enrollmentId,
  trainingId,
  unlocked,
  alreadyCompleted,
  onFinished,
}: Props) {
  if (!unlocked) {
    return (
      <Card>
        <CardHeader title="Avaliação" description="Liberada após concluir todos os módulos." />
        <CardBody>
          <div className="flex items-center gap-3 text-sm text-neutral-500">
            <Lock className="size-4 shrink-0" aria-hidden="true" />
            Conclua todos os módulos para liberar a avaliação.
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <UnlockedAssessment
      enrollmentId={enrollmentId}
      trainingId={trainingId}
      alreadyCompleted={alreadyCompleted}
      onFinished={onFinished}
    />
  )
}

function UnlockedAssessment({
  enrollmentId,
  trainingId,
  alreadyCompleted,
  onFinished,
}: Omit<Props, 'unlocked'>) {
  const { show } = useToast()

  const assessment = useAsync(() => fetchAssessment(trainingId), [trainingId])
  const attempts = useAsync(() => fetchAttempts(enrollmentId), [enrollmentId])

  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)

  const ready = assessment.data !== null && attempts.data !== null
  const loading = (assessment.loading || attempts.loading) && !ready
  const error = assessment.error ?? attempts.error

  const questions = assessment.data?.questions ?? []
  const answeredCount = questions.filter((question) => answers[question.id]).length
  const allAnswered = questions.length > 0 && answeredCount === questions.length

  const passed = alreadyCompleted || (attempts.data?.attempts.some((item) => item.passed) ?? false)
  const blocked = blockedMessage !== null || (attempts.data?.blocked ?? false)

  const handleSubmit = async () => {
    setSubmitting(true)

    try {
      const payload = questions.map((question) => ({
        questionId: question.id,
        answerId: answers[question.id] ?? '',
      }))

      const submitted = await submitAttempt(enrollmentId, payload)

      setResult(submitted)
      setAnswers({})
      await attempts.reload()

      show(
        submitted.attempt.passed ? 'success' : 'error',
        submitted.attempt.passed
          ? `Aprovado com ${String(submitted.attempt.score)}%.`
          : `Nota ${String(submitted.attempt.score)}%. Abaixo do mínimo.`,
      )

      onFinished()
    } catch (submitError) {
      // 403 = tentativas esgotadas: o backend é a autoridade, a tela só reflete.
      if (apiErrorCode(submitError) === 'ATTEMPTS_EXHAUSTED') {
        setBlockedMessage(
          apiErrorMessage(submitError, 'Tentativas esgotadas para esta avaliação.'),
        )
        await attempts.reload()
      }

      show('error', apiErrorMessage(submitError, 'Não foi possível enviar a avaliação.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Avaliação"
        description={
          assessment.data
            ? `Nota mínima ${String(assessment.data.minScore)}% · ${String(assessment.data.maxAttempts)} tentativa(s) por padrão`
            : 'Avaliação do treinamento.'
        }
        action={
          attempts.data ? (
            <Badge tone={attempts.data.attemptsRemaining > 0 ? 'neutral' : 'danger'}>
              {String(attempts.data.attemptsRemaining)} de{' '}
              {String(attempts.data.attemptsAllowed)} restantes
            </Badge>
          ) : undefined
        }
      />

      {loading && <LoadingState label="Carregando avaliação..." />}

      {error !== null && !ready && (
        <ErrorState
          description={apiErrorMessage(error, 'Não foi possível carregar a avaliação.')}
          onRetry={() => {
            void assessment.reload()
            void attempts.reload()
          }}
        />
      )}

      {ready && (
        <CardBody className="flex flex-col gap-5">
          {result && <ResultPanel result={result} />}

          {attempts.data && attempts.data.attempts.length > 0 && (
            <AttemptHistory attempts={attempts.data.attempts} />
          )}

          {passed ? (
            <p className="text-sm text-emerald-800">
              Você já foi aprovado nesta avaliação. Não é necessário responder de novo.
            </p>
          ) : blocked ? (
            <div className="rounded-md bg-red-50 px-3.5 py-3 text-sm text-red-800 ring-1 ring-red-200 ring-inset">
              <p className="font-medium">Tentativas esgotadas</p>
              <p className="mt-0.5">
                {blockedMessage ??
                  'Você usou todas as tentativas sem atingir a nota mínima. Um gestor ou administrador precisa liberar novas tentativas.'}
              </p>
            </div>
          ) : questions.length === 0 ? (
            <EmptyState
              title="Avaliação sem perguntas"
              description="Esta avaliação ainda não foi finalizada por quem a criou."
            />
          ) : (
            <>
              <ol className="flex flex-col gap-6">
                {questions.map((question, index) => (
                  <li key={question.id}>
                    <fieldset>
                      <legend className="text-sm font-medium text-neutral-900">
                        {index + 1}. {question.text}
                      </legend>

                      <div className="mt-2.5 flex flex-col gap-2">
                        {question.answers.map((answer) => (
                          <label
                            key={answer.id}
                            className={`flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm ring-1 ring-inset transition-colors ${
                              answers[question.id] === answer.id
                                ? 'bg-brand-50 text-brand-900 ring-brand-300'
                                : 'ring-neutral-200 hover:bg-neutral-100'
                            }`}
                          >
                            <input
                              type="radio"
                              name={question.id}
                              value={answer.id}
                              checked={answers[question.id] === answer.id}
                              onChange={() =>
                                setAnswers((current) => ({
                                  ...current,
                                  [question.id]: answer.id,
                                }))
                              }
                              className="accent-brand-600 size-4 cursor-pointer"
                            />
                            {answer.text}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ol>

              <div className="flex items-center gap-3 border-t border-neutral-200 pt-4">
                <Button
                  loading={submitting}
                  disabled={!allAnswered}
                  onClick={() => void handleSubmit()}
                >
                  Enviar avaliação
                </Button>

                <p className="text-sm text-neutral-500">
                  {allAnswered
                    ? 'Todas as perguntas respondidas.'
                    : `${String(answeredCount)} de ${String(questions.length)} respondidas.`}
                </p>
              </div>
            </>
          )}
        </CardBody>
      )}
    </Card>
  )
}

function ResultPanel({ result }: { result: AttemptResult }) {
  const { attempt, attemptsRemaining } = result

  return (
    <div
      className={`rounded-md px-3.5 py-3 text-sm ring-1 ring-inset ${
        attempt.passed
          ? 'bg-emerald-50 text-emerald-900 ring-emerald-200'
          : 'bg-amber-50 text-amber-900 ring-amber-200'
      }`}
    >
      <p className="font-medium">
        {attempt.passed ? 'Aprovado' : 'Não atingiu a nota mínima'} — {String(attempt.score)}%
      </p>
      <p className="mt-0.5">
        {String(attempt.correctCount)} de {String(attempt.totalQuestions)} respostas corretas
        {!attempt.passed && ` · ${String(attemptsRemaining)} tentativa(s) restante(s)`}
      </p>
    </div>
  )
}

function AttemptHistory({
  attempts,
}: {
  attempts: { id: string; score: number; passed: boolean; createdAt: string }[]
}) {
  return (
    <div>
      <p className="text-xs font-medium text-neutral-500">Tentativas anteriores</p>

      <ul className="mt-2 flex flex-col gap-1.5">
        {attempts.map((attempt) => (
          <li key={attempt.id} className="flex items-center gap-2 text-sm text-neutral-600">
            <Badge tone={attempt.passed ? 'success' : 'neutral'}>
              {String(attempt.score)}%
            </Badge>
            <span className="text-xs text-neutral-500">
              {attempt.passed ? 'aprovado' : 'reprovado'}
              {formatDate(attempt.createdAt) && ` · ${formatDate(attempt.createdAt) ?? ''}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
