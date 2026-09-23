import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import { useAuth } from '../auth/use-auth'
import { Logo } from '../components/Logo'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  // A rota protegida já garante o usuário; o early return é só para o tipo.
  if (!user) {
    return null
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Sidebar fixa no desktop, gaveta no mobile. */}
      <aside className="hidden border-r border-neutral-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-14 items-center border-b border-neutral-200 px-5">
          <Logo />
        </div>
        <Sidebar role={user.role} />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-20 lg:hidden">
          <button
            type="button"
            aria-label="Fechar navegação"
            className="absolute inset-0 bg-neutral-900/30"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative flex h-full w-64 flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center border-b border-neutral-200 px-5">
              <Logo />
            </div>
            <Sidebar role={user.role} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <Header user={user} onLogout={logout} onToggleMenu={() => setMenuOpen(true)} />

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
