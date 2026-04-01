const logger = require('./logger')
const prisma = require('./prisma')

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
    await db.auditLog.create({
      data: {
        actorId: actorId || null,
        actorRole: actorRole || null,
        action,
        entityType,
        entityId,
        metadata
      }
    })
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
  }
}

module.exports = { recordAuditLog }
