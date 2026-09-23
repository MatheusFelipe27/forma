import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { setUnauthorizedHandler } from '../lib/api'
import { clearToken, readToken, writeToken } from '../lib/token-storage'
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context'
import { fetchCurrentUser, requestLogin, requestLogout } from './auth.api'
import type { AuthenticatedUser } from './auth.types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    readToken() ? 'restoring' : 'anonymous',
  )

  const clearSession = useCallback(() => {
    clearToken()
    setUser(null)
    setStatus('anonymous')
  }, [])

  // Qualquer 401 fora do login derruba a sessão local: token expirado, revogado
  // ou usuário removido do banco chegam todos por aqui.
  useEffect(() => {
    setUnauthorizedHandler(clearSession)

    return () => setUnauthorizedHandler(() => undefined)
  }, [clearSession])

  // Token guardado só vale se o backend confirmar. Se não confirmar, o próprio
  // interceptor de 401 limpa a sessão.
  useEffect(() => {
    if (!readToken()) {
      return
    }

    let active = true

    fetchCurrentUser()
      .then((restored) => {
        if (active) {
          setUser(restored)
          setStatus('authenticated')
        }
      })
      .catch(() => {
        if (active) {
          clearSession()
        }
      })

    return () => {
      active = false
    }
  }, [clearSession])

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: logged } = await requestLogin(email, password)

    writeToken(token)
    setUser(logged)
    setStatus('authenticated')

    return logged
  }, [])

  const logout = useCallback(async () => {
    await requestLogout()
    clearSession()
  }, [clearSession])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
