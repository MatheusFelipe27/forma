import { Role } from '@prisma/client';

import { prisma } from '../../shared/database/prisma';
import {
  enrollmentListInclude,
  type EnrollmentListItem,
} from '../enrollments/enrollments.repository';

export type TeamMember = { id: string; name: string; email: string; team: string | null };

export type DashboardRepository = {
  findEnrollmentsForUsers: (userIds: string[]) => Promise<EnrollmentListItem[]>;
  findDirectReports: (managerId: string) => Promise<TeamMember[]>;
  findAllEmployees: () => Promise<TeamMember[]>;
};

const memberSelect = { id: true, name: true, email: true, team: true } as const;

export const dashboardRepository: DashboardRepository = {
  // Mesma forma de include da listagem de matrículas: o Dashboard reaproveita as
  // funções de derivação em vez de recalcular progresso e status.
  findEnrollmentsForUsers(userIds) {
    if (userIds.length === 0) {
      return Promise.resolve([]);
    }

    return prisma.enrollment.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
      include: enrollmentListInclude,
    });
  },

  findDirectReports(managerId) {
    return prisma.user.findMany({
      where: { managerId },
      orderBy: { name: 'asc' },
      select: memberSelect,
    });
  },

  findAllEmployees() {
    return prisma.user.findMany({
      where: { role: Role.EMPLOYEE },
      orderBy: { name: 'asc' },
      select: memberSelect,
    });
  },
};
