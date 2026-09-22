import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { createAuthRoutes } from './modules/auth/auth.routes';
import { createEnrollmentsRoutes } from './modules/enrollments/enrollments.routes';
import { createTrainingsRoutes } from './modules/trainings/trainings.routes';
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
  app.use(createAuthRoutes());
  app.use(createTrainingsRoutes());
  app.use(createEnrollmentsRoutes());

  // Ordem obrigatória: 404 antes do handler de erro, ambos depois das rotas.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
