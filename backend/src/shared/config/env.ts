import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3333),

  DATABASE_URL: z.url({ message: 'DATABASE_URL precisa ser uma URL de conexão válida' }),

  // Validada desde já, embora a conexão Mongo (AuditLog) só entre na Fase 6:
  // ambiente incompleto deve falhar no boot, não no meio de uma operação.
  MONGO_URL: z.url({ message: 'MONGO_URL precisa ser uma URL de conexão válida' }),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET precisa ter no mínimo 16 caracteres'),
  JWT_EXPIRES_IN: z.string().min(1).default('1d'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Variáveis de ambiente inválidas:\n${problems}`);
  }

  return parsed.data;
}

// Validação no import = validação no boot: o processo não sobe com ambiente
// inválido. O resto da aplicação importa `env` e nunca lê `process.env`.
export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
