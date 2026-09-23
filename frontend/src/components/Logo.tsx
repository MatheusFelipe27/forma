export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`bg-brand-700 grid place-items-center rounded-md font-semibold text-white ${
          size === 'lg' ? 'size-10 text-lg' : 'size-7 text-sm'
        }`}
      >
        F
      </span>
      <span
        className={`font-semibold tracking-tight text-neutral-900 ${
          size === 'lg' ? 'text-xl' : 'text-base'
        }`}
      >
        Forma
      </span>
    </span>
  )
}
