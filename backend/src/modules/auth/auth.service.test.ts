import { Role, type User } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';

import { AppError } from '../../shared/errors/AppError';
import { verifyToken } from '../../shared/utils/jwt';
import type { UsersRepository } from '../users/users.repository';
import { hashPassword } from '../users/users.service';
import { createAuthService } from './auth.service';

const PASSWORD = 'SenhaCorreta@123';

let storedUser: User;

function repositoryWith(user: User | null): UsersRepository {
  return {
    findByEmail: (email) => Promise.resolve(user && user.email === email ? user : null),
    findById: (id) => Promise.resolve(user && user.id === id ? user : null),
  };
}

beforeAll(async () => {
  storedUser = {
    id: 'user-1',
    name: 'Camila Duarte',
    email: 'camila@forma.dev',
    passwordHash: await hashPassword(PASSWORD),
    role: Role.EMPLOYEE,
    team: 'Engenharia',
    managerId: null,
    createdAt: new Date(),
  };
});

describe('login', () => {
  it('autentica com credenciais corretas e devolve token assinado', async () => {
    const service = createAuthService(repositoryWith(storedUser));

    const result = await service.login({ email: storedUser.email, password: PASSWORD });

    expect(verifyToken(result.token)).toEqual({
      sub: storedUser.id,
      role: Role.EMPLOYEE,
    });
  });

  it('não expõe o passwordHash na resposta', async () => {
    const service = createAuthService(repositoryWith(storedUser));

    const result = await service.login({ email: storedUser.email, password: PASSWORD });

    expect(result.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(result)).not.toContain(storedUser.passwordHash);
  });

  it('rejeita senha incorreta', async () => {
    const service = createAuthService(repositoryWith(storedUser));

    await expect(
      service.login({ email: storedUser.email, password: 'SenhaErrada@123' }),
    ).rejects.toThrow(AppError);
  });

  // Enumeração de usuários: a resposta precisa ser indistinguível nos dois casos.
  it('responde igual para e-mail inexistente e senha errada', async () => {
    const service = createAuthService(repositoryWith(storedUser));

    const failure = async (email: string, password: string): Promise<AppError> => {
      const error = await service.login({ email, password }).then(
        () => null,
        (thrown: unknown) => thrown as AppError,
      );

      if (!error) {
        throw new Error('esperava falha de login');
      }

      return error;
    };

    const senhaErrada = await failure(storedUser.email, 'SenhaErrada@123');
    const emailInexistente = await failure('nao-existe@forma.dev', PASSWORD);

    expect(senhaErrada.statusCode).toBe(401);
    expect(senhaErrada.code).toBe('INVALID_CREDENTIALS');
    expect(emailInexistente.statusCode).toBe(senhaErrada.statusCode);
    expect(emailInexistente.code).toBe(senhaErrada.code);
    expect(emailInexistente.message).toBe(senhaErrada.message);
  });
});

describe('me', () => {
  it('devolve o usuário público do id autenticado', async () => {
    const service = createAuthService(repositoryWith(storedUser));

    await expect(service.me(storedUser.id)).resolves.toEqual({
      id: storedUser.id,
      name: storedUser.name,
      email: storedUser.email,
      role: Role.EMPLOYEE,
      team: 'Engenharia',
    });
  });

  // Token válido de usuário já removido do banco.
  it('rejeita id que não existe mais', async () => {
    const service = createAuthService(repositoryWith(null));

    await expect(service.me('user-1')).rejects.toMatchObject({ statusCode: 401 });
  });
});
