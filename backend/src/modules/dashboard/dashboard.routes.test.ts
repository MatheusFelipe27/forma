import { EnrollmentStatus, Role, TrainingStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { prisma } from '../../shared/database/prisma';
import { hashPassword } from '../users/users.service';

const PASSWORD = 'SenhaDeTeste@123';

const MANAGER = 'manager@dash.test';
const EM_DIA = 'emdia@dash.test';
const ATRASADO = 'atrasado@dash.test';
const CONCLUIDO = 'concluido@dash.test';
const FORA_DA_EQUIPE = 'fora@dash.test';
const EMAILS = [MANAGER, EM_DIA, ATRASADO, CONCLUIDO, FORA_DA_EQUIPE];

type Tally = {
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  overdue: number;
};
type MeBody = {
  tally: Tally;
  averageProgress: number;
  needsAttention: { status: EnrollmentStatus }[];
};
type TeamBody = {
  teamSize: number;
  tally: Tally;
  members: { id: string; name: string; tally: Tally; averageProgress: number }[];
};

const app = createApp();
const tokens = new Map<string, string>();
const userIds = new Map<string, string>();

let moduleIds: string[] = [];

function auth(email: string) {
  return `Bearer ${tokens.get(email) ?? ''}`;
}

function userId(email: string) {
  return userIds.get(email) ?? '';
}

async function limpar() {
  await prisma.moduleProgress.deleteMany({
    where: { enrollment: { user: { email: { in: EMAILS } } } },
  });
  await prisma.enrollment.deleteMany({ where: { user: { email: { in: EMAILS } } } });
  await prisma.training.deleteMany({ where: { createdBy: { email: { in: EMAILS } } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

beforeAll(async () => {
  await limpar();

  const passwordHash = await hashPassword(PASSWORD);

  const manager = await prisma.user.create({
    data: { email: MANAGER, name: 'Manager Painel', role: Role.MANAGER, passwordHash },
  });
  userIds.set(MANAGER, manager.id);

  for (const [email, name, comManager] of [
    [EM_DIA, 'Em Dia', true],
    [ATRASADO, 'Atrasado', true],
    [CONCLUIDO, 'Concluido', true],
    [FORA_DA_EQUIPE, 'Fora da Equipe', false],
  ] as const) {
    const user = await prisma.user.create({
      data: {
        email,
        name,
        role: Role.EMPLOYEE,
        passwordHash,
        ...(comManager ? { managerId: manager.id } : {}),
      },
    });
    userIds.set(email, user.id);
  }

  for (const email of EMAILS) {
    const response = await request(app).post('/auth/login').send({ email, password: PASSWORD });
    tokens.set(email, (response.body as { token: string }).token);
  }

  // Treinamento de 4 módulos, sem avaliação.
  const training = await prisma.training.create({
    data: {
      title: 'Treinamento do painel',
      description: 'x',
      category: 'Compliance',
      instructor: 'Aurora',
      estimatedDuration: 120,
      status: TrainingStatus.PUBLISHED,
      createdById: manager.id,
      modules: {
        create: [1, 2, 3, 4].map((position) => ({
          title: `M${position}`,
          content: 'c',
          duration: 30,
          position,
        })),
      },
    },
    include: { modules: { orderBy: { position: 'asc' } } },
  });

  moduleIds = training.modules.map((module) => module.id);

  const ontem = new Date(Date.now() - 86_400_000);
  const amanha = new Date(Date.now() + 86_400_000);

  // 2 de 4 módulos, no prazo → IN_PROGRESS (50%)
  const emDia = await prisma.enrollment.create({
    data: { userId: userId(EM_DIA), trainingId: training.id, dueDate: amanha },
  });
  await prisma.moduleProgress.createMany({
    data: moduleIds.slice(0, 2).map((moduleId) => ({ enrollmentId: emDia.id, moduleId })),
  });

  // 1 de 4 módulos, prazo vencido → OVERDUE (25%)
  const atrasado = await prisma.enrollment.create({
    data: { userId: userId(ATRASADO), trainingId: training.id, dueDate: ontem },
  });
  await prisma.moduleProgress.createMany({
    data: moduleIds.slice(0, 1).map((moduleId) => ({ enrollmentId: atrasado.id, moduleId })),
  });

  // 4 de 4 módulos, prazo vencido → COMPLETED, não OVERDUE (100%)
  const concluido = await prisma.enrollment.create({
    data: { userId: userId(CONCLUIDO), trainingId: training.id, dueDate: ontem },
  });
  await prisma.moduleProgress.createMany({
    data: moduleIds.map((moduleId) => ({ enrollmentId: concluido.id, moduleId })),
  });

  // Fora da equipe do manager, para provar o recorte.
  await prisma.enrollment.create({
    data: { userId: userId(FORA_DA_EQUIPE), trainingId: training.id, dueDate: ontem },
  });
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe('GET /dashboard/me', () => {
  it.each([
    [EM_DIA, EnrollmentStatus.IN_PROGRESS, 50],
    [ATRASADO, EnrollmentStatus.OVERDUE, 25],
    [CONCLUIDO, EnrollmentStatus.COMPLETED, 100],
  ])('%s vê o próprio progresso', async (email, status, progresso) => {
    const response = await request(app).get('/dashboard/me').set('Authorization', auth(email));
    const body = response.body as MeBody;

    expect(response.status).toBe(200);
    expect(body.tally.total).toBe(1);
    expect(body.averageProgress).toBe(progresso);

    const contagem: Record<string, number> = {
      [EnrollmentStatus.IN_PROGRESS]: body.tally.inProgress,
      [EnrollmentStatus.OVERDUE]: body.tally.overdue,
      [EnrollmentStatus.COMPLETED]: body.tally.completed,
    };
    expect(contagem[status]).toBe(1);
  });

  it('atrasado aparece em needsAttention; concluído não', async () => {
    const atrasado = (await request(app).get('/dashboard/me').set('Authorization', auth(ATRASADO)))
      .body as MeBody;
    const concluido = (
      await request(app).get('/dashboard/me').set('Authorization', auth(CONCLUIDO))
    ).body as MeBody;

    expect(atrasado.needsAttention).toHaveLength(1);
    expect(atrasado.needsAttention[0]?.status).toBe(EnrollmentStatus.OVERDUE);
    expect(concluido.needsAttention).toEqual([]);
  });

  it('exige autenticação', async () => {
    expect((await request(app).get('/dashboard/me')).status).toBe(401);
  });
});

describe('GET /dashboard/team', () => {
  it('MANAGER vê os três subordinados e o total da equipe', async () => {
    const response = await request(app).get('/dashboard/team').set('Authorization', auth(MANAGER));
    const body = response.body as TeamBody;

    expect(response.status).toBe(200);
    expect(body.teamSize).toBe(3);
    expect(body.tally).toMatchObject({ total: 3, inProgress: 1, overdue: 1, completed: 1 });

    const nomes = body.members.map((member) => member.name).sort();
    expect(nomes).toEqual(['Atrasado', 'Concluido', 'Em Dia']);
  });

  it('cada membro traz a própria contagem e média', async () => {
    const body = (await request(app).get('/dashboard/team').set('Authorization', auth(MANAGER)))
      .body as TeamBody;

    const atrasado = body.members.find((member) => member.name === 'Atrasado');
    expect(atrasado?.tally).toMatchObject({ total: 1, overdue: 1 });
    expect(atrasado?.averageProgress).toBe(25);
  });

  // O recorte da equipe vem do managerId, não de um filtro do cliente.
  it('não inclui quem está fora da equipe', async () => {
    const body = (await request(app).get('/dashboard/team').set('Authorization', auth(MANAGER)))
      .body as TeamBody;

    expect(body.members.map((member) => member.id)).not.toContain(userId(FORA_DA_EQUIPE));
  });

  it('EMPLOYEE recebe 403', async () => {
    const response = await request(app).get('/dashboard/team').set('Authorization', auth(EM_DIA));

    expect(response.status).toBe(403);
  });
});
