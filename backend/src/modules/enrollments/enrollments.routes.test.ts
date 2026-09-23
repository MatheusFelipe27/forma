import { EnrollmentStatus, Role, TrainingStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { prisma } from '../../shared/database/prisma';
import { hashPassword } from '../users/users.service';

const PASSWORD = 'SenhaDeTeste@123';
const SUFFIX = '@enroll.test';

const EMPLOYEE = `employee${SUFFIX}`;
const OUTRO_EMPLOYEE = `outro${SUFFIX}`;
const MANAGER = `manager${SUFFIX}`;
const EMAILS = [EMPLOYEE, OUTRO_EMPLOYEE, MANAGER];

type ErrorBody = { error: { code: string; message: string } };
type CompleteBody = {
  alreadyCompleted: boolean;
  progress: { id: string; moduleId: string };
  enrollment: { status: EnrollmentStatus; progress: { percentage: number } };
};
type AssignBody = { requested: number; created: number; skipped: number };

const app = createApp();
const tokens = new Map<string, string>();
const userIds = new Map<string, string>();

let trainingId = '';
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
  await prisma.module.deleteMany({ where: { training: { createdBy: { email: { in: EMAILS } } } } });
  await prisma.training.deleteMany({ where: { createdBy: { email: { in: EMAILS } } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

beforeAll(async () => {
  await limpar();

  const passwordHash = await hashPassword(PASSWORD);

  for (const [email, role, name] of [
    [EMPLOYEE, Role.EMPLOYEE, 'Employee Matriculado'],
    [OUTRO_EMPLOYEE, Role.EMPLOYEE, 'Outro Employee'],
    [MANAGER, Role.MANAGER, 'Manager Atribuidor'],
  ] as const) {
    const user = await prisma.user.create({ data: { email, name, role, passwordHash } });
    userIds.set(email, user.id);

    const response = await request(app).post('/auth/login').send({ email, password: PASSWORD });
    tokens.set(email, (response.body as { token: string }).token);
  }

  // Treinamento publicado com 3 módulos, sem avaliação.
  const training = await prisma.training.create({
    data: {
      title: 'Treinamento de matrículas',
      description: 'descrição',
      category: 'Compliance',
      instructor: 'Aurora',
      estimatedDuration: 90,
      status: TrainingStatus.PUBLISHED,
      createdById: userId(MANAGER),
      modules: {
        create: [1, 2, 3].map((position) => ({
          title: `Módulo ${position}`,
          content: 'conteúdo',
          duration: 30,
          position,
        })),
      },
    },
    include: { modules: { orderBy: { position: 'asc' } } },
  });

  trainingId = training.id;
  moduleIds = training.modules.map((module) => module.id);
});

afterEach(async () => {
  await prisma.moduleProgress.deleteMany({
    where: { enrollment: { user: { email: { in: EMAILS } } } },
  });
  await prisma.enrollment.deleteMany({ where: { user: { email: { in: EMAILS } } } });
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

async function matricular(email: string, dueDate: string | null = null) {
  const response = await request(app)
    .post('/enrollments')
    .set('Authorization', auth(MANAGER))
    .send({ userId: userId(email), trainingId, dueDate });

  return (response.body as { enrollment: { id: string } }).enrollment.id;
}

function completar(enrollmentId: string, moduleId: string, email = EMPLOYEE) {
  return request(app)
    .post(`/enrollments/${enrollmentId}/modules/${moduleId}/complete`)
    .set('Authorization', auth(email));
}

// ---------------------------------------------------------------------------
// O teste obrigatório da seção 4.1 / ADR 004.
// ---------------------------------------------------------------------------

describe('concorrência na conclusão de módulo', () => {
  it.each([2, 5, 10])(
    '%i requisições simultâneas no mesmo módulo geram 1 registro e todas retornam 200',
    async (n) => {
      const enrollmentId = await matricular(EMPLOYEE);
      const moduleId = moduleIds[0] ?? '';

      const respostas = await Promise.all(
        Array.from({ length: n }, () => completar(enrollmentId, moduleId)),
      );

      expect(respostas.map((r) => r.status)).toEqual(Array.from({ length: n }, () => 200));

      const registros = await prisma.moduleProgress.count({
        where: { enrollmentId, moduleId },
      });
      expect(registros).toBe(1);

      // Exatamente uma requisição criou; as demais recuperaram o existente.
      const criacoes = respostas.filter((r) => !(r.body as CompleteBody).alreadyCompleted);
      expect(criacoes).toHaveLength(1);

      // Todas apontam para a mesma linha.
      const ids = new Set(respostas.map((r) => (r.body as CompleteBody).progress.id));
      expect(ids.size).toBe(1);
    },
  );

  it('conclusões simultâneas de módulos diferentes criam um registro cada', async () => {
    const enrollmentId = await matricular(EMPLOYEE);

    const respostas = await Promise.all(moduleIds.map((id) => completar(enrollmentId, id)));

    expect(respostas.every((r) => r.status === 200)).toBe(true);
    expect(await prisma.moduleProgress.count({ where: { enrollmentId } })).toBe(3);
  });

  it('requisição sequencial repetida também devolve 200', async () => {
    const enrollmentId = await matricular(EMPLOYEE);
    const moduleId = moduleIds[0] ?? '';

    const primeira = await completar(enrollmentId, moduleId);
    const segunda = await completar(enrollmentId, moduleId);

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect((primeira.body as CompleteBody).alreadyCompleted).toBe(false);
    expect((segunda.body as CompleteBody).alreadyCompleted).toBe(true);
    expect(await prisma.moduleProgress.count({ where: { enrollmentId, moduleId } })).toBe(1);
  });
});

describe('progresso calculado', () => {
  it('percentual acompanha os módulos concluídos e não é armazenado', async () => {
    const enrollmentId = await matricular(EMPLOYEE);

    const primeira = await completar(enrollmentId, moduleIds[0] ?? '');
    expect((primeira.body as CompleteBody).enrollment.progress.percentage).toBeCloseTo(33.3, 1);

    await completar(enrollmentId, moduleIds[1] ?? '');
    const terceira = await completar(enrollmentId, moduleIds[2] ?? '');

    expect((terceira.body as CompleteBody).enrollment.progress.percentage).toBe(100);
    expect((terceira.body as CompleteBody).enrollment.status).toBe(EnrollmentStatus.COMPLETED);

    // Nenhuma coluna de percentual existe na tabela.
    const row = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    expect(row).not.toHaveProperty('progress');
    expect(row).not.toHaveProperty('percentage');
  });

  it('apagar um registro de progresso reduz o percentual na leitura seguinte', async () => {
    const enrollmentId = await matricular(EMPLOYEE);
    await completar(enrollmentId, moduleIds[0] ?? '');

    await prisma.moduleProgress.deleteMany({ where: { enrollmentId } });

    const detalhe = await request(app)
      .get(`/enrollments/${enrollmentId}`)
      .set('Authorization', auth(EMPLOYEE));

    expect((detalhe.body as { progress: { percentage: number } }).progress.percentage).toBe(0);
  });

  it('OVERDUE é derivado do prazo e não gravado na coluna', async () => {
    const enrollmentId = await matricular(EMPLOYEE, '2020-01-01T00:00:00.000Z');
    await completar(enrollmentId, moduleIds[0] ?? '');

    const detalhe = await request(app)
      .get(`/enrollments/${enrollmentId}`)
      .set('Authorization', auth(EMPLOYEE));
    const body = detalhe.body as { status: EnrollmentStatus; storedStatus: EnrollmentStatus };

    expect(body.status).toBe(EnrollmentStatus.OVERDUE);
    expect(body.storedStatus).toBe(EnrollmentStatus.IN_PROGRESS);

    const row = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    expect(row.status).not.toBe(EnrollmentStatus.OVERDUE);
  });
});

describe('atribuição em massa', () => {
  it('reatribuir a quem já tem matrícula não duplica', async () => {
    const ids = [userId(EMPLOYEE), userId(OUTRO_EMPLOYEE)];

    const primeira = await request(app)
      .post('/assignments')
      .set('Authorization', auth(MANAGER))
      .send({ trainingId, userIds: ids });

    expect(primeira.status).toBe(200);
    expect(primeira.body as AssignBody).toMatchObject({ requested: 2, created: 2, skipped: 0 });

    const segunda = await request(app)
      .post('/assignments')
      .set('Authorization', auth(MANAGER))
      .send({ trainingId, userIds: ids });

    expect(segunda.status).toBe(200);
    expect(segunda.body as AssignBody).toMatchObject({ requested: 2, created: 0, skipped: 2 });

    expect(await prisma.enrollment.count({ where: { trainingId, userId: { in: ids } } })).toBe(2);
  });

  it('atribuição parcialmente nova cria só quem falta', async () => {
    await matricular(EMPLOYEE);

    const response = await request(app)
      .post('/assignments')
      .set('Authorization', auth(MANAGER))
      .send({ trainingId, userIds: [userId(EMPLOYEE), userId(OUTRO_EMPLOYEE)] });

    expect(response.body as AssignBody).toMatchObject({ requested: 2, created: 1, skipped: 1 });
  });

  it('ids repetidos no payload contam uma vez', async () => {
    const id = userId(EMPLOYEE);

    const response = await request(app)
      .post('/assignments')
      .set('Authorization', auth(MANAGER))
      .send({ trainingId, userIds: [id, id, id] });

    expect(response.body as AssignBody).toMatchObject({ requested: 1, created: 1, skipped: 0 });
  });

  it('usuário inexistente rejeita o lote inteiro com 400', async () => {
    const inexistente = '00000000-0000-4000-8000-000000000000';

    const response = await request(app)
      .post('/assignments')
      .set('Authorization', auth(MANAGER))
      .send({ trainingId, userIds: [userId(EMPLOYEE), inexistente] });

    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).error.code).toBe('USERS_NOT_FOUND');
    expect(await prisma.enrollment.count({ where: { trainingId } })).toBe(0);
  });

  it('EMPLOYEE recebe 403 ao tentar atribuir', async () => {
    const response = await request(app)
      .post('/assignments')
      .set('Authorization', auth(EMPLOYEE))
      .send({ trainingId, userIds: [userId(EMPLOYEE)] });

    expect(response.status).toBe(403);
  });
});

describe('regras de status do treinamento na matrícula', () => {
  it('treinamento em rascunho recusa matrícula com 409', async () => {
    const rascunho = await prisma.training.create({
      data: {
        title: 'Rascunho',
        description: 'x',
        category: 'y',
        instructor: 'z',
        estimatedDuration: 10,
        status: TrainingStatus.DRAFT,
        createdById: userId(MANAGER),
      },
    });

    const response = await request(app)
      .post('/enrollments')
      .set('Authorization', auth(MANAGER))
      .send({ userId: userId(EMPLOYEE), trainingId: rascunho.id });

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error.code).toBe('TRAINING_NOT_OPEN_FOR_ENROLLMENT');
  });

  it('treinamento arquivado recusa nova matrícula mas mantém a existente', async () => {
    const enrollmentId = await matricular(EMPLOYEE);

    await prisma.training.update({
      where: { id: trainingId },
      data: { status: TrainingStatus.ARCHIVED },
    });

    const novaMatricula = await request(app)
      .post('/enrollments')
      .set('Authorization', auth(MANAGER))
      .send({ userId: userId(OUTRO_EMPLOYEE), trainingId });

    expect(novaMatricula.status).toBe(409);

    // A matrícula que já existia continua utilizável.
    const conclusao = await completar(enrollmentId, moduleIds[0] ?? '');
    expect(conclusao.status).toBe(200);

    await prisma.training.update({
      where: { id: trainingId },
      data: { status: TrainingStatus.PUBLISHED },
    });
  });

  it('matrícula individual repetida devolve 200 com a existente', async () => {
    const primeira = await request(app)
      .post('/enrollments')
      .set('Authorization', auth(MANAGER))
      .send({ userId: userId(EMPLOYEE), trainingId });

    const segunda = await request(app)
      .post('/enrollments')
      .set('Authorization', auth(MANAGER))
      .send({ userId: userId(EMPLOYEE), trainingId });

    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(200);
    expect((segunda.body as { alreadyEnrolled: boolean }).alreadyEnrolled).toBe(true);
    expect(await prisma.enrollment.count({ where: { trainingId, userId: userId(EMPLOYEE) } })).toBe(
      1,
    );
  });
});

describe('autorização de leitura e conclusão', () => {
  it('EMPLOYEE só vê as próprias matrículas', async () => {
    await matricular(EMPLOYEE);
    await matricular(OUTRO_EMPLOYEE);

    const response = await request(app)
      .get('/enrollments?limit=100')
      .set('Authorization', auth(EMPLOYEE));
    const body = response.body as { data: { user: { id: string } }[] };

    expect(response.status).toBe(200);
    expect(body.data.every((item) => item.user.id === userId(EMPLOYEE))).toBe(true);
  });

  it('EMPLOYEE não contorna o recorte pedindo userId de outro', async () => {
    await matricular(OUTRO_EMPLOYEE);

    const response = await request(app)
      .get(`/enrollments?userId=${userId(OUTRO_EMPLOYEE)}`)
      .set('Authorization', auth(EMPLOYEE));

    expect((response.body as { total: number }).total).toBe(0);
  });

  it('EMPLOYEE recebe 404 no detalhe de matrícula alheia', async () => {
    const alheia = await matricular(OUTRO_EMPLOYEE);

    const response = await request(app)
      .get(`/enrollments/${alheia}`)
      .set('Authorization', auth(EMPLOYEE));

    expect(response.status).toBe(404);
  });

  it('MANAGER vê matrícula de outra pessoa', async () => {
    const alheia = await matricular(EMPLOYEE);

    const response = await request(app)
      .get(`/enrollments/${alheia}`)
      .set('Authorization', auth(MANAGER));

    expect(response.status).toBe(200);
  });

  it('MANAGER não conclui módulo no lugar do funcionário', async () => {
    const enrollmentId = await matricular(EMPLOYEE);

    const response = await completar(enrollmentId, moduleIds[0] ?? '', MANAGER);

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error.code).toBe('NOT_ENROLLMENT_OWNER');
    expect(await prisma.moduleProgress.count({ where: { enrollmentId } })).toBe(0);
  });

  it('módulo de outro treinamento devolve 404', async () => {
    const enrollmentId = await matricular(EMPLOYEE);
    const outro = await prisma.module.create({
      data: {
        trainingId: (
          await prisma.training.create({
            data: {
              title: 'Outro',
              description: 'x',
              category: 'y',
              instructor: 'z',
              estimatedDuration: 10,
              status: TrainingStatus.PUBLISHED,
              createdById: userId(MANAGER),
            },
          })
        ).id,
        title: 'Módulo alheio',
        content: 'c',
        duration: 10,
        position: 1,
      },
    });

    const response = await completar(enrollmentId, outro.id);

    expect(response.status).toBe(404);
    expect((response.body as ErrorBody).error.code).toBe('MODULE_NOT_FOUND');
  });
});
