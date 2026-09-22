import type { RequestHandler } from 'express';

import { getAuthenticatedUser } from '../../shared/middleware/require-auth';
import { authService, type AuthService } from './auth.service';
import { loginSchema } from './auth.schemas';

export function createAuthController(service: AuthService = authService) {
  const login: RequestHandler = async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await service.login(input);

    res.status(200).json(result);
  };

  // Token JWT é stateless: não há sessão no servidor para invalidar. O endpoint
  // existe para o cliente ter um ponto de saída explícito e para abrir espaço a
  // uma denylist de tokens se ela vier a ser necessária.
  const logout: RequestHandler = (_req, res) => {
    res.status(200).json({ message: 'Logout efetuado. Descarte o token no cliente.' });
  };

  const me: RequestHandler = async (req, res) => {
    const { id } = getAuthenticatedUser(req);
    res.status(200).json(await service.me(id));
  };

  return { login, logout, me };
}
