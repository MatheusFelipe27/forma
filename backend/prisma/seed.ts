/**
 * Seed de desenvolvimento do Forma.
 *
 * Objetivo: deixar o banco com dados suficientes para nenhuma tela nascer vazia
 * (dashboards, listagens, progresso parcial, avaliação aprovada e reprovada).
 *
 * Duas decisões seguidas aqui, coerentes com o documento de implementação:
 *
 * 1. Progresso NÃO é semeado como percentual. O que existe no banco são linhas
 *    em `module_progress`; o percentual é calculado na leitura.
 * 2. `OVERDUE` NÃO é gravado em `enrollments.status`. O banco guarda apenas
 *    NOT_STARTED | IN_PROGRESS | COMPLETED — o atraso é derivado de
 *    `dueDate < now()` no Service. Por isso as matrículas atrasadas deste seed
 *    têm `dueDate` no passado e status IN_PROGRESS/NOT_STARTED.
 *
 * O seed é idempotente por truncamento: limpa as tabelas e recria tudo, para
 * poder rodar quantas vezes forem necessárias durante o desenvolvimento.
 */
import { PrismaClient, Role, TrainingStatus, EnrollmentStatus } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

/** Senha única de desenvolvimento — vale para todos os usuários do seed. */
const DEV_PASSWORD = 'Forma@123';
const BCRYPT_ROUNDS = 10;

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysFromNow = (days: number): Date => new Date(now + days * DAY);

/**
 * `noUncheckedIndexedAccess` faz todo acesso por índice/chave devolver
 * `T | undefined`. Em vez de espalhar `!` pelo arquivo, falhamos alto: se uma
 * referência do seed não existe, o dado semeado está inconsistente.
 */
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`Seed inconsistente: ${what} não encontrado.`);
  }
  return value;
}

async function reset(): Promise<void> {
  // Ordem inversa das dependências. Há cascatas no schema, mas apagar
  // explicitamente deixa o efeito óbvio para quem lê.
  await prisma.attemptAnswer.deleteMany();
  await prisma.assessmentAttempt.deleteMany();
  await prisma.moduleProgress.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.answer.deleteMany();
  await prisma.question.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.module.deleteMany();
  await prisma.training.deleteMany();
  await prisma.user.deleteMany();
}

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------

type EmployeeSpec = {
  name: string;
  email: string;
  team: string;
  manager: 'ana' | 'bruno';
};

const EMPLOYEE_SPECS: EmployeeSpec[] = [
  { name: 'Camila Duarte', email: 'camila.duarte@forma.dev', team: 'Engenharia', manager: 'ana' },
  { name: 'Diego Prado', email: 'diego.prado@forma.dev', team: 'Engenharia', manager: 'ana' },
  { name: 'Elisa Moraes', email: 'elisa.moraes@forma.dev', team: 'Engenharia', manager: 'ana' },
  { name: 'Felipe Antunes', email: 'felipe.antunes@forma.dev', team: 'Engenharia', manager: 'ana' },
  { name: 'Gabriela Reis', email: 'gabriela.reis@forma.dev', team: 'Engenharia', manager: 'ana' },
  { name: 'Henrique Lopes', email: 'henrique.lopes@forma.dev', team: 'Comercial', manager: 'bruno' },
  { name: 'Isabela Nunes', email: 'isabela.nunes@forma.dev', team: 'Comercial', manager: 'bruno' },
  { name: 'João Barreto', email: 'joao.barreto@forma.dev', team: 'Comercial', manager: 'bruno' },
  { name: 'Karina Vasques', email: 'karina.vasques@forma.dev', team: 'Comercial', manager: 'bruno' },
  { name: 'Lucas Ferraz', email: 'lucas.ferraz@forma.dev', team: 'Comercial', manager: 'bruno' },
];

