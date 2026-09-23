const TOKEN_KEY = 'forma.token'

// localStorage lança em contextos restritos (modo privado de alguns navegadores,
// storage bloqueado). Sessão perdida é aceitável; app quebrada não é.
export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* segue sem persistir */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* nada a limpar */
  }
}
