import { NavLink } from 'react-router-dom'

import type { Role } from '../auth/auth.types'
import { navItemsFor } from '../routes/navigation'

export function Sidebar({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navegação principal" className="flex h-full flex-col gap-1 px-3 py-4">
      {navItemsFor(role).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
              isActive
                ? 'bg-brand-50 text-brand-800 font-medium'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`
          }
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[18px] shrink-0 opacity-80"
            aria-hidden="true"
          >
            <path d={item.icon} />
          </svg>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
