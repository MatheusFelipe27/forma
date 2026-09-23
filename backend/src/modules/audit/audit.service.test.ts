import { Role, type User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../../shared/types/express';
import type { UsersRepository } from '../users/users.repository';
import type { AuditRepository } from './audit.repository';
import { createAuditService, type AuditRecordInput } from './audit.service';

const ACTOR: AuthenticatedUser = { id: 'user-manager', role: Role.MANAGER };

const ENTRY: AuditRecordInput = {
  action: 'ASSIGN_TRAINING',
  resourceType: 'Training',
  resourceId: 'training-1',
  description: 'Treinamento atribuído.',
  metadata: { created: 3 },
};

function setup(
  options: { available?: boolean; createFails?: boolean; userMissing?: boolean } = {},
) {
  const { available = true, createFails = false, userMissing = false } = options;

  const audit: AuditRepository = {
    isAvailable: vi.fn(() => available),
    create: createFails
      ? vi.fn(() => Promise.reject(new Error('Mongo fora do ar')))
      : vi.fn(() => Promise.resolve()),
    findMany: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
  };

  const users: UsersRepository = {
    findByEmail: vi.fn(),
    findById: vi.fn(() =>
      Promise.resolve(userMissing ? null : ({ id: ACTOR.id, name: 'Ana Beatriz Rocha' } as User)),
    ),
    findExistingIds: vi.fn(),
  };

  return { audit, users, service: createAuditService({ audit, users }) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('record — best-effort', () => {
  it('grava a entrada com o nome do autor resolvido', async () => {
    const { audit, service } = setup();

    await service.record(ACTOR, ENTRY);

    expect(audit.create).toHaveBeenCalledWith({
      ...ENTRY,
      userId: ACTOR.id,
      userName: 'Ana Beatriz Rocha',
    });
  });

  // O ponto central da ADR 006: falha de auditoria não sobe.
  it('não lança quando a escrita falha', async () => {
    const { service } = setup({ createFails: true });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.record(ACTOR, ENTRY)).resolves.toBeUndefined();
  });

  it('registra a falha em stderr', async () => {
    const { service } = setup({ createFails: true });
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await service.record(ACTOR, ENTRY);

    expect(stderr).toHaveBeenCalledOnce();
    expect(String(stderr.mock.calls[0]?.[0])).toContain('ASSIGN_TRAINING');
  });

  it('não lança quando a busca do autor falha', async () => {
    const { users, service } = setup();
    vi.mocked(users.findById).mockRejectedValue(new Error('Postgres fora do ar'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.record(ACTOR, ENTRY)).resolves.toBeUndefined();
  });

  it('usa rótulo genérico quando o autor não é encontrado', async () => {
    const { audit, service } = setup({ userMissing: true });

    await service.record(ACTOR, ENTRY);

    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ userName: 'usuário desconhecido' }),
    );
  });

  // Mongo fora: nada é escrito e o Postgres não é consultado, mas a ação
  // auditável que ficou sem registro aparece no stderr.
  it('sem Mongo disponível não escreve nem consulta usuário, e registra o motivo', async () => {
    const { audit, users, service } = setup({ available: false });
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await service.record(ACTOR, ENTRY);

    expect(audit.create).not.toHaveBeenCalled();
    expect(users.findById).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledOnce();
    expect(String(stderr.mock.calls[0]?.[0])).toContain('MongoDB indisponível');
  });
});

describe('list — propaga indisponibilidade', () => {
  it('traduz filtros e paginação', async () => {
    const { audit, service } = setup();

    await service.list({ page: 2, limit: 10, action: 'PUBLISH_TRAINING' });

    expect(audit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PUBLISH_TRAINING', skip: 10, take: 10 }),
    );
  });

  // Leitura não pode mentir devolvendo lista vazia.
  it('falha de leitura vira 503, não lista vazia', async () => {
    const { audit, service } = setup();
    vi.mocked(audit.findMany).mockRejectedValue(new Error('Mongo fora do ar'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.list({ page: 1, limit: 20 })).rejects.toMatchObject({
      statusCode: 503,
      code: 'AUDIT_UNAVAILABLE',
    });
  });
});