async function seedUsers(passwordHash: string) {
  const admin = await prisma.user.create({
    data: {
      name: 'Aurora Martins',
      email: 'admin@forma.dev',
      passwordHash,
      role: Role.ADMIN,
      team: 'Pessoas & Cultura',
    },
  });

  const ana = await prisma.user.create({
    data: {
      name: 'Ana Beatriz Rocha',
      email: 'ana.rocha@forma.dev',
      passwordHash,
      role: Role.MANAGER,
      team: 'Engenharia',
      managerId: admin.id,
    },
  });

  const bruno = await prisma.user.create({
    data: {
      name: 'Bruno Carvalho',
      email: 'bruno.carvalho@forma.dev',
      passwordHash,
      role: Role.MANAGER,
      team: 'Comercial',
      managerId: admin.id,
    },
  });

  const managers = { ana, bruno } as const;

  const employees = [];
  for (const spec of EMPLOYEE_SPECS) {
    employees.push(
      await prisma.user.create({
        data: {
          name: spec.name,
          email: spec.email,
          passwordHash,
          role: Role.EMPLOYEE,
          team: spec.team,
          managerId: managers[spec.manager].id,
        },
      }),
    );
  }

  const byEmail = new Map(employees.map((employee) => [employee.email, employee]));
  const employee = (email: string) => required(byEmail.get(email), `employee ${email}`);

  return { admin, ana, bruno, employees, employee };
}

// ---------------------------------------------------------------------------
// Treinamentos
// ---------------------------------------------------------------------------

type ModuleSpec = {
  title: string;
  content: string;
  duration: number;
  materialUrl?: string;
};

type QuestionSpec = {
  text: string;
  /** A primeira alternativa da lista é sempre a correta; embaralhar é papel da UI. */
  answers: [correct: string, ...wrong: string[]];
};

type TrainingSpec = {
  title: string;
  description: string;
  category: string;
  instructor: string;
  estimatedDuration: number;
  status: TrainingStatus;
  modules: ModuleSpec[];
  assessment?: {
    minScore: number;
    maxAttempts: number;
    questions: QuestionSpec[];
  };
};

