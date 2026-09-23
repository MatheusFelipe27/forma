export type Role = 'EMPLOYEE' | 'MANAGER' | 'ADMIN'

export type AuthenticatedUser = {
  id: string
  name: string
  email: string
  role: Role
  team: string | null
}

export type LoginResponse = {
  token: string
  user: AuthenticatedUser
}

export const ROLE_LABEL: Record<Role, string> = {
  EMPLOYEE: 'Funcionário',
  MANAGER: 'Gestor',
  ADMIN: 'Administrador',
}
