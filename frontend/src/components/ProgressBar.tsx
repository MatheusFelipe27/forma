export type ProgressTone = 'brand' | 'success' | 'warning'

const TONES: Record<ProgressTone, string> = {
  brand: 'bg-brand-600',
  success: 'bg-emerald-600',
  warning: 'bg-amber-500',
}

export function ProgressBar({
  percentage,
  label,
  tone,
}: {
  percentage: number
  label?: string | undefined
  tone?: ProgressTone | undefined
}) {
  const clamped = Math.max(0, Math.min(100, percentage))
  const resolved = tone ?? (clamped === 100 ? 'success' : 'brand')

  return (
    <div className="flex flex-col gap-1.5">
      {label && <p className="text-xs text-neutral-500">{label}</p>}

      <div className="flex items-center gap-2.5">
        <div
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label ?? 'Progresso'}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${TONES[resolved]}`}
            style={{ width: `${String(clamped)}%` }}
          />
        </div>

        <span className="w-11 shrink-0 text-right text-xs font-medium tabular-nums text-neutral-600">
          {clamped}%
        </span>
      </div>
    </div>
  )
}
