import { EnrollmentStatus, Role } from '@prisma/client';

import type { AuthenticatedUser } from '../../shared/types/express';
import { toListView, type EnrollmentView } from '../enrollments/enrollments.service';
import {
  dashboardRepository,
  type DashboardRepository,
  type TeamMember,
} from './dashboard.repository';

const { NOT_STARTED, IN_PROGRESS, COMPLETED, OVERDUE } = EnrollmentStatus;

export type StatusTally = {
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  overdue: number;
};

export type MemberSummary = TeamMember & {
  tally: StatusTally;
  averageProgress: number;
};

/**
 * Contagem por status **derivado** — a coluna `status` não é consultada, então
 * `OVERDUE` aparece aqui sem nunca ter sido gravado (ADR 007).
 */
function tally(views: EnrollmentView[]): StatusTally {
  const count = (status: EnrollmentStatus) => views.filter((view) => view.status === status).length;

  return {
    total: views.length,
    notStarted: count(NOT_STARTED),
    inProgress: count(IN_PROGRESS),
    completed: count(COMPLETED),
    overdue: count(OVERDUE),
  };
}

function averageProgress(views: EnrollmentView[]): number {
  if (views.length === 0) {
    return 0;
  }

  const sum = views.reduce((total, view) => total + view.progress.percentage, 0);

  return Math.round((sum / views.length) * 10) / 10;
}

export function createDashboardService(repository: DashboardRepository = dashboardRepository) {
  return {
    async me(actor: AuthenticatedUser) {
      const items = await repository.findEnrollmentsForUsers([actor.id]);
      const views = items.map(toListView);

      return {
        tally: tally(views),
        averageProgress: averageProgress(views),
        // A lista completa das próprias matrículas já vive em GET /enrollments;
        // aqui vão só as que pedem ação, para a tela inicial não precisar filtrar.
        needsAttention: views
          .filter((view) => view.status === OVERDUE || view.status === IN_PROGRESS)
          .sort(byUrgency)
          .slice(0, 5),
      };
    },

    async team(actor: AuthenticatedUser) {
      const members =
        actor.role === Role.ADMIN
          ? await repository.findAllEmployees()
          : await repository.findDirectReports(actor.id);

      const items = await repository.findEnrollmentsForUsers(members.map((member) => member.id));
      const byUser = new Map<string, EnrollmentView[]>();

      for (const view of items.map(toListView)) {
        const list = byUser.get(view.user.id) ?? [];
        list.push(view);
        byUser.set(view.user.id, list);
      }

      const summaries: MemberSummary[] = members.map((member) => {
        const views = byUser.get(member.id) ?? [];

        return { ...member, tally: tally(views), averageProgress: averageProgress(views) };
      });

      const allViews = [...byUser.values()].flat();

      return {
        teamSize: members.length,
        tally: tally(allViews),
        averageProgress: averageProgress(allViews),
        members: summaries,
      };
    },
  };
}

// Atrasado primeiro; entre atrasados, o prazo mais antigo.
function byUrgency(a: EnrollmentView, b: EnrollmentView): number {
  if (a.status !== b.status) {
    return a.status === OVERDUE ? -1 : 1;
  }

  return (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity);
}

export type DashboardService = ReturnType<typeof createDashboardService>;

export const dashboardService = createDashboardService();
