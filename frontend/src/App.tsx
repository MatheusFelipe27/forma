import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './auth/AuthProvider'
import { AppShell } from './layout/AppShell'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { PATHS } from './routes/navigation'
import { ProtectedRoute } from './routes/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path={PATHS.login} element={<LoginPage />} />

          {/* Exige apenas sessão. */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route
                path={PATHS.home}
                element={
                  <PlaceholderPage
                    title="Início"
                    description="Seu progresso nos treinamentos atribuídos."
                  />
                }
              />
              <Route
                path={PATHS.myTrainings}
                element={
                  <PlaceholderPage
                    title="Meus Treinamentos"
                    description="Treinamentos atribuídos a você e seu andamento."
                  />
                }
              />
              <Route
                path={PATHS.catalog}
                element={
                  <PlaceholderPage
                    title="Catálogo"
                    description="Treinamentos publicados disponíveis."
                  />
                }
              />
            </Route>
          </Route>

          {/* Exige papel de gestão. */}
          <Route element={<ProtectedRoute roles={['MANAGER', 'ADMIN']} />}>
            <Route element={<AppShell />}>
              <Route
                path={PATHS.team}
                element={
                  <PlaceholderPage
                    title="Equipe"
                    description="Situação de cada pessoa da sua equipe."
                  />
                }
              />
              <Route
                path={PATHS.assign}
                element={
                  <PlaceholderPage
                    title="Atribuir"
                    description="Atribua um treinamento a um ou mais funcionários."
                  />
                }
              />
            </Route>
          </Route>

          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route element={<AppShell />}>
              <Route
                path={PATHS.audit}
                element={
                  <PlaceholderPage
                    title="Auditoria"
                    description="Registro das ações administrativas."
                  />
                }
              />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to={PATHS.home} replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
