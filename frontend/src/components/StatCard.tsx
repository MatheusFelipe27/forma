import type { ReactNode } from 'react'

export type StatTone = 'neutral' | 'info' | 'success' | 'danger'

const TONES: Record<StatTone, string> = {
  neutral: 'text-neutral-900',
  info: 'text-brand-700',
  success: 'text-emerald-700',
  danger: 'text-red-700',
}

export function StatCard({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string
  value: ReactNode
  tone?: StatTone
  hint?: string
}) {
  return (
    <div className="rounded-lg bg-white px-4 py-3.5 ring-1 ring-neutral-200 ring-inset">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${TONES[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-neutral-400">{hint}</p>}
    </div>
  )
}
