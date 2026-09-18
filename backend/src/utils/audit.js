const logger = require('./logger')
const prisma = require('./prisma')

/**
 * @param {{ actorId: string, actorRole?: import('@prisma/client').Role | null, action: string,
 * entityType: string, entityId?: string | null,
 * metadata?: import('@prisma/client').Prisma.InputJsonObject | null,
 * db?: Pick<typeof prisma, 'auditLog'> }} options
 */
const recordAuditLog = async ({
  actorId,
  actorRole,
  action,
  entityType,
  entityId = null,
  metadata = null,
  db = prisma
}) => {
  try {
    if (!actorId) {
      logger.warn('Skipping audit log without actorId', { action, entityType, entityId })
      return null
    }

    const normalizedMetadata = metadata == null || (typeof metadata === 'object' && !Array.isArray(metadata))
      ? metadata
      : null

    if (metadata !== normalizedMetadata) {
      logger.warn('Ignoring invalid audit log metadata payload')
    }

    await db.auditLog.create({
      data: {
        actorId,
        actorRole: actorRole || null,
        action,
        entityType,
        entityId,
        metadata: normalizedMetadata ?? undefined
      }
    })
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error), { error })
  }
}

module.exports = { recordAuditLog }
