import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { z } from 'zod'

import { Button } from '../../components/Button'
import { Card, CardBody, CardHeader } from '../../components/Card'
import { Input } from '../../components/Input'
import { EmptyState } from '../../components/states'
import { Textarea } from '../../components/Textarea'
import { useToast } from '../../components/toast/use-toast'
import { apiErrorMessage } from '../../lib/api'
import { formatDuration } from '../../lib/format'
import {
  createModule,
  deleteModule,
  updateModule,
  type ModuleInput,
  type TrainingModule,
} from './trainings.api'

const moduleSchema = z.object({
  title: z.string().trim().min(3, 'Mínimo de 3 caracteres').max(200),
  content: z.string().trim().min(1, 'Informe o conteúdo'),
  duration: z.number().int('Use um número inteiro').positive('Precisa ser maior que zero'),
  materialUrl: z.union([z.url('Informe uma URL válida'), z.literal('')]),
})

type Errors = Partial<Record<'title' | 'content' | 'duration' | 'materialUrl', string>>

export function ModulesSection({
  trainingId,
  modules,
  editable,
  onChanged,
}: {
  trainingId: string
  modules: TrainingModule[]
  editable: boolean
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader
        title="Módulos"
        description={
          editable
            ? 'A ordem segue a sequência de criação.'
            : 'Módulos só podem ser alterados enquanto o treinamento é rascunho.'
        }
        action={
          editable && !adding ? (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Adicionar
            </Button>
          ) : undefined
        }
      />

      {modules.length === 0 && !adding && (
        <EmptyState
          title="Nenhum módulo"
          description={
            editable
              ? 'Um treinamento precisa de ao menos um módulo para ser publicado.'
              : 'Este treinamento não possui módulos.'
          }
        />
      )}

      {modules.length > 0 && (
        <ul className="divide-y divide-neutral-200">
          {modules.map((module) =>
            editingId === module.id ? (
              <li key={module.id} className="bg-neutral-50/60 px-5 py-4">
                <ModuleForm
                  initial={module}
                  submitLabel="Salvar módulo"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (input) => {
                    await updateModule(trainingId, module.id, input)
                    setEditingId(null)
                    onChanged()
                  }}
                />
              </li>
            ) : (
              <ModuleRow
                key={module.id}
                trainingId={trainingId}
                module={module}
                editable={editable}
                onEdit={() => setEditingId(module.id)}
                onChanged={onChanged}
              />
            ),
          )}
        </ul>
      )}

      {adding && (
        <CardBody className="border-t border-neutral-200 bg-neutral-50/60">
          <ModuleForm
            submitLabel="Adicionar módulo"
            onCancel={() => setAdding(false)}
            onSubmit={async (input) => {
              await createModule(trainingId, input)
              setAdding(false)
              onChanged()
            }}
          />
        </CardBody>
      )}
    </Card>
  )
}

function ModuleRow({
  trainingId,
  module,
  editable,
  onEdit,
  onChanged,
}: {
  trainingId: string
  module: TrainingModule
  editable: boolean
  onEdit: () => void
  onChanged: () => void
}) {
  const { show } = useToast()
  const [removing, setRemoving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const handleDelete = async () => {
    setRemoving(true)

    try {
      await deleteModule(trainingId, module.id)
      show('success', `Módulo "${module.title}" removido.`)
      onChanged()
    } catch (error) {
      show('error', apiErrorMessage(error, 'Não foi possível remover o módulo.'))
    } finally {
      setRemoving(false)
      setConfirming(false)
    }
  }

  return (
    <li className="flex items-start gap-3 px-5 py-4">
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500 ring-1 ring-neutral-200 ring-inset"
      >
        {module.position}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900">{module.title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{module.content}</p>
        <p className="mt-1 text-xs text-neutral-400">
          {formatDuration(module.duration)}
          {module.materialUrl && ' · com material de apoio'}
        </p>
      </div>

      {editable && (
        <div className="flex shrink-0 items-center gap-1">
          {confirming ? (
            <>
              <Button variant="danger" size="sm" loading={removing} onClick={() => void handleDelete()}>
                Remover
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Editar módulo">
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
                aria-label="Remover módulo"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  )
}

function ModuleForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: TrainingModule
  submitLabel: string
  onSubmit: (input: ModuleInput) => Promise<void>
  onCancel: () => void
}) {
  const { show } = useToast()

  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [duration, setDuration] = useState(String(initial?.duration ?? ''))
  const [materialUrl, setMaterialUrl] = useState(initial?.materialUrl ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (saving) {
      return
    }

    const parsed = moduleSchema.safeParse({
      title,
      content,
      duration: duration === '' ? Number.NaN : Number(duration),
      materialUrl,
    })

    if (!parsed.success) {
      const next: Errors = {}

      for (const issue of parsed.error.issues) {
        const field = issue.path.at(0) as keyof Errors | undefined

        if (field && !next[field]) {
          next[field] = issue.message
        }
      }

      setErrors(next)
      return
    }

    setErrors({})
    setSaving(true)

    try {
      await onSubmit({
        title: parsed.data.title,
        content: parsed.data.content,
        duration: parsed.data.duration,
        materialUrl: parsed.data.materialUrl === '' ? null : parsed.data.materialUrl,
      })
    } catch (error) {
      show('error', apiErrorMessage(error, 'Não foi possível salvar o módulo.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
      <Input
        label="Título do módulo"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={errors.title}
      />

      <Textarea
        label="Conteúdo"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        error={errors.content}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Duração (min)"
          type="number"
          min={1}
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          error={errors.duration}
        />
        <Input
          label="Material de apoio (opcional)"
          type="url"
          placeholder="https://..."
          value={materialUrl}
          onChange={(event) => setMaterialUrl(event.target.value)}
          error={errors.materialUrl}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
