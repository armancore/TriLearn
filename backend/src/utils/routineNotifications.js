/** @typedef {import('@prisma/client').Routine & {subject?: {name: string, code: string}}} RoutineSnapshot */
/** @typedef {{event: string, routineId?: string, routine?: RoutineSnapshot}} RoutineJob */
const prisma = require('./prisma')
const { createNotifications } = require('./notifications')
const { inferRoutineLink } = require('./notificationLinks')
const {
  ROUTINE_NOTIFICATION_JOB,
  notificationQueue
} = require('../jobs/notificationQueue')

const WORKSHOP_NOTE = 'Laptop is compulsory for workshop.'

const getRoutineInclude = () => ({
  subject: {
    select: {
      id: true,
      name: true,
      code: true,
      semester: true,
      department: true
    }
  },
  instructor: {
    include: {
      user: {
        select: { name: true }
      }
    }
  }
})

/** @param {{department: string | null, semester: number, section: string | null, instructorId: string}} options */
const getRoutineNotificationRecipients = async ({ department, semester, section, instructorId }) => {
  const [students, instructor, coordinators] = await Promise.all([
    prisma.student?.findMany
      ? prisma.student.findMany({
          where: {
            semester,
            ...(department ? { department } : {}),
            ...(section ? { section } : {}),
            user: {
              isActive: true
            }
          },
          select: {
            userId: true
          }
        })
      : Promise.resolve([]),
    prisma.instructor?.findUnique
      ? prisma.instructor.findUnique({
          where: { id: instructorId },
          select: { userId: true }
        })
      : Promise.resolve(null),
    department && prisma.coordinator?.findMany
      ? prisma.coordinator.findMany({
          where: {
            department,
            user: {
              isActive: true
            }
          },
          select: { userId: true }
        })
      : Promise.resolve([])
  ])

  return [
    ...students.map((student) => ({ userId: student.userId, role: 'STUDENT' })),
    ...coordinators.map((coordinator) => ({ userId: coordinator.userId, role: 'COORDINATOR' })),
    instructor?.userId ? { userId: instructor.userId, role: 'INSTRUCTOR' } : null
  ].filter((recipient) => recipient !== null)
}

/** @param {{department: string | null, semester: number, section: string | null}} scope */
const getRoutineAudienceLabel = ({ department, semester, section }) => {
  const scope = section ? `Section ${section}` : 'All Sections'
  return `${department || 'General'} • Semester ${semester} • ${scope}`
}

/** @param {{recipients: {userId: string, role: string}[], routine: RoutineSnapshot, event: string, title: string, message: string, dedupeKeyFactory: (userId: string) => string}} options */
const notifyRoutineRecipients = async ({ recipients, routine, event, title, message, dedupeKeyFactory }) => {
  if (!recipients.length) {
    return { count: 0 }
  }

  const recipientsByLink = recipients.reduce((acc, recipient) => {
    const link = inferRoutineLink(recipient.role)
    if (!acc.has(link)) {
      acc.set(link, [])
    }
    acc.get(link).push(recipient.userId)
    return acc
  }, new Map())

  const results = await Promise.all([...recipientsByLink.entries()].map(([link, userIds]) => createNotifications({
    userIds,
    type: 'ROUTINE_UPDATED',
    title,
    message,
    link,
    metadata: {
      event,
      routineId: routine.id,
      subjectId: routine.subjectId,
      department: routine.department || null,
      semester: routine.semester,
      section: routine.section || null,
      dayOfWeek: routine.dayOfWeek,
      startTime: routine.startTime,
      endTime: routine.endTime,
      classType: routine.classType || 'LECTURE',
      note: routine.note || null
    },
    dedupeKeyFactory
  })))

  return {
    count: results.reduce((total, item) => total + (item?.count || 0), 0),
    results
  }
}

