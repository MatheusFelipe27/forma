import type { Role } from '../auth/auth.types'

export const PATHS = {
  login: '/login',
  home: '/inicio',
  myTrainings: '/meus-treinamentos',
  team: '/equipe',
  assign: '/atribuir',
  audit: '/auditoria',
} as const

export type NavItem = {
  label: string
  to: string
  /** Ausente = visível para todos os papéis. */
  roles?: Role[]
  /** `d` de um <path> 24x24 com stroke. */
  icon: string
}

/**
 * Fonte única da navegação: a Sidebar renderiza a partir daqui e as rotas usam
 * os mesmos papéis. Sem isso, esconder um link e proteger a rota viram duas
 * listas que divergem.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Início',
    to: PATHS.home,
    icon: 'M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z',
  },
  {
    label: 'Meus Treinamentos',
    to: PATHS.myTrainings,
    icon: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5.5A1.5 1.5 0 0 1 4 18.5v-13Zm4 2.5h8M8 12h8',
  },
  {
    label: 'Equipe',
    to: PATHS.team,
    roles: ['MANAGER', 'ADMIN'],
    icon: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm9 12v-1a4 4 0 0 0-3-3.87M16 4.13A4 4 0 0 1 16 11',
  },
  {
    label: 'Atribuir',
    to: PATHS.assign,
    roles: ['MANAGER', 'ADMIN'],
    icon: 'M12 5v14M5 12h14',
  },
  {
    label: 'Auditoria',
    to: PATHS.audit,
    roles: ['ADMIN'],
    icon: 'M9 12.5 11 14.5 15.5 10M12 3l7.5 3v6c0 4.2-3 7.5-7.5 9-4.5-1.5-7.5-4.8-7.5-9V6L12 3Z',
  },
]

export function teamMemberPath(userId: string): string {
  return `${PATHS.team}/${userId}`
}

export function navItemsFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
}

export function canAccess(role: Role, roles?: Role[]): boolean {
  return !roles || roles.includes(role)
}

/** Para onde cada papel vai depois do login. */
export function landingPathFor(role: Role): string {
  return role === 'EMPLOYEE' ? PATHS.home : PATHS.team
}
