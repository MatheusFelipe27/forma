import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:hover:bg-brand-700',
  secondary:
    'bg-white text-neutral-800 ring-1 ring-neutral-300 ring-inset hover:bg-neutral-50 disabled:hover:bg-white',
  ghost: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:hover:bg-red-700',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      // `loading` também desabilita: evita submissão dupla sem o chamador
      // precisar lembrar de combinar as duas props.
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      // `cursor-pointer` explícito: o Tailwind v4 não aplica mais o cursor de
      // mão em <button>, então o padrão do navegador é a seta.
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}
