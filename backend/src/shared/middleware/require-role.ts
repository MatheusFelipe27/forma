import type { Role } from '@prisma/client';
import type { RequestHandler } from 'express';

import { AppError } from '../errors/AppError';

export function requireRole(...roles: [Role, ...Role[]]): RequestHandler {
  return (req, _res, next) => {
    // 401 e não 403: sem identidade, o problema é autenticação.
    if (!req.user) {
      throw new AppError('Token de autenticação ausente.', 401, 'UNAUTHENTICATED');
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError('Permissão insuficiente para esta operação.', 403, 'FORBIDDEN');
    }

    next();
  };
}
