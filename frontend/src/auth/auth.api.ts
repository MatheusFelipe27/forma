import { api } from '../lib/api'
import type { AuthenticatedUser, LoginResponse } from './auth.types'

export async function requestLogin(email: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', { email, password })

  return data
}

export async function fetchCurrentUser(): Promise<AuthenticatedUser> {
  const { data } = await api.get<AuthenticatedUser>('/auth/me')

  return data
}

export async function requestLogout(): Promise<void> {
  // Sem sessão no servidor para invalidar (ADR 009); a chamada existe para o
  // backend poder registrar a saída. Falhar aqui não impede o logout local.
  await api.post('/auth/logout').catch(() => undefined)
}
