const logger = require('./logger')
const { startTokenCleanupJob } = require('../jobs/cleanupTokens')
const { createNotifications } = require('./notifications')

const DEFAULT_AUDIT_LOG_RETENTION_DAYS = 180
const DEFAULT_AUDIT_LOG_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const getAuditLogCutoff = () => {
  const retentionDays = parsePositiveInteger(process.env.AUDIT_LOG_RETENTION_DAYS, DEFAULT_AUDIT_LOG_RETENTION_DAYS)
  return new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000))
}

const runAuditLogCleanup = async (prisma) => {
  const cutoff = getAuditLogCutoff()
  const result = await prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoff }
    }
  })

  if (result.count > 0) {
    logger.info('Expired audit logs cleaned up', {
      deletedCount: result.count,
      retentionDays: parsePositiveInteger(process.env.AUDIT_LOG_RETENTION_DAYS, DEFAULT_AUDIT_LOG_RETENTION_DAYS)
    })
  }
}

const runAssignmentDueNotifications = async (prisma) => {
  const now = new Date()
  const nextDay = new Date(now.getTime() + (24 * 60 * 60 * 1000))

  const assignments = await prisma.assignment.findMany({
    where: {
      dueDate: {
        gt: now,
        lte: nextDay
      }
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true,
          code: true,
          enrollments: {
            select: {
              student: {
                select: {
                  userId: true
                }
              }
            }
          }
        }
      }
    }
  })

  for (const assignment of assignments) {
    const dueLabel = assignment.dueDate.toISOString().slice(0, 10)

    await createNotifications({
      userIds: assignment.subject.enrollments.map((enrollment) => enrollment.student.userId),
      type: 'ASSIGNMENT_DUE',
      title: `Assignment due soon: ${assignment.title}`,
      message: `${assignment.subject.name} (${assignment.subject.code}) is due by ${assignment.dueDate.toLocaleString()}.`,
      link: '/student/assignments',
      metadata: {
        assignmentId: assignment.id,
        subjectId: assignment.subject.id,
        dueDate: assignment.dueDate.toISOString()
      },
      dedupeKeyFactory: (userId) => `assignment-due:${assignment.id}:${userId}:${dueLabel}`
    })
  }
}

const scheduleMaintenance = (prisma) => {
  const auditLogCleanupInterval = parsePositiveInteger(
    process.env.AUDIT_LOG_CLEANUP_INTERVAL_MS,
    DEFAULT_AUDIT_LOG_CLEANUP_INTERVAL_MS
  )

  const safeRun = (taskName, task) => async () => {
    try {
      await task(prisma)
    } catch (error) {
      logger.error(`Maintenance task failed: ${taskName}`, { message: error.message, stack: error.stack })
    }
  }

  const auditLogTask = safeRun('audit-log-cleanup', runAuditLogCleanup)
  const assignmentDueNotificationTask = safeRun('assignment-due-notifications', runAssignmentDueNotifications)
  void auditLogTask()
  void assignmentDueNotificationTask()

  const tokenCleanupJob = startTokenCleanupJob(prisma)

  const auditLogTimer = setInterval(() => {
    void auditLogTask()
    void assignmentDueNotificationTask()
  }, auditLogCleanupInterval)
  auditLogTimer.unref?.()

  return {
    stop: () => {
      tokenCleanupJob.stop()
      clearInterval(auditLogTimer)
    }
  }
}

module.exports = {
  scheduleMaintenance
}
