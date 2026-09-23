import { useState } from 'react'

import { ROLE_LABEL, type AuthenticatedUser } from '../auth/auth.types'
import { Button } from '../components/Button'

export function Header({
  user,
  onLogout,
  onToggleMenu,
}: {
  user: AuthenticatedUser
  onLogout: () => Promise<void>
  onToggleMenu: () => void
}) {
  const [leaving, setLeaving] = useState(false)

  const handleLogout = () => {
    setLeaving(true)
    void onLogout().finally(() => setLeaving(false))
  }

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 lg:px-6">
      <Button
        variant="ghost"
        size="sm"
        className="lg:hidden"
        onClick={onToggleMenu}
        aria-label="Abrir navegação"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          className="size-5"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </Button>

      <div className="ml-auto flex items-center gap-3">
        <div className="text-right leading-tight">
          <p className="text-sm font-medium text-neutral-900">{user.name}</p>
          <p className="text-xs text-neutral-500">
            {ROLE_LABEL[user.role]}
            {user.team && ` · ${user.team}`}
          </p>
        </div>

        <span
          aria-hidden="true"
          className="bg-brand-100 text-brand-800 grid size-9 place-items-center rounded-full text-sm font-semibold"
        >
          {initials(user.name)}
        </span>

        <Button variant="secondary" size="sm" loading={leaving} onClick={handleLogout}>
          Sair
        </Button>
      </div>
    </header>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts.at(0)?.charAt(0) ?? ''
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? '') : ''

  return (first + last).toUpperCase()
}
