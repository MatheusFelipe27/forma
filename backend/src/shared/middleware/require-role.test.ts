import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../errors/AppError';
import { requireRole } from './require-role';

function requestWithRole(role: Role | null): Request {
  return (role === null ? {} : { user: { id: 'user-1', role } }) as Request;
}

function run(guard: ReturnType<typeof requireRole>, req: Request) {
  const next = vi.fn();
  const call = () => guard(req, {} as Response, next);
  return { call, next };
}

describe('requireRole', () => {
  it('libera quando o papel está na lista', () => {
    const { call, next } = run(
      requireRole(Role.MANAGER, Role.ADMIN),
      requestWithRole(Role.MANAGER),
    );

    call();

    expect(next).toHaveBeenCalledOnce();
  });

  it('bloqueia com 403 quando o papel não está na lista', () => {
    const { call, next } = run(
      requireRole(Role.MANAGER, Role.ADMIN),
      requestWithRole(Role.EMPLOYEE),
    );

    expect(call).toThrow(AppError);
    expect(call).toThrow(expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' }));
    expect(next).not.toHaveBeenCalled();
  });

  // Sem identidade o problema é autenticação, não permissão.
  it('responde 401 quando não há usuário no request', () => {
    const { call, next } = run(requireRole(Role.ADMIN), requestWithRole(null));

    expect(call).toThrow(expect.objectContaining({ statusCode: 401, code: 'UNAUTHENTICATED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    [Role.EMPLOYEE, false],
    [Role.MANAGER, false],
    [Role.ADMIN, true],
  ])('requireRole(ADMIN) com %s → liberado: %s', (role, permitido) => {
    const { call, next } = run(requireRole(Role.ADMIN), requestWithRole(role));

    if (permitido) {
      call();
      expect(next).toHaveBeenCalledOnce();
    } else {
      expect(call).toThrow(expect.objectContaining({ statusCode: 403 }));
      expect(next).not.toHaveBeenCalled();
    }
  });
});
