import { Role, TrainingStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { prisma } from '../../shared/database/prisma';
import { hashPassword } from '../users/users.service';

const PASSWORD = 'SenhaDeTeste@123';

const EMPLOYEE = 'rbac.employee@forma.test';
const MANAGER = 'rbac.manager@forma.test';
const ADMIN = 'rbac.admin@forma.test';
const EMAILS = [EMPLOYEE, MANAGER, ADMIN];

type ErrorBody = { error: { code: string; message: string } };
type TrainingBody = { id: string; status: TrainingStatus; title: string };
type ListBody = { data: TrainingBody[]; total: number };

const app = createApp();
const tokens = new Map<string, string>();

const novoTreinamento = {
  title: 'Treinamento de RBAC',
  description: 'descrição',
  category: 'Compliance',
  instructor: 'Aurora',
  estimatedDuration: 60,
};

function auth(email: string) {
  return `Bearer ${tokens.get(email) ?? ''}`;
}

async function createTrainingAs(email: string) {
  const response = await request(app)
    .post('/trainings')
    .set('Authorization', auth(email))
    .send(novoTreinamento);

  return response.body as TrainingBody;
}

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);

  await prisma.training.deleteMany({ where: { createdBy: { email: { in: EMAILS } } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.user.createMany({
    data: [
      { email: EMPLOYEE, name: 'RBAC Employee', role: Role.EMPLOYEE, passwordHash },
      { email: MANAGER, name: 'RBAC Manager', role: Role.MANAGER, passwordHash },
      { email: ADMIN, name: 'RBAC Admin', role: Role.ADMIN, passwordHash },
    ],
  });

  for (const email of EMAILS) {
    const response = await request(app).post('/auth/login').send({ email, password: PASSWORD });

    tokens.set(email, (response.body as { token: string }).token);
  }
});

afterAll(async () => {
  await prisma.training.deleteMany({ where: { createdBy: { email: { in: EMAILS } } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

describe('RBAC de escrita', () => {
  it.each([
    ['POST', '/trainings'],
    ['PATCH', '/trainings/00000000-0000-4000-8000-000000000000'],
    ['PATCH', '/trainings/00000000-0000-4000-8000-000000000000/status'],
    ['POST', '/trainings/00000000-0000-4000-8000-000000000000/modules'],
    [
      'DELETE',
      '/trainings/00000000-0000-4000-8000-000000000000/modules/00000000-0000-4000-8000-000000000001',
    ],
  ])('EMPLOYEE recebe 403 em %s %s', async (method, path) => {
    const response = await request(app)
      [method.toLowerCase() as 'post' | 'patch' | 'delete'](path)
      .set('Authorization', auth(EMPLOYEE))
      .send(novoTreinamento);

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error.code).toBe('FORBIDDEN');
  });

  it.each([MANAGER, ADMIN])('%s cria treinamento (201, nasce como DRAFT)', async (email) => {
    const response = await request(app)
      .post('/trainings')
      .set('Authorization', auth(email))
      .send(novoTreinamento);

    expect(response.status).toBe(201);
    expect((response.body as TrainingBody).status).toBe(TrainingStatus.DRAFT);
  });

  it('anônimo recebe 401 na leitura', async () => {
    const response = await request(app).get('/trainings');

    expect(response.status).toBe(401);
  });
});

describe('leitura por papel', () => {
  it('EMPLOYEE não enxerga rascunhos na listagem', async () => {
    const rascunho = await createTrainingAs(MANAGER);

    const response = await request(app)
      .get('/trainings?limit=100')
      .set('Authorization', auth(EMPLOYEE));
    const body = response.body as ListBody;

    expect(response.status).toBe(200);
    expect(body.data.map((t) => t.id)).not.toContain(rascunho.id);
  });

  it('EMPLOYEE recebe 404 ao abrir rascunho pelo id', async () => {
    const rascunho = await createTrainingAs(MANAGER);

    const response = await request(app)
      .get(`/trainings/${rascunho.id}`)
      .set('Authorization', auth(EMPLOYEE));

    expect(response.status).toBe(404);
    expect((response.body as ErrorBody).error.code).toBe('TRAINING_NOT_FOUND');
  });

  it('MANAGER abre o próprio rascunho', async () => {
    const rascunho = await createTrainingAs(MANAGER);

    const response = await request(app)
      .get(`/trainings/${rascunho.id}`)
      .set('Authorization', auth(MANAGER));

    expect(response.status).toBe(200);
  });
});

describe('ciclo de vida completo', () => {
  it('rascunho → módulo → publicado → visível para EMPLOYEE → arquivado', async () => {
    const training = await createTrainingAs(ADMIN);

    const semModulos = await request(app)
      .patch(`/trainings/${training.id}/status`)
      .set('Authorization', auth(ADMIN))
      .send({ status: TrainingStatus.PUBLISHED });

    expect(semModulos.status).toBe(409);
    expect((semModulos.body as ErrorBody).error.code).toBe('TRAINING_WITHOUT_MODULES');

    const modulo = await request(app)
      .post(`/trainings/${training.id}/modules`)
      .set('Authorization', auth(ADMIN))
      .send({ title: 'Primeiro módulo', content: 'conteúdo', duration: 30 });

    expect(modulo.status).toBe(201);
    expect((modulo.body as { position: number }).position).toBe(1);

    const publicado = await request(app)
      .patch(`/trainings/${training.id}/status`)
      .set('Authorization', auth(ADMIN))
      .send({ status: TrainingStatus.PUBLISHED });

    expect(publicado.status).toBe(200);

    const visivel = await request(app)
      .get(`/trainings/${training.id}`)
      .set('Authorization', auth(EMPLOYEE));

    expect(visivel.status).toBe(200);

    const edicaoBloqueada = await request(app)
      .patch(`/trainings/${training.id}`)
      .set('Authorization', auth(ADMIN))
      .send({ title: 'Tentando editar depois de publicar' });

    expect(edicaoBloqueada.status).toBe(409);
    expect((edicaoBloqueada.body as ErrorBody).error.code).toBe('TRAINING_NOT_EDITABLE');

    const arquivado = await request(app)
      .patch(`/trainings/${training.id}/status`)
      .set('Authorization', auth(ADMIN))
      .send({ status: TrainingStatus.ARCHIVED });

    expect(arquivado.status).toBe(200);

    const aindaVisivel = await request(app)
      .get(`/trainings/${training.id}`)
      .set('Authorization', auth(EMPLOYEE));

    expect(aindaVisivel.status).toBe(200);
  });
});

describe('validação', () => {
  it('rejeita corpo inválido com 400', async () => {
    const response = await request(app)
      .post('/trainings')
      .set('Authorization', auth(MANAGER))
      .send({ title: 'ab', estimatedDuration: -1 });

    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejeita id fora do formato uuid com 400', async () => {
    const response = await request(app)
      .get('/trainings/nao-e-uuid')
      .set('Authorization', auth(MANAGER));

    expect(response.status).toBe(400);
  });
});