const TRAINING_SPECS: TrainingSpec[] = [
  {
    title: 'Segurança da Informação na Prática',
    description:
      'Como reconhecer phishing, tratar credenciais e classificar informação sensível no dia a dia. Treinamento obrigatório para todas as áreas.',
    category: 'Compliance',
    instructor: 'Aurora Martins',
    estimatedDuration: 120,
    status: TrainingStatus.PUBLISHED,
    modules: [
      {
        title: 'Por que segurança é responsabilidade de todo mundo',
        content:
          'A maior parte dos incidentes começa em uma ação cotidiana: um clique, uma senha reaproveitada, um anexo aberto às pressas. Este módulo situa o papel de cada pessoa na cadeia de segurança.',
        duration: 25,
        materialUrl: 'https://cdn.forma.dev/materiais/seguranca-modulo-1.pdf',
      },
      {
        title: 'Reconhecendo phishing e engenharia social',
        content:
          'Sinais recorrentes em mensagens fraudulentas: urgência artificial, remetente parecido mas não idêntico, pedido fora do canal habitual. Exercícios com exemplos reais anonimizados.',
        duration: 35,
        materialUrl: 'https://cdn.forma.dev/materiais/seguranca-modulo-2.pdf',
      },
      {
        title: 'Senhas, MFA e gestão de credenciais',
        content:
          'Por que o gerenciador de senhas resolve o problema que a troca periódica obrigatória não resolvia, e como configurar o segundo fator nas ferramentas internas.',
        duration: 30,
      },
      {
        title: 'Classificação e tratamento de dados',
        content:
          'Público, interno, confidencial e restrito: o que muda no armazenamento, no compartilhamento e no descarte de cada nível.',
        duration: 30,
      },
    ],
    assessment: {
      minScore: 70,
      maxAttempts: 3,
      questions: [
        {
          text: 'Qual é o sinal mais característico de uma tentativa de phishing?',
          answers: [
            'Pressão por urgência combinada com um pedido fora do canal habitual',
            'A mensagem ter sido enviada fora do horário comercial',
            'O e-mail conter anexo em PDF',
            'O remetente estar em cópia oculta',
          ],
        },
        {
          text: 'Ao descobrir que uma senha sua vazou, qual é a primeira ação?',
          answers: [
            'Trocar a senha nessa conta e em qualquer outra onde ela tenha sido reutilizada',
            'Aguardar o time de segurança entrar em contato',
            'Desativar o segundo fator para evitar bloqueio',
            'Trocar apenas o e-mail cadastrado',
          ],
        },
        {
          text: 'Um relatório com CPF de clientes deve ser classificado como:',
          answers: ['Restrito', 'Público', 'Interno', 'Não exige classificação'],
        },
      ],
    },
  },
  {
    title: 'Onboarding Forma',
    description:
      'Primeiros passos na empresa: como nos organizamos, onde as decisões são tomadas e o que esperar das primeiras semanas.',
    category: 'Onboarding',
    instructor: 'Ana Beatriz Rocha',
    estimatedDuration: 75,
    status: TrainingStatus.PUBLISHED,
    modules: [
      {
        title: 'Quem somos e como trabalhamos',
        content:
          'História da empresa, times, rituais de comunicação e o que significa autonomia com contexto na prática.',
        duration: 25,
      },
      {
        title: 'Ferramentas e acessos',
        content:
          'O conjunto mínimo de ferramentas, quem aprova cada acesso e como pedir o que faltar sem abrir chamado para tudo.',
        duration: 25,
        materialUrl: 'https://cdn.forma.dev/materiais/onboarding-ferramentas.pdf',
      },
      {
        title: 'Seus primeiros 30 dias',
        content:
          'Expectativas por semana, com quem conversar, e como a conversa de acompanhamento com a liderança funciona.',
        duration: 25,
      },
    ],
  },
  {
    title: 'LGPD para Times Comerciais',
    description:
      'Base legal, consentimento e limites no uso de dados de prospects e clientes durante o ciclo de vendas.',
    category: 'Compliance',
    instructor: 'Bruno Carvalho',
    estimatedDuration: 90,
    status: TrainingStatus.PUBLISHED,
    modules: [
      {
        title: 'Conceitos essenciais da LGPD',
        content:
          'Dado pessoal, dado sensível, titular, controlador e operador — com exemplos tirados da rotina comercial.',
        duration: 30,
      },
      {
        title: 'Bases legais no ciclo de vendas',
        content:
          'Quando o legítimo interesse sustenta a prospecção e quando o consentimento é indispensável. Onde a linha costuma ser cruzada sem má-fé.',
        duration: 30,
        materialUrl: 'https://cdn.forma.dev/materiais/lgpd-bases-legais.pdf',
      },
      {
        title: 'Direitos do titular e prazos de resposta',
        content:
          'O que fazer ao receber um pedido de acesso, correção ou eliminação, e qual é o caminho interno de encaminhamento.',
        duration: 30,
      },
    ],
    assessment: {
      minScore: 60,
      maxAttempts: 2,
      questions: [
        {
          text: 'Prospecção ativa B2B com dados profissionais públicos geralmente se apoia em qual base legal?',
          answers: [
            'Legítimo interesse, desde que documentado e com opção de descadastro',
            'Consentimento prévio obtido por telefone',
            'Cumprimento de obrigação legal',
            'Proteção da vida do titular',
          ],
        },
        {
          text: 'Um cliente pede a eliminação dos dados dele. Qual é a conduta correta?',
          answers: [
            'Encaminhar o pedido ao canal do encarregado e responder dentro do prazo legal',
            'Eliminar imediatamente todos os registros, inclusive fiscais',
            'Ignorar, já que existe contrato vigente',
            'Pedir que o cliente formalize por cartório',
          ],
        },
        {
          text: 'Dado sensível, na definição da LGPD, inclui:',
          answers: [
            'Informação sobre saúde, convicção religiosa ou filiação sindical',
            'Qualquer dado de pessoa jurídica',
            'CNPJ e razão social',
            'Endereço comercial divulgado no site',
          ],
        },
      ],
    },
  },
  {
    title: 'Comunicação Não-Violenta no Trabalho',
    description:
      'Dar e receber feedback difícil sem transformar divergência técnica em conflito pessoal.',
    category: 'Soft Skills',
    instructor: 'Ana Beatriz Rocha',
    estimatedDuration: 80,
    status: TrainingStatus.PUBLISHED,
    modules: [
      {
        title: 'Observação separada de julgamento',
        content:
          'A diferença entre "o PR ficou três dias sem revisão" e "você não se importa com o time" — e por que a segunda frase encerra a conversa.',
        duration: 25,
      },
      {
        title: 'Necessidade e pedido',
        content:
          'Como nomear o que está em jogo e transformar reclamação em pedido concreto, negociável e verificável.',
        duration: 30,
      },
      {
        title: 'Feedback em situações tensas',
        content:
          'Roteiros para conversas de desempenho, discordância técnica pública e erros com impacto em cliente.',
        duration: 25,
        materialUrl: 'https://cdn.forma.dev/materiais/cnv-roteiros.pdf',
      },
    ],
  },
];

