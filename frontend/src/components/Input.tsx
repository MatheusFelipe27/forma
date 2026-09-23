import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

/** Botão dentro do campo, à direita — ex: alternar visibilidade da senha. */
export type InputAction = {
  icon: ReactNode
  /** Texto para leitor de tela; o ícone é decorativo. */
  label: string
  onClick: () => void
  pressed?: boolean
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string | undefined
  hint?: string | undefined
  action?: InputAction | undefined
}

export function Input({
  label,
  error,
  hint,
  action,
  className = '',
  id,
  ...rest
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      {/* Label sempre presente e associada: sem placeholder fazendo o papel dela. */}
      <label htmlFor={inputId} className="text-sm font-medium text-neutral-700">
        {label}
      </label>

      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          // `outline-none` desliga o outline do navegador e o global de
          // `:focus-visible`; o foco do campo é um ring interno na cor da paleta.
          className={`h-10 w-full rounded-md bg-white px-3 text-sm text-neutral-900 ring-1 ring-inset transition-shadow placeholder:text-neutral-400 focus:ring-2 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500 ${
            error
              ? 'ring-red-400 focus:ring-red-500'
              : 'focus:ring-brand-500 ring-neutral-300'
          } ${action ? 'pr-10' : ''} ${className}`}
          {...rest}
        />

        {action && (
          <button
            type="button"
            onClick={action.onClick}
            aria-label={action.label}
            aria-pressed={action.pressed}
            // `tabIndex={-1}` de propósito: o Tab vai do campo direto para o
            // próximo, sem passar por um controle acessório. Quem usa leitor de
            // tela alcança pelo rótulo.
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-md text-neutral-400 transition-colors hover:text-neutral-700"
          >
            {action.icon}
          </button>
        )}
      </div>

      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-neutral-500">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
