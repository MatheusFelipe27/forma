import mongoose from 'mongoose';

import { env } from '../config/env';

// Sem buffer: com o Mongo fora, uma escrita de auditoria deve falhar de imediato
// em vez de ficar pendurada até o timeout. O AuditLog é best-effort (ADR 006) e
// não pode atrasar a operação de negócio.
mongoose.set('bufferCommands', false);

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function connectMongo(): Promise<void> {
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