const trainingInclude = {
  modules: { orderBy: { position: 'asc' } },
  assessment: {
    include: {
      questions: {
        orderBy: { position: 'asc' },
        include: { answers: true },
      },
    },
  },
} as const;

async function seedTrainings(createdById: string) {
  const trainings = [];

  for (const spec of TRAINING_SPECS) {
    const training = await prisma.training.create({
      data: {
        title: spec.title,
        description: spec.description,
        category: spec.category,
        instructor: spec.instructor,
        estimatedDuration: spec.estimatedDuration,
        status: spec.status,
        createdById,
        modules: {
          create: spec.modules.map((module, index) => ({
            title: module.title,
            content: module.content,
            duration: module.duration,
            position: index + 1,
            materialUrl: module.materialUrl ?? null,
          })),
        },
        ...(spec.assessment
          ? {
              assessment: {
                create: {
                  minScore: spec.assessment.minScore,
                  maxAttempts: spec.assessment.maxAttempts,
                  questions: {
                    create: spec.assessment.questions.map((question, questionIndex) => ({
                      text: question.text,
                      position: questionIndex + 1,
                      answers: {
                        create: question.answers.map((text, answerIndex) => ({
                          text,
                          isCorrect: answerIndex === 0,
                        })),
                      },
                    })),
                  },
                },
              },
            }
          : {}),
      },
      include: trainingInclude,
    });

    trainings.push(training);
  }

  const byTitle = new Map(trainings.map((training) => [training.title, training]));
  const training = (title: string) => required(byTitle.get(title), `training "${title}"`);

  return { trainings, training };
}

type SeededTraining = Awaited<ReturnType<typeof seedTrainings>>['trainings'][number];

// ---------------------------------------------------------------------------
// Matrículas, progresso e tentativas
// ---------------------------------------------------------------------------

type EnrollmentSpec = {
  userEmail: string;
  trainingTitle: string;
  status: EnrollmentStatus;
  /** Quantos módulos, na ordem de posição, já foram concluídos. */
  completedModules: number;
  dueInDays?: number;
  /** Notas das tentativas de avaliação, na ordem em que foram feitas. */
  attemptScores?: number[];
};

/**
 * Cobertura pretendida: matrícula nova, em andamento, concluída, atrasada
 * (dueDate no passado), tentativa reprovada e tentativa aprovada depois de
 * reprovar — e um treinamento sem avaliação concluído só pelos módulos.
 */
