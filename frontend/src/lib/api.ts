import axios, { AxiosError, type AxiosInstance } from 'axios'

import { readToken } from './token-storage'

/** Formato de erro que o backend devolve pelo handler central. */
export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown }
}

export const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Lido do storage a cada request, não capturado no boot: depois do login o token
// novo passa a valer sem recriar a instância.
api.interceptors.request.use((config) => {
  const token = readToken()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

type UnauthorizedHandler = () => void

let onUnauthorized: UnauthorizedHandler = () => undefined

/**
 * O interceptor não navega nem mexe no storage por conta própria: avisa o
 * AuthProvider, que limpa a sessão e deixa as rotas protegidas redirecionarem.
 * Assim a app não recarrega e o React Router continua sendo a única autoridade
 * sobre navegação.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler
}

const AUTH_ENDPOINTS = ['/auth/login']

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const url = error.config?.url ?? ''
    // 401 no login é credencial errada, não sessão expirada: quem trata é a tela.
    const isLoginAttempt = AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint))

    if (error.response?.status === 401 && !isLoginAttempt) {
      onUnauthorized()
    }

    return Promise.reject(error)
  },
)

export function isApiError(error: unknown): error is AxiosError<ApiErrorBody> {
  return axios.isAxiosError(error)
}

export function apiErrorCode(error: unknown): string | null {
  return isApiError(error) ? (error.response?.data?.error.code ?? null) : null
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    if (error.response?.data?.error.message) {
      return error.response.data.error.message
    }

    if (!error.response) {
      return 'Não foi possível falar com o servidor. Verifique sua conexão.'
    }
  }

  return fallback
}
