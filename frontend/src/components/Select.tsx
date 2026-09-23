import { useId, type ReactNode, type SelectHTMLAttributes } from 'react'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  error?: string | undefined
  children: ReactNode
}

export function Select({ label, error, className = '', id, children, ...rest }: SelectProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-neutral-700">
        {label}
      </label>

      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        className={`h-10 cursor-pointer rounded-md bg-white px-3 text-sm text-neutral-900 ring-1 ring-inset transition-shadow focus:ring-2 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500 ${
          error ? 'ring-red-400 focus:ring-red-500' : 'focus:ring-brand-500 ring-neutral-300'
        } ${className}`}
        {...rest}
      >
        {children}
      </select>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  )
}
