import { model, Schema, type InferSchemaType } from 'mongoose';

export const AUDIT_ACTIONS = [
  'ASSIGN_TRAINING',
  'PUBLISH_TRAINING',
  'ARCHIVE_TRAINING',
  'UNLOCK_ATTEMPTS',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const auditLogSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    userName: { type: String, required: true },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, required: true, index: true },
    description: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, required: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema> & { createdAt: Date };

export const AuditLog = model('AuditLog', auditLogSchema);
