import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { healthRoutes } from './shared/http/health.routes';
import { errorHandler, notFoundHandler } from './shared/middleware/error-handler';

// Fábrica em vez de instância exportada: os testes de integração montam a app
// sem subir um listener.
export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use(healthRoutes);

  // Ordem obrigatória: 404 antes do handler de erro, ambos depois das rotas.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
