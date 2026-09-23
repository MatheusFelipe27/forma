import { createContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export type Toast = {
  id: number
  tone: ToastTone
  message: string
}

export type ToastContextValue = {
  toasts: Toast[]
  show: (tone: ToastTone, message: string) => void
  dismiss: (id: number) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
