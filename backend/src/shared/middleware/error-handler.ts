import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { isProduction } from '../config/env';
import { AppError } from '../errors/AppError';

type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
    },
  } satisfies ErrorBody);
};

/**
 * Saída única de erro da aplicação — nenhum controller monta resposta de erro
 * por conta própria. No Express 5 erros de handlers async chegam aqui sozinhos,
 * sem try/catch nem wrapper `asyncHandler`.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const { statusCode, body } = describe(error);

  // Registrar o erro inteiro no servidor é o que permite manter a resposta
  // ao cliente genérica. Um AppError 5xx é falha prevista (dependência fora, por
  // exemplo) e não deve ser confundido com bug no log.
  if (statusCode >= 500) {
    const rotulo = error instanceof AppError ? `falha ${error.code}` : 'erro não tratado';

    console.error(`[${req.method} ${req.originalUrl}] ${rotulo}:`, error);
  }

  res.status(statusCode).json(body);
};

function describe(error: unknown): { statusCode: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
    };
  }

  // Rede de segurança: o caminho normal é o controller rodar o schema Zod.
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos.',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
    };
  }

  // Sem stack em produção: erro inesperado pode carregar caminho de arquivo,
  // query ou credencial.
  return {
    statusCode: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor.',
        ...(isProduction || !(error instanceof Error) ? {} : { stack: error.stack }),
      },
    },
  };
}
