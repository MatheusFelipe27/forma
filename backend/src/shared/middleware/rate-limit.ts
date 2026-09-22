import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

// Fábrica, e não uma instância exportada: o store é em memória e por instância
// do middleware, então cada `createApp()` precisa do seu para os testes não
// herdarem a contagem uns dos outros.
export function createLoginRateLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    // Login bem-sucedido não consome cota: quem sabe a senha não é o alvo.
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Muitas tentativas de login. Tente novamente em alguns minutos.',
      },
    },
  });
}
