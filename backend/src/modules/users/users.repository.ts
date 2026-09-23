import type { User } from '@prisma/client';

import { prisma } from '../../shared/database/prisma';

export type UsersRepository = {
  findByEmail: (email: string) => Promise<User | null>;
  findById: (id: string) => Promise<User | null>;
  findExistingIds: (ids: string[]) => Promise<string[]>;
};

export const usersRepository: UsersRepository = {
  findByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id) {
    return prisma.user.findUnique({ where: { id } });
  },

  async findExistingIds(ids) {
    const found = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    return found.map((user) => user.id);
  },
};
