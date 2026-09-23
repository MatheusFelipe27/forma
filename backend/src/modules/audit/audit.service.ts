import { AppError } from '../../shared/errors/AppError';
import type { AuthenticatedUser } from '../../shared/types/express';
import { usersRepository, type UsersRepository } from '../users/users.repository';
import { auditRepository, type AuditEntry, type AuditRepository } from './audit.repository';
import type { ListAuditLogsQuery } from './audit.schemas';

export type AuditRecordInput = Omit<AuditEntry, 'userId' | 'userName'>;

export type AuditServiceDeps = {
  audit?: AuditRepository;
  users?: UsersRepository;
};

export function createAuditService({
  audit = auditRepository,
  users = usersRepository,
}: AuditServiceDeps = {}) {
  return {
    /**
     * Escrita best-effort (ADR 006): **nunca** lança.
     *
     * Auditoria é registro secundário. Se o Mongo estiver fora, a atribuição de
     * treinamento não pode falhar por causa disso — o erro vai para stderr e a
     * operação de negócio segue. É o único lugar do projeto onde engolir exceção
     * é a decisão correta, e é o motivo de não existir `throw` aqui.
     */
    async record(actor: AuthenticatedUser, input: AuditRecordInput): Promise<void> {
      // Sem conexão, sai antes de consultar o Postgres — mas registra: uma ação
      // auditável que não foi auditada precisa aparecer no stderr de qualquer
      // forma, seja por escrita falhada ou por banco fora.
      if (!audit.isAvailable()) {
        console.error(
          `[audit] ${input.action} em ${input.resourceType}:${input.resourceId} não registrado: MongoDB indisponível`,
        );

        return;
      }

      try {
        const user = await users.findById(actor.id);

        await audit.create({
          ...input,
          userId: actor.id,
          userName: user?.name ?? 'usuário desconhecido',
        });
      } catch (error) {
        console.error(
          `[audit] falha ao registrar ${input.action} em ${input.resourceType}:${input.resourceId}`,
          error,
        );
      }
    },

    /**
     * Leitura, ao contrário da escrita, propaga erro: um endpoint de auditoria
     * que devolve lista vazia quando o banco está fora mente para o Admin.
     */
    async list(query: ListAuditLogsQuery) {
      try {
        const { items, total } = await audit.findMany({
          ...(query.action === undefined ? {} : { action: query.action }),
          ...(query.resourceType === undefined ? {} : { resourceType: query.resourceType }),
          ...(query.resourceId === undefined ? {} : { resourceId: query.resourceId }),
          ...(query.userId === undefined ? {} : { userId: query.userId }),
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        });

        return { data: items, page: query.page, limit: query.limit, total };
      } catch (error) {
        console.error('[audit] falha ao consultar registros', error);

        throw new AppError(
          'Registro de auditoria indisponível no momento.',
          503,
          'AUDIT_UNAVAILABLE',
        );
      }
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;

export const auditService = createAuditService();