const ENROLLMENT_SPECS: EnrollmentSpec[] = [
  // Segurança da Informação (4 módulos, avaliação minScore 70 / 3 tentativas)
  {
    userEmail: 'camila.duarte@forma.dev',
    trainingTitle: 'Segurança da Informação na Prática',
    status: EnrollmentStatus.COMPLETED,
    completedModules: 4,
    dueInDays: 10,
    attemptScores: [100],
  },
  {
    userEmail: 'diego.prado@forma.dev',
    trainingTitle: 'Segurança da Informação na Prática',
    status: EnrollmentStatus.IN_PROGRESS,
    completedModules: 2,
    dueInDays: 15,
  },
  {
    userEmail: 'elisa.moraes@forma.dev',
    trainingTitle: 'Segurança da Informação na Prática',
    status: EnrollmentStatus.NOT_STARTED,
    completedModules: 0,
    dueInDays: 30,
  },
  {
    // Atrasada: dueDate no passado. O status OVERDUE é derivado na leitura.
    userEmail: 'felipe.antunes@forma.dev',
    trainingTitle: 'Segurança da Informação na Prática',
    status: EnrollmentStatus.IN_PROGRESS,
    completedModules: 1,
    dueInDays: -5,
  },
  {
    // Reprovou na primeira tentativa e ainda tem tentativas disponíveis.
    userEmail: 'gabriela.reis@forma.dev',
    trainingTitle: 'Segurança da Informação na Prática',
    status: EnrollmentStatus.IN_PROGRESS,
    completedModules: 4,
    dueInDays: 12,
    attemptScores: [33.33],
  },
  {
    userEmail: 'henrique.lopes@forma.dev',
    trainingTitle: 'Segurança da Informação na Prática',
    status: EnrollmentStatus.NOT_STARTED,
    completedModules: 0,
    dueInDays: 30,
  },

  // Onboarding (3 módulos, sem avaliação)
  {
    userEmail: 'camila.duarte@forma.dev',
    trainingTitle: 'Onboarding Forma',
    status: EnrollmentStatus.COMPLETED,
    completedModules: 3,
  },
  {
    userEmail: 'isabela.nunes@forma.dev',
    trainingTitle: 'Onboarding Forma',
    status: EnrollmentStatus.IN_PROGRESS,
    completedModules: 1,
    dueInDays: 7,
  },
  {
    userEmail: 'joao.barreto@forma.dev',
    trainingTitle: 'Onboarding Forma',
    status: EnrollmentStatus.NOT_STARTED,
    completedModules: 0,
    dueInDays: 20,
  },
  {
    userEmail: 'lucas.ferraz@forma.dev',
    trainingTitle: 'Onboarding Forma',
    status: EnrollmentStatus.COMPLETED,
    completedModules: 3,
    dueInDays: 3,
  },

  // LGPD (3 módulos, avaliação minScore 60 / 2 tentativas)
  {
    // Reprovou e aprovou na segunda: esgotou as tentativas mas passou.
    userEmail: 'henrique.lopes@forma.dev',
    trainingTitle: 'LGPD para Times Comerciais',
    status: EnrollmentStatus.COMPLETED,
    completedModules: 3,
    dueInDays: 8,
    attemptScores: [33.33, 100],
  },
  {
    userEmail: 'isabela.nunes@forma.dev',
    trainingTitle: 'LGPD para Times Comerciais',
    status: EnrollmentStatus.IN_PROGRESS,
    completedModules: 2,
    dueInDays: 9,
  },
  {
    // Atrasada e sequer iniciada.
    userEmail: 'joao.barreto@forma.dev',
    trainingTitle: 'LGPD para Times Comerciais',
    status: EnrollmentStatus.NOT_STARTED,
    completedModules: 0,
    dueInDays: -12,
  },
  {
    // Esgotou as 2 tentativas sem atingir o mínimo: bloqueada até liberação
    // de Manager/Admin (regra da Fase 6, apenas representada aqui).
    userEmail: 'karina.vasques@forma.dev',
    trainingTitle: 'LGPD para Times Comerciais',
    status: EnrollmentStatus.IN_PROGRESS,
    completedModules: 3,
    dueInDays: -2,
    attemptScores: [33.33, 33.33],
  },
  {
    userEmail: 'lucas.ferraz@forma.dev',
    trainingTitle: 'LGPD para Times Comerciais',
    status: EnrollmentStatus.IN_PROGRESS,
    completedModules: 1,
    dueInDays: 14,
  },

  // Comunicação Não-Violenta (3 módulos, sem avaliação)
  {
    userEmail: 'diego.prado@forma.dev',
    trainingTitle: 'Comunicação Não-Violenta no Trabalho',
    status: EnrollmentStatus.IN_PROGRESS,
    completedModules: 2,
    dueInDays: 25,
  },
  {
    userEmail: 'elisa.moraes@forma.dev',
    trainingTitle: 'Comunicação Não-Violenta no Trabalho',
    status: EnrollmentStatus.NOT_STARTED,
    completedModules: 0,
  },
  {
    userEmail: 'karina.vasques@forma.dev',
    trainingTitle: 'Comunicação Não-Violenta no Trabalho',
    status: EnrollmentStatus.COMPLETED,
    completedModules: 3,
    dueInDays: 5,
  },
  {
    userEmail: 'gabriela.reis@forma.dev',
    trainingTitle: 'Comunicação Não-Violenta no Trabalho',
    status: EnrollmentStatus.NOT_STARTED,
    completedModules: 0,
    dueInDays: 40,
  },
];

