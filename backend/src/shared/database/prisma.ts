import { PrismaClient } from '@prisma/client';

import { env, isProduction } from '../config/env';

// Cada `new PrismaClient()` abre seu próprio pool. O cache em `globalThis`
// existe para o hot reload do `tsx watch` não vazar um pool por recarga.
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['warn', 'error'] : ['query', 'warn', 'error'],
    datasources: { db: { url: env.DATABASE_URL } },
  });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

// O Prisma conecta sob demanda; conectar no boot antecipa a falha de banco
// indisponível para a inicialização, em vez da primeira request.
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
