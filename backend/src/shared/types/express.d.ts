import type { Role } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
