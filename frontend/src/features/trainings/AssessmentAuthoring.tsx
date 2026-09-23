import { Check, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card, CardBody, CardHeader } from '../../components/Card'
import { Input } from '../../components/Input'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { useToast } from '../../components/toast/use-toast'
import { useAsync } from '../../hooks/use-async'
import { apiErrorCode, apiErrorMessage } from '../../lib/api'
import {
  createAssessment,
  createQuestion,
  deleteAssessment,
  deleteQuestion,
  fetchAuthorAssessment,
  type AnswerDraft,
  type AuthorQuestion,
} from './authoring.api'

export function AssessmentAuthoring({
  trainingId,
  editable,
}: {
  trainingId: string
  editable: boolean
}) {
  const { show } = useToast()
  const { data, loading, error, reload } = useAsync(
    () => fetchAuthorAssessment(trainingId),
    [trainingId],
  )

  const [creating, setCreating] = useState(false)
  const [addingQuestion, setAddingQuestion] = useState(false)

  // 404 aqui significa "ainda não tem avaliação", que é estado normal.
  const missing = apiErrorCode(error) === 'ASSESSMENT_NOT_FOUND'

  if (loading && data === null && error === null) {
    return (
      <Card>
        <LoadingState label="Carregando avaliação..." />
      </Card>
    )
  }

  if (error !== null && !missing && data === null) {
    return (
      <Card>
        <ErrorState
          description={apiErrorMessage(error, 'Não foi possível carregar a avaliação.')}
          onRetry={() => void reload()}
        />
      </Card>
    )
  }

  if (missing || data === null) {
    return (
      <Card>
        <CardHeader
          title="Avaliação"
          description="Opcional. Sem avaliação, o treinamento conclui só com os módulos."
        />

        {creating ? (
          <CardBody>
            <AssessmentForm
              onCancel={() => setCreating(false)}
              onSubmit={async (input) => {
                await createAssessment(trainingId, input)
                setCreating(false)
                show('success', 'Avaliação criada. Agora adicione as perguntas.')
                await reload()
              }}
            />
          </CardBody>
        ) : (
          <EmptyState
            title="Sem avaliação"
            description="Adicione uma avaliação se a conclusão deve exigir aprovação."
            action={
              editable ? (
                <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                  <Plus className="size-4" aria-hidden="true" />
                  Criar avaliação
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title="Avaliação"
        description={`Nota mínima ${String(data.minScore)}% · ${String(data.maxAttempts)} tentativa(s)`}
        action={
          editable && !addingQuestion ? (
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="sm" onClick={() => setAddingQuestion(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Pergunta
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void (async () => {
                    try {
                      await deleteAssessment(trainingId)
                      show('success', 'Avaliação removida.')
                      await reload()
                    } catch (removeError) {
                      show(
                        'error',
                        apiErrorMessage(removeError, 'Não foi possível remover a avaliação.'),
                      )
                    }
                  })()
                }}
                aria-label="Remover avaliação"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ) : undefined
        }
      />

      {data.questions.length === 0 && !addingQuestion && (
        <EmptyState
          title="Nenhuma pergunta"
          description="Uma avaliação sem perguntas impede a publicação do treinamento."
        />
      )}

      {data.questions.length > 0 && (
        <ul className="divide-y divide-neutral-200">
          {data.questions.map((question) => (
            <QuestionRow
              key={question.id}
              trainingId={trainingId}
              question={question}
              editable={editable}
              onChanged={() => void reload()}
            />
          ))}
        </ul>
      )}

      {addingQuestion && (
        <CardBody className="border-t border-neutral-200 bg-neutral-50/60">
          <QuestionForm
            onCancel={() => setAddingQuestion(false)}
            onSubmit={async (input) => {
              await createQuestion(trainingId, input)
              setAddingQuestion(false)
              show('success', 'Pergunta adicionada.')
              await reload()
            }}
          />
        </CardBody>
      )}
    </Card>
  )
}

function QuestionRow({
  trainingId,
  question,
  editable,
  onChanged,
}: {
  trainingId: string
  question: AuthorQuestion
  editable: boolean
  onChanged: () => void
}) {
  const { show } = useToast()
  const [removing, setRemoving] = useState(false)

  return (
    <li className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-neutral-900">
          {question.position}. {question.text}
        </p>

        {editable && (
          <Button
            variant="ghost"
            size="sm"
            loading={removing}
            aria-label="Remover pergunta"
            onClick={() => {
              setRemoving(true)
              void (async () => {
                try {
                  await deleteQuestion(trainingId, question.id)
                  show('success', 'Pergunta removida.')
                  onChanged()
                } catch (error) {
                  show('error', apiErrorMessage(error, 'Não foi possível remover a pergunta.'))
                } finally {
                  setRemoving(false)
                }
              })()
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <ul className="mt-2 flex flex-col gap-1">
        {question.answers.map((answer) => (
          <li key={answer.id} className="flex items-center gap-2 text-sm text-neutral-600">
            {answer.isCorrect ? (
              <Badge tone="success">
                <Check className="size-3" aria-hidden="true" />
                <span className="ml-1">correta</span>
              </Badge>
            ) : (
              <span className="w-[4.5rem]" aria-hidden="true" />
            )}
            {answer.text}
          </li>
        ))}
      </ul>
    </li>
  )
}

function AssessmentForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: { minScore: number; maxAttempts: number }) => Promise<void>
  onCancel: () => void
}) {
  const { show } = useToast()
  const [minScore, setMinScore] = useState('70')
  const [maxAttempts, setMaxAttempts] = useState('3')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)

    try {
      await onSubmit({ minScore: Number(minScore), maxAttempts: Number(maxAttempts) })
    } catch (error) {
      show('error', apiErrorMessage(error, 'Não foi possível criar a avaliação.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nota mínima (%)"
          type="number"
          min={0}
          max={100}
          value={minScore}
          onChange={(event) => setMinScore(event.target.value)}
        />
        <Input
          label="Tentativas permitidas"
          type="number"
          min={1}
          max={10}
          value={maxAttempts}
          onChange={(event) => setMaxAttempts(event.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          Criar avaliação
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

const EMPTY_ANSWERS: AnswerDraft[] = [
  { text: '', isCorrect: true },
  { text: '', isCorrect: false },
]

function QuestionForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: { text: string; answers: AnswerDraft[] }) => Promise<void>
  onCancel: () => void
}) {
  const { show } = useToast()
  const [text, setText] = useState('')
  const [answers, setAnswers] = useState<AnswerDraft[]>(EMPTY_ANSWERS)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setAnswerText = (index: number, value: string) => {
    setAnswers((current) =>
      current.map((answer, position) =>
        position === index ? { ...answer, text: value } : answer,
      ),
    )
  }

  // Exatamente uma correta é regra do backend: marcar uma desmarca as outras.
  const markCorrect = (index: number) => {
    setAnswers((current) =>
      current.map((answer, position) => ({ ...answer, isCorrect: position === index })),
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (text.trim().length < 3) {
      setError('A pergunta precisa de ao menos 3 caracteres.')
      return
    }

    if (answers.some((answer) => answer.text.trim() === '')) {
      setError('Preencha o texto de todas as alternativas.')
      return
    }

    setError(null)
    setSaving(true)

    try {
      await onSubmit({ text: text.trim(), answers })
    } catch (submitError) {
      show('error', apiErrorMessage(submitError, 'Não foi possível adicionar a pergunta.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
      <Input
        label="Pergunta"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-neutral-700">
          Alternativas — marque a correta
        </legend>

        {answers.map((answer, index) => (
          <div key={index} className="flex items-center gap-2.5">
            <input
              type="radio"
              name="correct-answer"
              checked={answer.isCorrect}
              onChange={() => markCorrect(index)}
              aria-label={`Marcar alternativa ${String(index + 1)} como correta`}
              className="accent-brand-600 size-4 shrink-0 cursor-pointer"
            />

            <input
              value={answer.text}
              onChange={(event) => setAnswerText(index, event.target.value)}
              placeholder={`Alternativa ${String(index + 1)}`}
              className="focus:ring-brand-500 h-9 flex-1 rounded-md bg-white px-3 text-sm ring-1 ring-neutral-300 ring-inset focus:ring-2 focus:outline-none"
            />

            {answers.length > 2 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remover alternativa ${String(index + 1)}`}
                onClick={() =>
                  setAnswers((current) => {
                    const next = current.filter((_unused, position) => position !== index)

                    return next.some((item) => item.isCorrect)
                      ? next
                      : next.map((item, position) => ({ ...item, isCorrect: position === 0 }))
                  })
                }
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        ))}

        {answers.length < 6 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => setAnswers((current) => [...current, { text: '', isCorrect: false }])}
          >
            <Plus className="size-4" aria-hidden="true" />
            Alternativa
          </Button>
        )}
      </fieldset>

      {error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          Adicionar pergunta
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
