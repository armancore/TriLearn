const { errorInfo } = require('./errorInfo')
const logger = require('./logger')
const { captureException } = require('./monitoring')
const { startTokenCleanupJob } = require('../jobs/cleanupTokens')
const { createNotifications } = require('./notifications')
const { syncClosedRoutineAbsences } = require('../controllers/attendance/shared')

const DEFAULT_AUDIT_LOG_RETENTION_DAYS = 180
const DEFAULT_AUDIT_LOG_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000
const DEFAULT_ATTENDANCE_SYNC_INTERVAL_MS = 5 * 60 * 1000

const parsePositiveInteger = (/** @type {string | undefined} */ value, /** @type {number} */ fallback) => {
  const parsed = Number.parseInt(value || "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const getAuditLogCutoff = () => {
  const retentionDays = parsePositiveInteger(process.env.AUDIT_LOG_RETENTION_DAYS, DEFAULT_AUDIT_LOG_RETENTION_DAYS)
  return new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000))
}

const runAuditLogCleanup = async (/** @type {import('@prisma/client').Prisma.TransactionClient} */ prisma) => {
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

const runAssignmentDueNotifications = async (/** @type {import('@prisma/client').Prisma.TransactionClient} */ prisma) => {
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

const runClosedRoutineAbsenceSync = async () => {
  await syncClosedRoutineAbsences(new Date())
}

const scheduleMaintenance = (/** @type {import('@prisma/client').Prisma.TransactionClient} */ prisma) => {
  const auditLogCleanupInterval = parsePositiveInteger(
    process.env.AUDIT_LOG_CLEANUP_INTERVAL_MS,
    DEFAULT_AUDIT_LOG_CLEANUP_INTERVAL_MS
  )
  const attendanceSyncInterval = parsePositiveInteger(
    process.env.ATTENDANCE_SYNC_INTERVAL_MS,
    DEFAULT_ATTENDANCE_SYNC_INTERVAL_MS
  )

  const createScheduledTask = (/** @type {string} */ taskName, /** @type {(client: import("@prisma/client").Prisma.TransactionClient) => Promise<unknown>} */ task) => {
    let running = false

    return async () => {
      if (running) {
        logger.warn(`Skipping overlapping maintenance task: ${taskName}`)
        return
      }

      running = true

      try {
        await task(prisma)
      } catch (error) {
        logger.error(`Maintenance task failed: ${taskName}`, { message: errorInfo(error).message, stack: errorInfo(error).stack })
        captureException(error, { tags: { taskName } })
      } finally {
        running = false
      }
    }
  }

  const runScheduledTask = (/** @type {string} */ taskName, /** @type {() => Promise<void>} */ task) => {
    task().catch((error) => {
      logger.error(`Maintenance scheduler failed to start task: ${taskName}`, {
        message: error.message,
        stack: error.stack
      })
      captureException(error, { tags: { taskName, scheduler: 'maintenance' } })
    })
  }

  const auditLogTask = createScheduledTask('audit-log-cleanup', runAuditLogCleanup)
  const assignmentDueNotificationTask = createScheduledTask('assignment-due-notifications', runAssignmentDueNotifications)
  const closedRoutineAbsenceSyncTask = createScheduledTask('closed-routine-absence-sync', runClosedRoutineAbsenceSync)
  runScheduledTask('audit-log-cleanup', auditLogTask)
  runScheduledTask('assignment-due-notifications', assignmentDueNotificationTask)
  runScheduledTask('closed-routine-absence-sync', closedRoutineAbsenceSyncTask)

  const tokenCleanupJob = startTokenCleanupJob(prisma)

  const auditLogTimer = setInterval(() => {
    runScheduledTask('audit-log-cleanup', auditLogTask)
    runScheduledTask('assignment-due-notifications', assignmentDueNotificationTask)
  }, auditLogCleanupInterval)
  auditLogTimer.unref?.()

  const attendanceSyncTimer = setInterval(() => {
    runScheduledTask('closed-routine-absence-sync', closedRoutineAbsenceSyncTask)
  }, attendanceSyncInterval)
  attendanceSyncTimer.unref?.()

  return {
    stop: () => {
      tokenCleanupJob.stop()
      clearInterval(auditLogTimer)
      clearInterval(attendanceSyncTimer)
    }
  }
}

module.exports = {
  scheduleMaintenance
}
