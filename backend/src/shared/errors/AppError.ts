/**
 * Falha prevista pela regra de negócio: a aplicação sabe o que aconteceu e o
 * que responder. Qualquer outro erro vira 500 genérico no handler central,
 * porque não há garantia de que seu conteúdo seja seguro para expor.
 *
 * Permite ao Service comunicar decisão de domínio ao HTTP sem conhecer Express.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, statusCode = 400, code = 'APP_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;

    if (details !== undefined) {
      this.details = details;
    }

    Error.captureStackTrace(this, this.constructor);
  }
}
