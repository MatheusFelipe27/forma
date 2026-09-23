import { useId, type TextareaHTMLAttributes } from 'react'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  error?: string | undefined
  hint?: string | undefined
}

export function Textarea({ label, error, hint, className = '', id, ...rest }: TextareaProps) {
  const generatedId = useId()
  const textareaId = id ?? generatedId
  const describedBy = error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={textareaId} className="text-sm font-medium text-neutral-700">
        {label}
      </label>

      <textarea
        id={textareaId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-24 rounded-md bg-white px-3 py-2 text-sm text-neutral-900 ring-1 ring-inset transition-shadow placeholder:text-neutral-400 focus:ring-2 focus:outline-none disabled:bg-neutral-100 ${
          error ? 'ring-red-400 focus:ring-red-500' : 'focus:ring-brand-500 ring-neutral-300'
        } ${className}`}
        {...rest}
      />

      {error ? (
        <p id={`${textareaId}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${textareaId}-hint`} className="text-sm text-neutral-500">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
