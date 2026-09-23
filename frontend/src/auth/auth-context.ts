import { createContext } from 'react'

import type { AuthenticatedUser } from './auth.types'

/**
 * `restoring` existe para a app não piscar a tela de login enquanto o
 * `GET /auth/me` valida o token guardado.
 */
export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous'

export type AuthContextValue = {
  status: AuthStatus
  user: AuthenticatedUser | null
  login: (email: string, password: string) => Promise<AuthenticatedUser>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
