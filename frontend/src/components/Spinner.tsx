const SIZES = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-8 border-[3px]',
} as const

export function Spinner({ size = 'md' }: { size?: keyof typeof SIZES }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={`inline-block animate-spin rounded-full border-current border-t-transparent opacity-70 ${SIZES[size]}`}
    />
  )
}
