import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('E-mail inválido'),
  // Sem regra de complexidade: no login, isso só informaria a política de senhas.
  password: z.string().min(1, 'Senha obrigatória'),
});

export type LoginInput = z.infer<typeof loginSchema>;
