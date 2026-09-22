import { Role } from '@prisma/client';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { prisma } from '../../shared/database/prisma';
import { errorHandler } from '../../shared/middleware/error-handler';
import { requireAuth } from '../../shared/middleware/require-auth';
import { requireRole } from '../../shared/middleware/require-role';
import type { PublicUser } from '../users/users.service';
import { hashPassword } from '../users/users.service';

const PASSWORD = 'SenhaDeTeste@123';

const EMPLOYEE = 'teste.employee@forma.test';
const MANAGER = 'teste.manager@forma.test';

const USERS = [
  { email: EMPLOYEE, name: 'Teste Employee', role: Role.EMPLOYEE },
  { email: MANAGER, name: 'Teste Manager', role: Role.MANAGER },
];

type LoginBody = { token: string; user: PublicUser };
type ErrorBody = { error: { code: string; message: string } };

const app = createApp();

async function login(app: express.Express, email: string, password = PASSWORD) {
  const response = await request(app).post('/auth/login').send({ email, password });

  return {
    status: response.status,
    text: response.text,
    body: response.body as LoginBody,
    error: response.body as ErrorBody,
  };
}

async function tokenFor(email: string): Promise<string> {
  const { body } = await login(app, email);
  return body.token;
}

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);

  await prisma.user.deleteMany({ where: { email: { in: [EMPLOYEE, MANAGER] } } });
  await prisma.user.createMany({ data: USERS.map((user) => ({ ...user, passwordHash })) });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [EMPLOYEE, MANAGER] } } });
  await prisma.$disconnect();
});

describe('POST /auth/login', () => {
  it('autentica e devolve token com os dados públicos do usuário', async () => {
    const { status, body, text } = await login(app, EMPLOYEE);

    expect(status).toBe(200);
    expect(body.token).toEqual(expect.any(String));
    expect(body.user).toMatchObject({ email: EMPLOYEE, role: Role.EMPLOYEE });
    expect(text).not.toContain('passwordHash');
  });

  it('rejeita senha incorreta com 401', async () => {
    const { status, error } = await login(app, EMPLOYEE, 'SenhaErrada@123');

    expect(status).toBe(401);
    expect(error.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('valida o corpo da request com Zod', async () => {
    const response = await request(app).post('/auth/login').send({ email: 'nao-e-email' });
    const body = response.body as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /auth/me', () => {
  it('devolve o usuário autenticado', async () => {
    const response = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${await tokenFor(MANAGER)}`);
    const body = response.body as PublicUser;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ email: MANAGER, role: Role.MANAGER });
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('exige token', async () => {
    const response = await request(app).get('/auth/me');
    const body = response.body as ErrorBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('POST /auth/logout', () => {
  it('responde 200 para usuário autenticado', async () => {
    const response = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${await tokenFor(EMPLOYEE)}`);

    expect(response.status).toBe(200);
  });

  it('exige token', async () => {
    const response = await request(app).post('/auth/logout');

    expect(response.status).toBe(401);
  });
});

describe('rate limit no login', () => {
  it('bloqueia com 429 depois de 5 tentativas falhas', async () => {
    // App própria: o store do limiter é por instância do middleware.
    const isolated = createApp();

    for (let i = 0; i < 5; i += 1) {
      const { status } = await login(isolated, EMPLOYEE, 'errada');
      expect(status).toBe(401);
    }

    const bloqueada = await login(isolated, EMPLOYEE);

    expect(bloqueada.status).toBe(429);
    expect(bloqueada.error.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('login bem-sucedido não consome a cota', async () => {
    const isolated = createApp();

    for (let i = 0; i < 6; i += 1) {
      const { status } = await login(isolated, EMPLOYEE);
      expect(status).toBe(200);
    }
  });
});

// O guard sobre HTTP com o error handler no meio: os módulos da Fase 6 dependem
// dessa cadeia, e ainda não existe endpoint de domínio protegido.
describe('requireRole sobre HTTP', () => {
  const guarded = express();
  guarded.get(
    '/somente-manager',
    requireAuth,
    requireRole(Role.MANAGER, Role.ADMIN),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  guarded.use(errorHandler);

  async function get(token?: string) {
    const req = request(guarded).get('/somente-manager');
    const response = await (token === undefined
      ? req
      : req.set('Authorization', `Bearer ${token}`));

    return { status: response.status, body: response.body as ErrorBody };
  }

  it('permite MANAGER', async () => {
    expect((await get(await tokenFor(MANAGER))).status).toBe(200);
  });

  it('bloqueia EMPLOYEE com 403', async () => {
    const { status, body } = await get(await tokenFor(EMPLOYEE));

    expect(status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('bloqueia anônimo com 401', async () => {
    const { status, body } = await get();

    expect(status).toBe(401);
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });
});