const notifyRoutineCreated = async (/** @type {RoutineSnapshot} */ routine) => {
  const recipients = await getRoutineNotificationRecipients({
    department: routine.department,
    semester: routine.semester,
    section: routine.section,
    instructorId: routine.instructorId
  })

  return notifyRoutineRecipients({
    recipients,
    routine,
    event: 'ROUTINE_CREATED',
    title: 'Subject added to routine',
    message: `${routine.subject?.name || 'A subject'} (${routine.subject?.code || 'N/A'}) ${routine.classType === 'WORKSHOP' ? 'workshop' : 'class'} was added on ${routine.dayOfWeek} ${routine.startTime}-${routine.endTime} for ${getRoutineAudienceLabel(routine)}.${routine.note ? ` ${routine.note}` : ''}`,
    dedupeKeyFactory: (/** @type {string} */ userId) => `routine-created:${routine.combinedGroupId || routine.id}:${userId}`
  })
}

const notifyRoutineDeleted = async (/** @type {RoutineSnapshot} */ routine) => {
  const recipients = await getRoutineNotificationRecipients({
    department: routine.department,
    semester: routine.semester,
    section: routine.section,
    instructorId: routine.instructorId
  })

  return notifyRoutineRecipients({
    recipients,
    routine,
    event: 'ROUTINE_DELETED',
    title: 'Subject removed from routine',
    message: `${routine.subject?.name || 'A subject'} (${routine.subject?.code || 'N/A'}) was removed from ${routine.dayOfWeek} ${routine.startTime}-${routine.endTime} for ${getRoutineAudienceLabel(routine)}.`,
    dedupeKeyFactory: (/** @type {string} */ userId) => `routine-deleted:${routine.id}:${userId}`
  })
}

const notifyRoutineUpdated = async (/** @type {RoutineSnapshot} */ routine) => {
  const recipients = await getRoutineNotificationRecipients({
    department: routine.department,
    semester: routine.semester,
    section: routine.section,
    instructorId: routine.instructorId
  })

  return notifyRoutineRecipients({
    recipients,
    routine,
    event: 'ROUTINE_UPDATED',
    title: 'Routine updated',
    message: `${routine.subject?.name || 'A subject'} (${routine.subject?.code || 'N/A'}) is now scheduled as ${String(routine.classType || 'LECTURE').toLowerCase()} on ${routine.dayOfWeek} ${routine.startTime}-${routine.endTime} for ${getRoutineAudienceLabel(routine)}.${routine.note ? ` ${routine.note}` : ''}`,
    dedupeKeyFactory: (/** @type {string} */ userId) => `routine-updated:${routine.id}:${Date.now()}:${userId}`
  })
}

const loadRoutine = async (/** @type {string | undefined} */ routineId, /** @type {RoutineSnapshot | undefined} */ routineSnapshot) => {
  if (routineSnapshot) {
    return routineSnapshot
  }

  if (!routineId || !prisma.routine?.findUnique) {
    return null
  }

  return prisma.routine.findUnique({
    where: { id: routineId },
    include: getRoutineInclude()
  })
}

/** @param {RoutineJob} options */
const processRoutineNotificationJob = async ({ event, routineId, routine }) => {
  const loadedRoutine = await loadRoutine(routineId, routine)
  if (!loadedRoutine) {
    return { count: 0 }
  }

  if (event === 'created') {
    return notifyRoutineCreated(loadedRoutine)
  }

  if (event === 'updated') {
    return notifyRoutineUpdated(loadedRoutine)
  }

  if (event === 'deleted') {
    return notifyRoutineDeleted(loadedRoutine)
  }

  throw new Error(`Unknown routine notification event: ${event}`)
}

/** @param {RoutineJob} options */
const enqueueRoutineNotification = async ({ event, routineId, routine }) => {
  const job = await notificationQueue.add(ROUTINE_NOTIFICATION_JOB, {
    event,
    routineId,
    routine
  }, {
    jobId: routineId && event !== 'updated' ? `routine-${event}-${routineId}` : undefined
  })

  if (job) {
    return {
      queued: true,
      jobId: job.id
    }
  }

  const result = await processRoutineNotificationJob({ event, routineId, routine })
  return {
    queued: false,
    jobId: null,
    ...result
  }
}

module.exports = {
  WORKSHOP_NOTE,
  enqueueRoutineNotification,
  getRoutineInclude,
  processRoutineNotificationJob
}
