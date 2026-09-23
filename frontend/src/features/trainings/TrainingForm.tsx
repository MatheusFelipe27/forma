import { useState, type FormEvent } from 'react'
import { z } from 'zod'

import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { Textarea } from '../../components/Textarea'
import type { TrainingInput } from './trainings.api'

/** Espelha o schema Zod do backend para o erro aparecer antes da requisição. */
const trainingSchema = z.object({
  title: z.string().trim().min(3, 'Mínimo de 3 caracteres').max(200),
  description: z.string().trim().min(1, 'Informe uma descrição'),
  category: z.string().trim().min(1, 'Informe a categoria').max(100),
  instructor: z.string().trim().min(1, 'Informe o instrutor').max(200),
  estimatedDuration: z
    .number({ message: 'Informe a duração em minutos' })
    .int('Use um número inteiro')
    .positive('Precisa ser maior que zero'),
})

type Errors = Partial<Record<keyof TrainingInput, string>>

export function TrainingForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: TrainingInput
  submitLabel: string
  onSubmit: (input: TrainingInput) => Promise<void>
  onCancel?: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [instructor, setInstructor] = useState(initial?.instructor ?? '')
  const [duration, setDuration] = useState(String(initial?.estimatedDuration ?? ''))

  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (saving) {
      return
    }

    const parsed = trainingSchema.safeParse({
      title,
      description,
      category,
      instructor,
      estimatedDuration: duration === '' ? Number.NaN : Number(duration),
    })

    if (!parsed.success) {
      const next: Errors = {}

      for (const issue of parsed.error.issues) {
        const field = issue.path.at(0) as keyof TrainingInput | undefined

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
      await onSubmit(parsed.data)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
      <Input
        label="Título"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={errors.title}
      />

      <Textarea
        label="Descrição"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={errors.description}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="Categoria"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          error={errors.category}
        />
        <Input
          label="Instrutor"
          value={instructor}
          onChange={(event) => setInstructor(event.target.value)}
          error={errors.instructor}
        />
        <Input
          label="Duração (min)"
          type="number"
          min={1}
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          error={errors.estimatedDuration}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>

        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}
