import { EnrollmentStatus, Role, TrainingStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { prisma } from '../../shared/database/prisma';
import { hashPassword } from '../users/users.service';

const PASSWORD = 'SenhaDeTeste@123';

const EMPLOYEE = 'employee@assess.test';
const MANAGER = 'manager@assess.test';
const EMAILS = [EMPLOYEE, MANAGER];

type ErrorBody = { error: { code: string; message: string; details?: unknown } };
type AttemptBody = {
  attempt: { score: number; passed: boolean; correctCount: number; totalQuestions: number };
  attemptsUsed: number;
  attemptsAllowed: number;
  attemptsRemaining: number;
  enrollment: { status: EnrollmentStatus; progress: { percentage: number } };
};
type AssessmentBody = {
  id: string;
  minScore: number;
  questions: { id: string; text: string; answers: { id: string; text: string }[] }[];
};

const app = createApp();
const tokens = new Map<string, string>();
const userIds = new Map<string, string>();

let trainingId = '';
let moduleIds: string[] = [];
let assessmentId = '';
/** questionId → { correta, errada } */
const gabarito = new Map<string, { correta: string; errada: string }>();

function auth(email: string) {
  return `Bearer ${tokens.get(email) ?? ''}`;
}

function userId(email: string) {
  return userIds.get(email) ?? '';
}

async function limpar() {
  await prisma.attemptAnswer.deleteMany({
    where: { attempt: { enrollment: { user: { email: { in: EMAILS } } } } },
  });
  await prisma.assessmentAttempt.deleteMany({
    where: { enrollment: { user: { email: { in: EMAILS } } } },
  });
  await prisma.moduleProgress.deleteMany({
    where: { enrollment: { user: { email: { in: EMAILS } } } },
  });
  await prisma.enrollment.deleteMany({ where: { user: { email: { in: EMAILS } } } });
  // Assessment não tem onDelete: Cascade a partir de Training, então sai antes.
  await prisma.assessment.deleteMany({
    where: { training: { createdBy: { email: { in: EMAILS } } } },
  });
  await prisma.training.deleteMany({ where: { createdBy: { email: { in: EMAILS } } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

beforeAll(async () => {
  await limpar();

  const passwordHash = await hashPassword(PASSWORD);

  for (const [email, role, name] of [
    [EMPLOYEE, Role.EMPLOYEE, 'Employee Avaliado'],
    [MANAGER, Role.MANAGER, 'Manager Autor'],
  ] as const) {
    const user = await prisma.user.create({ data: { email, name, role, passwordHash } });
    userIds.set(email, user.id);

    const response = await request(app).post('/auth/login').send({ email, password: PASSWORD });
    tokens.set(email, (response.body as { token: string }).token);
  }

  // 2 módulos + avaliação de 4 perguntas, minScore 70, 2 tentativas.
  const training = await prisma.training.create({
    data: {
      title: 'Treinamento com avaliação',
      description: 'descrição',
      category: 'Compliance',
      instructor: 'Aurora',
      estimatedDuration: 60,
      status: TrainingStatus.PUBLISHED,
      createdById: userId(MANAGER),
      modules: {
        create: [1, 2].map((position) => ({
          title: `Módulo ${position}`,
          content: 'conteúdo',
          duration: 30,
          position,
        })),
      },
      assessment: {
        create: {
          minScore: 70,
          maxAttempts: 2,
          questions: {
            create: [1, 2, 3, 4].map((position) => ({
              text: `Pergunta ${position}`,
              position,
              answers: {
                create: [
                  { text: 'alternativa correta', isCorrect: true },
                  { text: 'alternativa incorreta', isCorrect: false },
                ],
              },
            })),
          },
        },
      },
    },
    include: {
      modules: { orderBy: { position: 'asc' } },
      assessment: { include: { questions: { include: { answers: true } } } },
    },
  });

  trainingId = training.id;
  moduleIds = training.modules.map((module) => module.id);
  assessmentId = training.assessment?.id ?? '';

  for (const question of training.assessment?.questions ?? []) {
    gabarito.set(question.id, {
      correta: question.answers.find((answer) => answer.isCorrect)?.id ?? '',
      errada: question.answers.find((answer) => !answer.isCorrect)?.id ?? '',
    });
  }
});

beforeEach(async () => {
  await prisma.attemptAnswer.deleteMany({
    where: { attempt: { enrollment: { user: { email: { in: EMAILS } } } } },
  });
  await prisma.assessmentAttempt.deleteMany({
    where: { enrollment: { user: { email: { in: EMAILS } } } },
  });
  await prisma.moduleProgress.deleteMany({
    where: { enrollment: { user: { email: { in: EMAILS } } } },
  });
  await prisma.enrollment.deleteMany({ where: { user: { email: { in: EMAILS } } } });
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

async function matricular() {
  const enrollment = await prisma.enrollment.create({
    data: { userId: userId(EMPLOYEE), trainingId },
  });

  return enrollment.id;
}

function submeter(enrollmentId: string, acertos: number, email = EMPLOYEE) {
  const answers = [...gabarito.entries()].map(([questionId, opcoes], index) => ({
    questionId,
    answerId: index < acertos ? opcoes.correta : opcoes.errada,
  }));

  return request(app)
    .post(`/enrollments/${enrollmentId}/attempts`)
    .set('Authorization', auth(email))
    .send({ answers });
}

function concluirModulo(enrollmentId: string, moduleId: string) {
  return request(app)
    .post(`/enrollments/${enrollmentId}/modules/${moduleId}/complete`)
    .set('Authorization', auth(EMPLOYEE));
}

// ---------------------------------------------------------------------------
// O gabarito não pode chegar ao EMPLOYEE.
// ---------------------------------------------------------------------------

describe('gabarito não vaza para o EMPLOYEE', () => {
  it('GET da avaliação omite isCorrect no corpo bruto', async () => {
    const response = await request(app)
      .get(`/trainings/${trainingId}/assessment`)
      .set('Authorization', auth(EMPLOYEE));

    expect(response.status).toBe(200);
    expect(response.text).not.toContain('isCorrect');

    const body = response.body as AssessmentBody;
    expect(body.questions).toHaveLength(4);
    expect(body.questions[0]?.answers).toHaveLength(2);

    // Nenhuma alternativa carrega a propriedade, nem como false.
    for (const question of body.questions) {
      for (const answer of question.answers) {
        expect(answer).not.toHaveProperty('isCorrect');
        expect(Object.keys(answer).sort()).toEqual(['id', 'text']);
      }
    }
  });

  it('MANAGER recebe o gabarito', async () => {
    const response = await request(app)
      .get(`/trainings/${trainingId}/assessment`)
      .set('Authorization', auth(MANAGER));

    expect(response.status).toBe(200);
    expect(response.text).toContain('isCorrect');
  });

  it('resposta da tentativa não revela quais perguntas foram erradas', async () => {
    const enrollmentId = await matricular();

    const response = await submeter(enrollmentId, 2);

    expect(response.text).not.toContain('isCorrect');
    expect(response.text).not.toContain('questionId');
    expect(response.body as AttemptBody).toMatchObject({
      attempt: { correctCount: 2, totalQuestions: 4 },
    });
  });
});

describe('score calculado no backend', () => {
  it.each([
    [4, 100, true],
    [3, 75, true],
    [2, 50, false],
    [0, 0, false],
  ])('%i acertos de 4 → score %f, aprovado: %s', async (acertos, score, passed) => {
    const enrollmentId = await matricular();

    const response = await submeter(enrollmentId, acertos);

    expect(response.status).toBe(201);
    expect((response.body as AttemptBody).attempt).toMatchObject({ score, passed });
  });

  it('o score gravado no banco é o calculado pelo backend', async () => {
    const enrollmentId = await matricular();
    await submeter(enrollmentId, 3);

    const attempt = await prisma.assessmentAttempt.findFirstOrThrow({ where: { enrollmentId } });

    expect(attempt.score).toBe(75);
    expect(attempt.passed).toBe(true);
    expect(attempt.assessmentId).toBe(assessmentId);
  });

  it('as respostas enviadas ficam registradas na tentativa', async () => {
    const enrollmentId = await matricular();
    await submeter(enrollmentId, 3);

    const attempt = await prisma.assessmentAttempt.findFirstOrThrow({
      where: { enrollmentId },
      include: { answers: true },
    });

    expect(attempt.answers).toHaveLength(4);
  });

  it('submissão incompleta é recusada com 400', async () => {
    const enrollmentId = await matricular();
    const [primeira] = [...gabarito.entries()];

    const response = await request(app)
      .post(`/enrollments/${enrollmentId}/attempts`)
      .set('Authorization', auth(EMPLOYEE))
      .send({ answers: [{ questionId: primeira?.[0], answerId: primeira?.[1].correta }] });

    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).error.code).toBe('INCOMPLETE_SUBMISSION');
    expect(await prisma.assessmentAttempt.count({ where: { enrollmentId } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tentativas esgotadas → 403, desbloqueio por MANAGER/ADMIN.
// ---------------------------------------------------------------------------

describe('tentativas esgotadas e desbloqueio', () => {
  it('esgotar maxAttempts sem aprovação bloqueia com 403 e mensagem clara', async () => {
    const enrollmentId = await matricular();

    expect((await submeter(enrollmentId, 1)).status).toBe(201);
    expect((await submeter(enrollmentId, 1)).status).toBe(201);

    const bloqueada = await submeter(enrollmentId, 4);

    expect(bloqueada.status).toBe(403);

    const body = bloqueada.body as ErrorBody;
    expect(body.error.code).toBe('ATTEMPTS_EXHAUSTED');
    expect(body.error.message).toContain('2/2');
    expect(body.error.message).toContain('gestor');
    expect(body.error.details).toMatchObject({ attemptsUsed: 2, attemptsAllowed: 2 });

    // Bloqueio não gravou tentativa extra.
    expect(await prisma.assessmentAttempt.count({ where: { enrollmentId } })).toBe(2);
  });

  it('GET de tentativas reporta o bloqueio', async () => {
    const enrollmentId = await matricular();
    await submeter(enrollmentId, 1);
    await submeter(enrollmentId, 1);

    const response = await request(app)
      .get(`/enrollments/${enrollmentId}/attempts`)
      .set('Authorization', auth(EMPLOYEE));

    expect(response.body as { blocked: boolean; attemptsRemaining: number }).toMatchObject({
      blocked: true,
      attemptsRemaining: 0,
    });
  });

  it('MANAGER desbloqueia e o funcionário consegue aprovar', async () => {
    const enrollmentId = await matricular();
    await submeter(enrollmentId, 1);
    await submeter(enrollmentId, 1);

    const desbloqueio = await request(app)
      .post(`/enrollments/${enrollmentId}/attempts/unlock`)
      .set('Authorization', auth(MANAGER))
      .send({ extraAttempts: 1 });

    expect(desbloqueio.status).toBe(200);
    expect(desbloqueio.body as { attemptsAllowed: number }).toMatchObject({ attemptsAllowed: 3 });

    const aprovada = await submeter(enrollmentId, 4);

    expect(aprovada.status).toBe(201);
    expect((aprovada.body as AttemptBody).attempt.passed).toBe(true);

    // Histórico das reprovações preservado.
    expect(await prisma.assessmentAttempt.count({ where: { enrollmentId } })).toBe(3);
  });

  // O limite não tem constraint única para apoiá-lo — tentativas repetidas são
  // legítimas. Sem o lock de linha do ADR 010, submissões simultâneas passariam
  // do teto. maxAttempts = 2 neste treinamento.
  it('submissões simultâneas não passam do limite de tentativas', async () => {
    const enrollmentId = await matricular();

    const respostas = await Promise.all(Array.from({ length: 6 }, () => submeter(enrollmentId, 1)));

    const criadas = respostas.filter((r) => r.status === 201);
    const bloqueadas = respostas.filter((r) => r.status === 403);

    expect(criadas).toHaveLength(2);
    expect(bloqueadas).toHaveLength(4);
    expect(bloqueadas.every((r) => (r.body as ErrorBody).error.code === 'ATTEMPTS_EXHAUSTED')).toBe(
      true,
    );
    expect(await prisma.assessmentAttempt.count({ where: { enrollmentId } })).toBe(2);
  });

  it('EMPLOYEE não desbloqueia a própria matrícula', async () => {
    const enrollmentId = await matricular();

    const response = await request(app)
      .post(`/enrollments/${enrollmentId}/attempts/unlock`)
      .set('Authorization', auth(EMPLOYEE))
      .send({ extraAttempts: 1 });

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error.code).toBe('FORBIDDEN');
  });

  it('nova tentativa depois de aprovado é recusada com 409', async () => {
    const enrollmentId = await matricular();
    await submeter(enrollmentId, 4);

    const response = await submeter(enrollmentId, 4);

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error.code).toBe('ASSESSMENT_ALREADY_PASSED');
  });

  it('MANAGER não responde pelo funcionário', async () => {
    const enrollmentId = await matricular();

    const response = await submeter(enrollmentId, 4, MANAGER);

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error.code).toBe('NOT_ENROLLMENT_OWNER');
  });
});

// ---------------------------------------------------------------------------
// Fecha o canCompleteTraining() do Pedaço 2.
// ---------------------------------------------------------------------------

describe('fluxo completo até COMPLETED', () => {
  it('módulos + avaliação aprovada concluem o treinamento', async () => {
    const enrollmentId = await matricular();

    const primeiro = await concluirModulo(enrollmentId, moduleIds[0] ?? '');
    expect((primeiro.body as AttemptBody).enrollment.status).toBe(EnrollmentStatus.IN_PROGRESS);

    // Todos os módulos concluídos, mas avaliação pendente: ainda não concluiu.
    const segundo = await concluirModulo(enrollmentId, moduleIds[1] ?? '');
    const aposModulos = segundo.body as AttemptBody;
    expect(aposModulos.enrollment.progress.percentage).toBe(100);
    expect(aposModulos.enrollment.status).toBe(EnrollmentStatus.IN_PROGRESS);

    // Reprovar não conclui.
    const reprovada = await submeter(enrollmentId, 2);
    expect((reprovada.body as AttemptBody).enrollment.status).toBe(EnrollmentStatus.IN_PROGRESS);

    // Aprovar conclui.
    const aprovada = await submeter(enrollmentId, 4);
    expect((aprovada.body as AttemptBody).enrollment.status).toBe(EnrollmentStatus.COMPLETED);

    const detalhe = await request(app)
      .get(`/enrollments/${enrollmentId}`)
      .set('Authorization', auth(EMPLOYEE));

    expect((detalhe.body as { status: EnrollmentStatus }).status).toBe(EnrollmentStatus.COMPLETED);
    expect(
      (await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).status,
    ).toBe(EnrollmentStatus.COMPLETED);
  });

  it('aprovar antes de terminar os módulos não conclui', async () => {
    const enrollmentId = await matricular();
    await concluirModulo(enrollmentId, moduleIds[0] ?? '');

    const aprovada = await submeter(enrollmentId, 4);

    expect((aprovada.body as AttemptBody).attempt.passed).toBe(true);
    expect((aprovada.body as AttemptBody).enrollment.status).toBe(EnrollmentStatus.IN_PROGRESS);
  });
});

// ---------------------------------------------------------------------------
// Autoria: MANAGER/ADMIN, só em DRAFT.
// ---------------------------------------------------------------------------

describe('autoria da avaliação', () => {
  async function rascunho() {
    const training = await prisma.training.create({
      data: {
        title: 'Rascunho com avaliação',
        description: 'x',
        category: 'y',
        instructor: 'z',
        estimatedDuration: 30,
        status: TrainingStatus.DRAFT,
        createdById: userId(MANAGER),
        modules: { create: [{ title: 'M1', content: 'c', duration: 10, position: 1 }] },
      },
    });

    return training.id;
  }

  it('EMPLOYEE recebe 403 ao criar avaliação', async () => {
    const response = await request(app)
      .post(`/trainings/${trainingId}/assessment`)
      .set('Authorization', auth(EMPLOYEE))
      .send({ minScore: 70, maxAttempts: 3 });

    expect(response.status).toBe(403);
  });

  it('MANAGER cria avaliação e perguntas em rascunho', async () => {
    const draftId = await rascunho();

    const criada = await request(app)
      .post(`/trainings/${draftId}/assessment`)
      .set('Authorization', auth(MANAGER))
      .send({ minScore: 60, maxAttempts: 3 });

    expect(criada.status).toBe(201);

    const pergunta = await request(app)
      .post(`/trainings/${draftId}/assessment/questions`)
      .set('Authorization', auth(MANAGER))
      .send({
        text: 'Qual é a resposta?',
        answers: [
          { text: 'certa', isCorrect: true },
          { text: 'errada', isCorrect: false },
        ],
      });

    expect(pergunta.status).toBe(201);
    expect((pergunta.body as { position: number }).position).toBe(1);
  });

  it('segunda avaliação no mesmo treinamento é recusada com 409', async () => {
    const draftId = await rascunho();

    await request(app)
      .post(`/trainings/${draftId}/assessment`)
      .set('Authorization', auth(MANAGER))
      .send({ minScore: 60, maxAttempts: 3 });

    const segunda = await request(app)
      .post(`/trainings/${draftId}/assessment`)
      .set('Authorization', auth(MANAGER))
      .send({ minScore: 80, maxAttempts: 2 });

    expect(segunda.status).toBe(409);
    expect((segunda.body as ErrorBody).error.code).toBe('ASSESSMENT_ALREADY_EXISTS');
  });

  // Mesma imutabilidade dos módulos: mudar o gabarito invalidaria tentativas feitas.
  it.each([
    ['editar a avaliação', 'patch', '', { minScore: 90 }],
    [
      'adicionar pergunta',
      'post',
      '/questions',
      {
        text: 'Nova pergunta válida?',
        answers: [
          { text: 'certa', isCorrect: true },
          { text: 'errada', isCorrect: false },
        ],
      },
    ],
  ])('recusa %s de treinamento publicado com 409', async (_caso, method, path, payload) => {
    const response = await request(app)
      [method as 'patch' | 'post'](`/trainings/${trainingId}/assessment${path}`)
      .set('Authorization', auth(MANAGER))
      .send(payload);

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error.code).toBe('TRAINING_NOT_EDITABLE');
  });

  it('exige exatamente uma alternativa correta', async () => {
    const draftId = await rascunho();

    await request(app)
      .post(`/trainings/${draftId}/assessment`)
      .set('Authorization', auth(MANAGER))
      .send({ minScore: 60, maxAttempts: 3 });

    for (const answers of [
      [
        { text: 'a', isCorrect: false },
        { text: 'b', isCorrect: false },
      ],
      [
        { text: 'a', isCorrect: true },
        { text: 'b', isCorrect: true },
      ],
    ]) {
      const response = await request(app)
        .post(`/trainings/${draftId}/assessment/questions`)
        .set('Authorization', auth(MANAGER))
        .send({ text: 'Pergunta inválida?', answers });

      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('publicar com avaliação sem perguntas é recusado com 409', async () => {
    const draftId = await rascunho();

    await request(app)
      .post(`/trainings/${draftId}/assessment`)
      .set('Authorization', auth(MANAGER))
      .send({ minScore: 60, maxAttempts: 3 });

    const publicacao = await request(app)
      .patch(`/trainings/${draftId}/status`)
      .set('Authorization', auth(MANAGER))
      .send({ status: TrainingStatus.PUBLISHED });

    expect(publicacao.status).toBe(409);
    expect((publicacao.body as ErrorBody).error.code).toBe('ASSESSMENT_WITHOUT_QUESTIONS');
  });
});
