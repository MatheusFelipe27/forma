import { Role, TrainingStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { connectMongo, disconnectMongo } from '../../shared/database/mongoose';
import { prisma } from '../../shared/database/prisma';
import { hashPassword } from '../users/users.service';
import { AuditLog } from './audit-log.schema';

const PASSWORD = 'SenhaDeTeste@123';

const EMPLOYEE = 'employee@audit.test';
const MANAGER = 'manager@audit.test';
const ADMIN = 'admin@audit.test';
const EMAILS = [EMPLOYEE, MANAGER, ADMIN];

type ErrorBody = { error: { code: string } };
type AuditListBody = {
  total: number;
  data: {
    action: string;
    userId: string;
    userName: string;
    resourceType: string;
    resourceId: string;
    description: string;
    metadata?: Record<string, unknown>;
  }[];
};

const app = createApp();
const tokens = new Map<string, string>();
const userIds = new Map<string, string>();

let trainingId = '';

function auth(email: string) {
  return `Bearer ${tokens.get(email) ?? ''}`;
}

function userId(email: string) {
  return userIds.get(email) ?? '';
}

async function limparPostgres() {
  await prisma.enrollment.deleteMany({ where: { user: { email: { in: EMAILS } } } });
  await prisma.training.deleteMany({ where: { createdBy: { email: { in: EMAILS } } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

beforeAll(async () => {
  await connectMongo();
  await limparPostgres();

  const passwordHash = await hashPassword(PASSWORD);

  for (const [email, role, name] of [
    [EMPLOYEE, Role.EMPLOYEE, 'Employee Auditado'],
    [MANAGER, Role.MANAGER, 'Manager Auditor'],
    [ADMIN, Role.ADMIN, 'Admin Auditor'],
  ] as const) {
    const user = await prisma.user.create({ data: { email, name, role, passwordHash } });
    userIds.set(email, user.id);

    const response = await request(app).post('/auth/login').send({ email, password: PASSWORD });
    tokens.set(email, (response.body as { token: string }).token);
  }

  const training = await prisma.training.create({
    data: {
      title: 'Treinamento auditado',
      description: 'x',
      category: 'Compliance',
      instructor: 'Aurora',
      estimatedDuration: 30,
      status: TrainingStatus.DRAFT,
      createdById: userId(MANAGER),
      modules: { create: [{ title: 'M1', content: 'c', duration: 10, position: 1 }] },
    },
  });

  trainingId = training.id;
});

beforeEach(async () => {
  await AuditLog.deleteMany({ resourceId: { $in: [trainingId] } });
  await prisma.enrollment.deleteMany({ where: { user: { email: { in: EMAILS } } } });
  await prisma.training.update({
    where: { id: trainingId },
    data: { status: TrainingStatus.DRAFT },
  });
});

afterAll(async () => {
  await AuditLog.deleteMany({ resourceId: { $in: [trainingId] } });
  await limparPostgres();
  await disconnectMongo();
  await prisma.$disconnect();
});

function mudarStatus(status: TrainingStatus, email = MANAGER) {
  return request(app)
    .patch(`/trainings/${trainingId}/status`)
    .set('Authorization', auth(email))
    .send({ status });
}

function listarLogs(email = ADMIN, query = '') {
  return request(app).get(`/audit-logs${query}`).set('Authorization', auth(email));
}

describe('RBAC do endpoint de auditoria', () => {
  it.each([
    [EMPLOYEE, 403],
    [MANAGER, 403],
    [ADMIN, 200],
  ])('%s recebe %i em GET /audit-logs', async (email, status) => {
    const response = await listarLogs(email);

    expect(response.status).toBe(status);
  });

  it('anônimo recebe 401', async () => {
    expect((await request(app).get('/audit-logs')).status).toBe(401);
  });

  it('MANAGER recebe FORBIDDEN, não lista vazia', async () => {
    const response = await listarLogs(MANAGER);

    expect((response.body as ErrorBody).error.code).toBe('FORBIDDEN');
  });
});

describe('escrita de log nas ações auditadas', () => {
  it('publicar treinamento registra PUBLISH_TRAINING com autor e recurso', async () => {
    expect((await mudarStatus(TrainingStatus.PUBLISHED)).status).toBe(200);

    const response = await listarLogs(ADMIN, `?resourceId=${trainingId}`);
    const body = response.body as AuditListBody;

    expect(body.total).toBe(1);
    expect(body.data[0]).toMatchObject({
      action: 'PUBLISH_TRAINING',
      resourceType: 'Training',
      resourceId: trainingId,
      userId: userId(MANAGER),
      userName: 'Manager Auditor',
    });
    expect(body.data[0]?.metadata).toMatchObject({ from: 'DRAFT', to: 'PUBLISHED' });
  });

  it('arquivar registra ARCHIVE_TRAINING', async () => {
    await mudarStatus(TrainingStatus.PUBLISHED);
    await mudarStatus(TrainingStatus.ARCHIVED);

    const body = (await listarLogs(ADMIN, `?resourceId=${trainingId}&action=ARCHIVE_TRAINING`))
      .body as AuditListBody;

    expect(body.total).toBe(1);
    expect(body.data[0]?.metadata).toMatchObject({ from: 'PUBLISHED', to: 'ARCHIVED' });
  });

  it('atribuição em massa registra ASSIGN_TRAINING com o resultado do lote', async () => {
    await mudarStatus(TrainingStatus.PUBLISHED);

    await request(app)
      .post('/assignments')
      .set('Authorization', auth(MANAGER))
      .send({ trainingId, userIds: [userId(EMPLOYEE)] });

    const body = (await listarLogs(ADMIN, `?resourceId=${trainingId}&action=ASSIGN_TRAINING`))
      .body as AuditListBody;

    expect(body.total).toBe(1);
    expect(body.data[0]?.metadata).toMatchObject({ requested: 1, created: 1, skipped: 0 });
  });

  it('reatribuição registra o lote ignorado', async () => {
    await mudarStatus(TrainingStatus.PUBLISHED);

    const atribuir = () =>
      request(app)
        .post('/assignments')
        .set('Authorization', auth(MANAGER))
        .send({ trainingId, userIds: [userId(EMPLOYEE)] });

    await atribuir();
    await atribuir();

    const body = (await listarLogs(ADMIN, `?resourceId=${trainingId}&action=ASSIGN_TRAINING`))
      .body as AuditListBody;

    expect(body.total).toBe(2);
    expect(body.data.map((log) => log.metadata?.created)).toEqual([0, 1]);
  });

  // Ação recusada não gera registro.
  it('transição inválida não registra nada', async () => {
    await mudarStatus(TrainingStatus.PUBLISHED);
    await AuditLog.deleteMany({ resourceId: trainingId });

    expect((await mudarStatus(TrainingStatus.DRAFT)).status).toBe(409);

    expect(
      (await listarLogs(ADMIN, `?resourceId=${trainingId}`)).body as AuditListBody,
    ).toMatchObject({ total: 0 });
  });

  it('filtra por ação e por autor', async () => {
    await mudarStatus(TrainingStatus.PUBLISHED);

    const porAcao = (await listarLogs(ADMIN, '?action=PUBLISH_TRAINING')).body as AuditListBody;
    const porAutor = (await listarLogs(ADMIN, `?userId=${userId(MANAGER)}`)).body as AuditListBody;
    const porOutroAutor = (await listarLogs(ADMIN, `?userId=${userId(ADMIN)}`))
      .body as AuditListBody;

    expect(porAcao.total).toBeGreaterThanOrEqual(1);
    expect(porAutor.total).toBeGreaterThanOrEqual(1);
    expect(porOutroAutor.data.every((log) => log.userId === userId(ADMIN))).toBe(true);
  });
});
