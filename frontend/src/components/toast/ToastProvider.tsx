import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'

import { ToastContext, type Toast, type ToastTone } from './toast-context'

const TONES: Record<ToastTone, { ring: string; icon: ReactNode }> = {
  success: {
    ring: 'ring-emerald-200 bg-emerald-50 text-emerald-900',
    icon: <CheckCircle2 className="size-[18px] text-emerald-600" aria-hidden="true" />,
  },
  error: {
    ring: 'ring-red-200 bg-red-50 text-red-900',
    icon: <XCircle className="size-[18px] text-red-600" aria-hidden="true" />,
  },
  info: {
    ring: 'ring-brand-200 bg-brand-50 text-brand-900',
    icon: <Info className="text-brand-600 size-[18px]" aria-hidden="true" />,
  },
}

const DURATION_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++

      setToasts((current) => [...current, { id, tone, message }])
      setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm shadow-lg ring-1 ring-inset ${TONES[toast.tone].ring}`}
          >
            {TONES[toast.tone].icon}
            <p className="flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Fechar aviso"
              className="cursor-pointer opacity-50 transition-opacity hover:opacity-100"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
