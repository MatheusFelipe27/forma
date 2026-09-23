import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './auth/AuthProvider'
import { ToastProvider } from './components/toast/ToastProvider'
import { AppShell } from './layout/AppShell'
import { AssignPage } from './pages/AssignPage'
import { AuditPage } from './pages/AuditPage'
import { DashboardPage } from './pages/DashboardPage'
import { EnrollmentDetailPage } from './pages/EnrollmentDetailPage'
import { LoginPage } from './pages/LoginPage'
import { MyTrainingsPage } from './pages/MyTrainingsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { TeamMemberPage } from './pages/TeamMemberPage'
import { TeamPage } from './pages/TeamPage'
import { PATHS } from './routes/navigation'
import { ProtectedRoute } from './routes/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path={PATHS.login} element={<LoginPage />} />

            {/* Exige apenas sessão. */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path={PATHS.home} element={<DashboardPage />} />
                <Route path={PATHS.myTrainings} element={<MyTrainingsPage />} />
                <Route path={`${PATHS.myTrainings}/:id`} element={<EnrollmentDetailPage />} />
              </Route>
            </Route>

            {/* Exige papel de gestão. */}
            <Route element={<ProtectedRoute roles={['MANAGER', 'ADMIN']} />}>
              <Route element={<AppShell />}>
                <Route path={PATHS.team} element={<TeamPage />} />
                <Route path={`${PATHS.team}/:userId`} element={<TeamMemberPage />} />
                <Route path={PATHS.assign} element={<AssignPage />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute roles={['ADMIN']} />}>
              <Route element={<AppShell />}>
                <Route path={PATHS.audit} element={<AuditPage />} />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to={PATHS.home} replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