/**
 * Monta as respostas de uma tentativa a partir da nota desejada: acerta as
 * primeiras `Math.round(score/100 * total)` questões e erra o resto. Assim a
 * tentativa semeada é coerente com as respostas gravadas — o cálculo real do
 * score continua sendo responsabilidade do Service (Fase 7).
 */
function answersForScore(
  assessment: NonNullable<SeededTraining['assessment']>,
  score: number,
): Array<{ questionId: string; answerId: string }> {
  const total = assessment.questions.length;
  const correctCount = Math.round((score / 100) * total);

  return assessment.questions.map((question, index) => {
    const correct = required(
      question.answers.find((answer) => answer.isCorrect),
      `alternativa correta da questão "${question.text}"`,
    );
    const wrong = required(
      question.answers.find((answer) => !answer.isCorrect),
      `alternativa incorreta da questão "${question.text}"`,
    );

    return {
      questionId: question.id,
      answerId: index < correctCount ? correct.id : wrong.id,
    };
  });
}

async function seedEnrollments(
  employee: (email: string) => { id: string },
  training: (title: string) => SeededTraining,
): Promise<number> {
  for (const spec of ENROLLMENT_SPECS) {
    const user = employee(spec.userEmail);
    const target = training(spec.trainingTitle);

    const enrollment = await prisma.enrollment.create({
      data: {
        userId: user.id,
        trainingId: target.id,
        status: spec.status,
        dueDate: spec.dueInDays === undefined ? null : daysFromNow(spec.dueInDays),
      },
    });

    const completed = target.modules.slice(0, spec.completedModules);
    if (completed.length > 0) {
      await prisma.moduleProgress.createMany({
        data: completed.map((module) => ({
          enrollmentId: enrollment.id,
          moduleId: module.id,
        })),
      });
    }

    const { assessment } = target;
    if (!assessment || !spec.attemptScores) {
      continue;
    }

    for (const score of spec.attemptScores) {
      await prisma.assessmentAttempt.create({
        data: {
          enrollmentId: enrollment.id,
          assessmentId: assessment.id,
          score,
          passed: score >= assessment.minScore,
          answers: { create: answersForScore(assessment, score) },
        },
      });
    }
  }

  return ENROLLMENT_SPECS.length;
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Limpando dados existentes...');
  await reset();

  const passwordHash = await hash(DEV_PASSWORD, BCRYPT_ROUNDS);

  const { admin, employees, employee } = await seedUsers(passwordHash);
  console.log(`Usuários: 1 admin, 2 managers, ${employees.length} employees.`);

  const { trainings, training } = await seedTrainings(admin.id);
  const withAssessment = trainings.filter((item) => item.assessment !== null).length;
  console.log(`Treinamentos: ${trainings.length} publicados, ${withAssessment} com avaliação.`);

  const enrollmentCount = await seedEnrollments(employee, training);
  console.log(`Matrículas: ${enrollmentCount}.`);

  console.log(`\nSeed concluído. Senha de todos os usuários: ${DEV_PASSWORD}`);
  console.log('Admin: admin@forma.dev | Managers: ana.rocha@forma.dev, bruno.carvalho@forma.dev');
}

main()
  .catch((error: unknown) => {
    console.error('Falha ao executar o seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
