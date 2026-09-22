import type { User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';

// Precisa acompanhar o valor usado no seed.
const BCRYPT_ROUNDS = 10;

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: User['role'];
  team: string | null;
};

export function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, BCRYPT_ROUNDS);
}

export function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return compare(plainPassword, passwordHash);
}

// Barreira única contra vazar `passwordHash`: nenhum controller serializa um
// `User` do Prisma direto.
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    team: user.team,
  };
}
