import { Navigate, Outlet, useLocation } from 'react-router-dom'

import type { Role } from '../auth/auth.types'
import { useAuth } from '../auth/use-auth'
import { Spinner } from '../components/Spinner'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { canAccess, PATHS } from './navigation'

/**
 * Guarda de UX, não de segurança: a autorização real é do backend, que responde
 * 401/403 de qualquer forma. Aqui só evitamos abrir uma tela que já nasceria com
 * erro.
 */
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { status, user } = useAuth()
  const location = useLocation()

  // Enquanto o token guardado está sendo validado, redirecionar para o login
  // deslogaria quem tem sessão válida a cada recarga da página.
  if (status === 'restoring') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-neutral-400">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) {
    // `from` devolve a pessoa ao destino original depois do login.
    return <Navigate to={PATHS.login} replace state={{ from: location.pathname }} />
  }

  // Papel insuficiente mostra explicação em vez de bounce silencioso: só se
  // chega aqui digitando a URL, já que o link nem aparece na Sidebar.
  if (!canAccess(user.role, roles)) {
    return <ForbiddenPage />
  }

  return <Outlet />
}
