import { Router } from 'express';

export const healthRoutes = Router();

// Liveness apenas. Não consulta o banco de propósito: um health check que cai
// junto com a dependência não distingue "app morta" de "banco fora".
healthRoutes.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
