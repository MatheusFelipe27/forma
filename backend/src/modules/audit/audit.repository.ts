import { isMongoConnected } from '../../shared/database/mongoose';
import { AuditLog, type AuditAction } from './audit-log.schema';

export type AuditEntry = {
  userId: string;
  userName: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  description: string;
  metadata?: Record<string, unknown> | undefined;
};

export type AuditLogView = AuditEntry & { id: string; createdAt: Date };

export type AuditListFilter = {
  action?: string;
  resourceType?: string;
  resourceId?: string;
  userId?: string;
  skip: number;
  take: number;
};

export type AuditRepository = {
  isAvailable: () => boolean;
  create: (entry: AuditEntry) => Promise<void>;
  findMany: (filter: AuditListFilter) => Promise<{ items: AuditLogView[]; total: number }>;
};

export const auditRepository: AuditRepository = {
  isAvailable: isMongoConnected,

  async create(entry) {
    await AuditLog.create(entry);
  },

  async findMany({ action, resourceType, resourceId, userId, skip, take }) {
    if (!isMongoConnected()) {
      throw new Error('MongoDB indisponível para leitura de auditoria');
    }

    const where = {
      ...(action === undefined ? {} : { action }),
      ...(resourceType === undefined ? {} : { resourceType }),
      ...(resourceId === undefined ? {} : { resourceId }),
      ...(userId === undefined ? {} : { userId }),
    };

    const [documents, total] = await Promise.all([
      AuditLog.find(where).sort({ createdAt: -1 }).skip(skip).limit(take).lean(),
      AuditLog.countDocuments(where),
    ]);

    const items: AuditLogView[] = documents.map((document) => ({
      id: String(document._id),
      userId: document.userId,
      userName: document.userName,
      action: document.action as AuditAction,
      resourceType: document.resourceType,
      resourceId: document.resourceId,
      description: document.description,
      metadata: (document.metadata ?? undefined) as Record<string, unknown> | undefined,
      createdAt: document.createdAt,
    }));

    return { items, total };
  },
};
