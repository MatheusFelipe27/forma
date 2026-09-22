import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';

import { env } from '../config/env';
import { signToken } from '../utils/jwt';
import { requireAuth } from './require-auth';

function requestWith(authorization?: string): Request {
  return { headers: authorization === undefined ? {} : { authorization } } as Request;
}

function run(req: Request) {
  const next = vi.fn();
  const call = () => requireAuth(req, {} as Response, next);
  return { call, next };
}

describe('requireAuth', () => {
  it('preenche req.user a partir de um token válido', () => {
    const req = requestWith(`Bearer ${signToken({ sub: 'user-1', role: Role.MANAGER })}`);
    const { call, next } = run(req);

    call();

    expect(req.user).toEqual({ id: 'user-1', role: Role.MANAGER });
    expect(next).toHaveBeenCalledOnce();
  });

  it.each([
    ['sem header', undefined],
    ['header vazio', ''],
    ['sem o prefixo Bearer', 'Token abc.def.ghi'],
  ])('rejeita com 401 UNAUTHENTICATED: %s', (_caso, authorization) => {
    const { call, next } = run(requestWith(authorization));

    expect(call).toThrow(expect.objectContaining({ statusCode: 401, code: 'UNAUTHENTICATED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejeita token com assinatura inválida', () => {
    const forjado = jwt.sign({ sub: 'user-1', role: Role.ADMIN }, 'outro-segredo-qualquer-123');
    const { call } = run(requestWith(`Bearer ${forjado}`));

    expect(call).toThrow(expect.objectContaining({ statusCode: 401, code: 'INVALID_TOKEN' }));
  });

  it('distingue token expirado de token inválido', () => {
    const expirado = jwt.sign({ sub: 'user-1', role: Role.ADMIN }, env.JWT_SECRET, {
      expiresIn: '-1s',
    });
    const { call } = run(requestWith(`Bearer ${expirado}`));

    expect(call).toThrow(expect.objectContaining({ statusCode: 401, code: 'TOKEN_EXPIRED' }));
  });

  // Assinatura válida não garante shape: token de uma versão anterior do código.
  it('rejeita token assinado por nós com payload fora do formato', () => {
    const semRole = jwt.sign({ sub: 'user-1' }, env.JWT_SECRET);
    const { call } = run(requestWith(`Bearer ${semRole}`));

    expect(call).toThrow(expect.objectContaining({ statusCode: 401, code: 'INVALID_TOKEN' }));
  });
});
