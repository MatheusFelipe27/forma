import { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { env } from '../config/env';

const tokenPayloadSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(Role),
});

export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

export function signToken(payload: TokenPayload): string {
  // `expiresIn` é tipado como um literal de duração; a env é validada como
  // string livre e o cast é a ponte entre os dois.
  const expiresIn = env.JWT_EXPIRES_IN as NonNullable<jwt.SignOptions['expiresIn']>;

  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  // A assinatura prova origem, não formato: um token emitido por uma versão
  // anterior do código passaria na verificação com outro shape.
  const parsed = tokenPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new jwt.JsonWebTokenError('payload do token em formato inesperado');
  }

  return parsed.data;
}
