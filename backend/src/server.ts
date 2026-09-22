import type { Server } from 'node:http';

import { createApp } from './app';
import { env } from './shared/config/env';
import { connectDatabase, disconnectDatabase } from './shared/database/prisma';

async function start(): Promise<void> {
  await connectDatabase();

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
      void disconnectDatabase().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error: unknown) => {
  console.error('Falha ao iniciar a aplicação:', error);
  process.exit(1);
});
