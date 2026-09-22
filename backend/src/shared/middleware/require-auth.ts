import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

import { AppError } from '../errors/AppError';
import type { AuthenticatedUser } from '../types/express';
import { verifyToken } from '../utils/jwt';

const BEARER_PREFIX = 'Bearer ';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith(BEARER_PREFIX)) {
    throw new AppError('Token de autenticação ausente.', 401, 'UNAUTHENTICATED');
  }

  try {
    const payload = verifyToken(header.slice(BEARER_PREFIX.length).trim());
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Sessão expirada.', 401, 'TOKEN_EXPIRED');
    }

    throw new AppError('Token de autenticação inválido.', 401, 'INVALID_TOKEN');
  }
};

// Depois de `requireAuth`, ausência de `req.user` é bug, não 401 comum.
export function getAuthenticatedUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new AppError('Rota autenticada sem usuário no request.', 401, 'UNAUTHENTICATED');
  }

  return req.user;
}
