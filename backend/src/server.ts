import type { Server } from 'node:http';

import { createApp } from './app';
import { env } from './shared/config/env';
import { connectMongo, disconnectMongo } from './shared/database/mongoose';
import { connectDatabase, disconnectDatabase } from './shared/database/prisma';

async function start(): Promise<void> {
  await connectDatabase();

  // Mongo não bloqueia o boot: ele serve apenas o AuditLog, que é best-effort
  // (ADR 006). Derrubar a API porque a auditoria está fora inverteria a
  // prioridade entre registro secundário e operação de negócio.
  await connectMongo().catch((error: unknown) => {
    console.error('Aviso: MongoDB indisponível, auditoria desativada nesta execução.', error);
  });

  const server = createApp().listen(env.PORT, () => {
    console.log(`Forma API ouvindo na porta ${env.PORT} (${env.NODE_ENV})`);
  });

  registerShutdown(server);
}

// Sem isso o container é morto com requests em voo e conexões de banco abertas.
function registerShutdown(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`${signal} recebido, encerrando...`);

    server.close(() => {
      void Promise.allSettled([disconnectDatabase(), disconnectMongo()]).finally(() =>
        process.exit(0),
      );
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error: unknown) => {
  console.error('Falha ao iniciar a aplicação:', error);
  process.exit(1);
});
