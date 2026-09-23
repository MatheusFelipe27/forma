import { Prisma } from '@prisma/client';

/**
 * P2002 = violação de constraint única.
 *
 * Não inspecionamos `meta.target`: no Postgres ele traz o nome do índice, que
 * muda se a constraint for renomeada. Quem chama confirma a identidade da
 * constraint buscando o registro conflitante — não achou, o erro sobe.
 */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}
