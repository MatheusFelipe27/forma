const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

export function formatDate(value: string | null): string | null {
  if (!value) {
    return null
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : DATE_FORMAT.format(date)
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${String(minutes)} min`
  }

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`
}
