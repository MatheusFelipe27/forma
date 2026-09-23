import { EnrollmentStatus, Role, TrainingStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../../shared/types/express';
import type { EnrollmentListItem } from '../enrollments/enrollments.repository';
import { createDashboardService } from './dashboard.service';
import type { DashboardRepository, TeamMember } from './dashboard.repository';

const EMPLOYEE: AuthenticatedUser = { id: 'user-1', role: Role.EMPLOYEE };
const MANAGER: AuthenticatedUser = { id: 'user-manager', role: Role.MANAGER };
const ADMIN: AuthenticatedUser = { id: 'user-admin', role: Role.ADMIN };

const ONTEM = new Date(Date.now() - 86_400_000);
const AMANHA = new Date(Date.now() + 86_400_000);

type ItemOptions = {
  userId?: string;
  totalModules?: number;
  completedModules?: number;
  hasAssessment?: boolean;
  assessmentPassed?: boolean;
  dueDate?: Date | null;
};

function item({
  userId = EMPLOYEE.id,
  totalModules = 4,
  completedModules = 0,
  hasAssessment = false,
  assessmentPassed = false,
  dueDate = null,
}: ItemOptions = {}): EnrollmentListItem {
  return {
    id: `enrollment-${Math.random()}`,
    userId,
    trainingId: 'training-1',
    status: EnrollmentStatus.NOT_STARTED,
    dueDate,
    createdAt: new Date(),
    extraAttempts: 0,
    user: { id: userId, name: 'Pessoa', email: `${userId}@forma.dev` },
    training: {
      id: 'training-1',
      title: 'Treinamento',
      category: 'Compliance',
      status: TrainingStatus.PUBLISHED,
      _count: { modules: totalModules },
      assessment: hasAssessment ? { id: 'assessment-1' } : null,
    },
    _count: { moduleProgress: completedModules },
    attempts: assessmentPassed ? [{ id: 'attempt-1' }] : [],
  };
}

function setup(items: EnrollmentListItem[], members: TeamMember[] = []) {
  const repository: DashboardRepository = {
    findEnrollmentsForUsers: vi.fn((userIds: string[]) =>
      Promise.resolve(items.filter((row) => userIds.includes(row.userId))),
    ),
    findDirectReports: vi.fn(() => Promise.resolve(members)),
    findAllEmployees: vi.fn(() => Promise.resolve(members)),
  };

  return { repository, service: createDashboardService(repository) };
}

describe('GET /dashboard/me', () => {
  // A contagem usa o status derivado, não a coluna — todos os itens aqui têm
  // status NOT_STARTED gravado.
  it('conta por status derivado, incluindo OVERDUE que nunca é gravado', async () => {
    const { service } = setup([
      item({ completedModules: 0, dueDate: AMANHA }),
      item({ completedModules: 2, dueDate: AMANHA }),
      item({ completedModules: 4, dueDate: AMANHA }),
      item({ completedModules: 1, dueDate: ONTEM }),
    ]);

    const result = await service.me(EMPLOYEE);

    expect(result.tally).toEqual({
      total: 4,
      notStarted: 1,
      inProgress: 1,
      completed: 1,
      overdue: 1,
    });
  });

  it('média de progresso combina os percentuais calculados', async () => {
    const { service } = setup([
      item({ totalModules: 4, completedModules: 4 }),
      item({ totalModules: 4, completedModules: 2 }),
      item({ totalModules: 4, completedModules: 0 }),
    ]);

    // (100 + 50 + 0) / 3
    expect((await service.me(EMPLOYEE)).averageProgress).toBe(50);
  });

  it('sem matrículas devolve zeros em vez de NaN', async () => {
    const { service } = setup([]);

    const result = await service.me(EMPLOYEE);

    expect(result.averageProgress).toBe(0);
    expect(result.tally.total).toBe(0);
    expect(result.needsAttention).toEqual([]);
  });

  // Concluído com avaliação pendente conta como em andamento, não concluído.
  it('respeita a regra de conclusão com avaliação', async () => {
    const { service } = setup([
      item({ completedModules: 4, hasAssessment: true, assessmentPassed: false, dueDate: AMANHA }),
      item({ completedModules: 4, hasAssessment: true, assessmentPassed: true, dueDate: AMANHA }),
    ]);

    const { tally } = await service.me(EMPLOYEE);

    expect(tally).toMatchObject({ inProgress: 1, completed: 1 });
  });

  it('só enxerga as próprias matrículas', async () => {
    const { repository, service } = setup([item(), item({ userId: 'outro-usuario' })]);

    const result = await service.me(EMPLOYEE);

    expect(repository.findEnrollmentsForUsers).toHaveBeenCalledWith([EMPLOYEE.id]);
    expect(result.tally.total).toBe(1);
  });
});

describe('needsAttention', () => {
  it('traz atrasados antes dos em andamento', async () => {
    const { service } = setup([
      item({ completedModules: 1, dueDate: AMANHA }),
      item({ completedModules: 1, dueDate: ONTEM }),
    ]);

    const { needsAttention } = await service.me(EMPLOYEE);

    expect(needsAttention.map((view) => view.status)).toEqual([
      EnrollmentStatus.OVERDUE,
      EnrollmentStatus.IN_PROGRESS,
    ]);
  });

  it('não inclui concluídos nem não iniciados no prazo', async () => {
    const { service } = setup([
      item({ completedModules: 4, dueDate: AMANHA }),
      item({ completedModules: 0, dueDate: AMANHA }),
    ]);

    expect((await service.me(EMPLOYEE)).needsAttention).toEqual([]);
  });

  it('limita a 5 itens', async () => {
    const { service } = setup(
      Array.from({ length: 8 }, () => item({ completedModules: 1, dueDate: ONTEM })),
    );

    expect((await service.me(EMPLOYEE)).needsAttention).toHaveLength(5);
  });
});

describe('GET /dashboard/team', () => {
  const equipe: TeamMember[] = [
    { id: 'emp-1', name: 'Camila', email: 'camila@forma.dev', team: 'Engenharia' },
    { id: 'emp-2', name: 'Diego', email: 'diego@forma.dev', team: 'Engenharia' },
  ];

  it('agrega por membro e no total da equipe', async () => {
    const { service } = setup(
      [
        item({ userId: 'emp-1', completedModules: 4, dueDate: AMANHA }),
        item({ userId: 'emp-1', completedModules: 1, dueDate: ONTEM }),
        item({ userId: 'emp-2', completedModules: 2, dueDate: AMANHA }),
      ],
      equipe,
    );

    const result = await service.team(MANAGER);

    expect(result.teamSize).toBe(2);
    expect(result.tally).toMatchObject({ total: 3, completed: 1, overdue: 1, inProgress: 1 });

    const camila = result.members.find((member) => member.id === 'emp-1');
    expect(camila?.tally).toMatchObject({ total: 2, completed: 1, overdue: 1 });
    expect(camila?.averageProgress).toBe(62.5);
  });

  it('membro sem matrícula aparece com zeros', async () => {
    const { service } = setup([item({ userId: 'emp-1', completedModules: 4 })], equipe);

    const diego = (await service.team(MANAGER)).members.find((member) => member.id === 'emp-2');

    expect(diego?.tally).toMatchObject({ total: 0 });
    expect(diego?.averageProgress).toBe(0);
  });

  it('MANAGER consulta os subordinados diretos', async () => {
    const { repository, service } = setup([], equipe);

    await service.team(MANAGER);

    expect(repository.findDirectReports).toHaveBeenCalledWith(MANAGER.id);
    expect(repository.findAllEmployees).not.toHaveBeenCalled();
  });

  it('ADMIN consulta todos os funcionários', async () => {
    const { repository, service } = setup([], equipe);

    await service.team(ADMIN);

    expect(repository.findAllEmployees).toHaveBeenCalled();
    expect(repository.findDirectReports).not.toHaveBeenCalled();
  });

  it('equipe vazia não quebra', async () => {
    const { service } = setup([], []);

    await expect(service.team(MANAGER)).resolves.toMatchObject({
      teamSize: 0,
      averageProgress: 0,
    });
  });
});
