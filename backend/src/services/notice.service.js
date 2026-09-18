const { createServiceResponder } = require('../utils/serviceResult')
const prisma = require('../utils/prisma')
const {
  getInstructorDepartments,
  instructorHasDepartment
} = require('../utils/instructorDepartments')
const { getPagination } = require('../utils/pagination')
const { recordAuditLog } = require('../utils/audit')
const { sanitizePlainText } = require('../utils/sanitize')
const { createNoticeNotifications } = require('../utils/noticeNotifications')
const {
  NOTICE_POSTED_JOB,
  notificationQueue
} = require('../jobs/notificationQueue')

/** @param {{title: string, content: string}} notice @param {import("../utils/serviceResult").ServiceResponder} result */
const validateSanitizedNotice = ({ title, content }, /** @type {import("../utils/serviceResult").ServiceResponder} */ result) => {
  if (title.length < 3) {
    result.withStatus(400, { message: 'Notice title must contain at least 3 plain-text characters' })
    return false
  }

  if (content.length < 10) {
    result.withStatus(400, { message: 'Notice content must contain at least 10 plain-text characters' })
    return false
  }

  return true
}

/** @returns {import("@prisma/client").Prisma.StringFilter} */
const buildContainsSearch = (/** @type {string} */ search) => ({
  contains: search,
  mode: 'insensitive'
})

/** @returns {import("@prisma/client").Prisma.NoticeWhereInput} */
const getStudentNoticeVisibilityFilters = (/** @type {{department: string | null, semester: number} | null} */ student) => {
  if (!student) {
    return {
      id: { equals: '__no_visible_notice__' }
    }
  }

  const departmentFilter = student.department
    ? { OR: [{ targetDepartment: null }, { targetDepartment: student.department }] }
    : { targetDepartment: null }

  return {
    AND: [
      { audience: { in: ['ALL', 'STUDENTS'] } },
      departmentFilter,
      {
        OR: [
          { targetSemester: null },
          { targetSemester: student.semester }
        ]
      }
    ]
  }
}

const getVisibleNoticeFilters = (/** @type {ReturnType<typeof import('../utils/controllerAdapter').buildServiceContext>} */ context, /** @type {{type?: import("@prisma/client").NoticeType, audience?: import("@prisma/client").NoticeAudience}} */ { type, audience } = {}) => {
  /** @type {import("@prisma/client").Prisma.NoticeWhereInput} */
  const filters = {}

  if (type) {
    filters.type = type
  }

  if (context.user.role === 'STUDENT') {
    Object.assign(filters, getStudentNoticeVisibilityFilters(context.student))
    return filters
  }

  if (context.user.role === 'INSTRUCTOR') {
    /** @type {import('@prisma/client').NoticeAudience[]} */
    const visibleAudiences = ['ALL', 'INSTRUCTORS_ONLY']
    if (audience && !visibleAudiences.includes(audience)) return { id: '__no_visible_notice__' }
    filters.audience = audience || { in: visibleAudiences }
    return filters
  }

  if (audience) {
    filters.audience = audience
  }

  return filters
}

const resolveNoticeTargeting = (/** @type {ReturnType<typeof import('../utils/controllerAdapter').buildServiceContext>} */ context, /** @type {{audience?: import("@prisma/client").NoticeAudience, targetDepartment?: string | null, targetSemester?: number | null}} */ { audience, targetDepartment, targetSemester }) => {
  const normalizedAudience = audience || 'ALL'
  const normalizedTarget = {
    audience: normalizedAudience,
    targetDepartment: targetDepartment || null,
    targetSemester: typeof targetSemester === "number" && Number.isInteger(targetSemester) ? targetSemester : null
  }

  if (normalizedAudience === 'INSTRUCTORS_ONLY') {
    normalizedTarget.targetSemester = null
  }

  if (context.user.role === 'INSTRUCTOR') {
    const instructorDepartments = getInstructorDepartments(context.instructor)

    if (normalizedAudience === 'INSTRUCTORS_ONLY') {
      return {
        error: { status: 403, message: 'Only admins and coordinators can post instructor-only notices' }
      }
    }

    if (!targetDepartment && instructorDepartments.length > 0) {
      normalizedTarget.targetDepartment = instructorDepartments[0]
    }
  }

  if (context.user.role === 'COORDINATOR') {
    const coordinatorDepartment = context.coordinator?.department

    if (!coordinatorDepartment) {
      return {
        error: { status: 403, message: 'Coordinator department is not configured yet' }
      }
    }

    if (targetDepartment && targetDepartment !== coordinatorDepartment) {
      return {
        error: { status: 403, message: 'Coordinators can only target notices to their own department' }
      }
    }

    normalizedTarget.targetDepartment = coordinatorDepartment
  }

  if (
    normalizedTarget.targetDepartment &&
    context.user.role === 'ADMIN' &&
    typeof normalizedTarget.targetDepartment === 'string'
  ) {
    normalizedTarget.targetDepartment = normalizedTarget.targetDepartment.trim()
  }

  if (
    context.user.role === 'INSTRUCTOR' &&
    getInstructorDepartments(context.instructor).length > 0 &&
    targetDepartment &&
    !instructorHasDepartment(context.instructor, targetDepartment)
  ) {
    return {
      error: { status: 403, message: 'Instructors can only target notices to their own department' }
    }
  }

  if (normalizedAudience === 'INSTRUCTORS_ONLY' && !['ADMIN', 'COORDINATOR'].includes(context.user.role)) {
    return {
      error: { status: 403, message: 'Only admins and coordinators can post instructor-only notices' }
    }
  }

  return { data: normalizedTarget }
}

const notifyUsersAboutNotice = async (/** @type {import('@prisma/client').Notice & { user: Pick<import('@prisma/client').User, 'name' | 'role'> }} */ notice) => {
  const job = await notificationQueue.add(NOTICE_POSTED_JOB, {
    notice: {
      id: notice.id,
      title: notice.title,
      content: notice.content,
      audience: notice.audience,
      type: notice.type,
      targetDepartment: notice.targetDepartment,
      targetSemester: notice.targetSemester,
      postedBy: notice.postedBy
    }
  }, {
    jobId: `notice:${notice.id}`
  })

  if (!job) {
    await createNoticeNotifications({ notice })
  }
}

const coordinatorCanManageNotice = (/** @type {ReturnType<typeof import('../utils/controllerAdapter').buildServiceContext>} */ context, /** @type {import("@prisma/client").Notice} */ notice) => (
  context.user.role === 'COORDINATOR' &&
  context.coordinator?.department &&
  notice.targetDepartment === context.coordinator.department
)

const canManageNotice = (/** @type {ReturnType<typeof import('../utils/controllerAdapter').buildServiceContext>} */ context, /** @type {import("@prisma/client").Notice} */ notice) => (
  notice.postedBy === context.user.id ||
  context.user.role === 'ADMIN' ||
  coordinatorCanManageNotice(context, notice)
)

// ================================
// CREATE NOTICE (Admin/Instructor)
// ================================
/**
 * Handles create notice business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const createNotice = async (context, result = createServiceResponder()) => {
    const { title, content, type, audience, targetDepartment, targetSemester } = context.body
  const sanitizedTitle = sanitizePlainText(title)
  const sanitizedContent = sanitizePlainText(content)

  if (!validateSanitizedNotice({ title: sanitizedTitle, content: sanitizedContent }, result)) {
    return
  }

  const targeting = resolveNoticeTargeting(context, { audience, targetDepartment, targetSemester })
  if (targeting.error) {
    return result.withStatus(targeting.error.status, { message: targeting.error.message })
  }

  const notice = await prisma.notice.create({
    data: {
      title: sanitizedTitle,
      content: sanitizedContent,
      type: type || 'GENERAL',
      audience: targeting.data.audience,
      targetDepartment: targeting.data.targetDepartment,
      targetSemester: targeting.data.targetSemester,
      postedBy: context.user.id
    },
    include: {
      user: { select: { name: true, role: true } }
    }
  })

  result.withStatus(201, {
    message: 'Notice created successfully!',
    notice
  })

  await notifyUsersAboutNotice(notice)

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'NOTICE_CREATED',
    entityType: 'Notice',
    entityId: notice.id,
    metadata: {
      type: notice.type,
      audience: notice.audience,
      targetDepartment: notice.targetDepartment,
      targetSemester: notice.targetSemester
    }
  })

}

// ================================
// GET ALL NOTICES
// ================================
/**
 * Handles get all notices business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const getAllNotices = async (context, result = createServiceResponder()) => {
    const { type, audience, search } = context.query
  const { page, limit, skip } = getPagination(context.query)

  const filters = getVisibleNoticeFilters(context, { type, audience })
  if (search) {
    filters.AND = [
      ...(Array.isArray(filters.AND) ? filters.AND : filters.AND ? [filters.AND] : []),
      {
        OR: [
          { title: buildContainsSearch(search) },
          { content: buildContainsSearch(search) },
          { targetDepartment: buildContainsSearch(search) },
          { user: { is: { name: buildContainsSearch(search) } } }
        ]
      }
    ]
  }

  const [notices, total] = await Promise.all([
    prisma.notice.findMany({
      where: filters,
      skip,
      take: limit,
      include: {
        user: { select: { name: true, role: true } }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.notice.count({ where: filters })
  ])

  result.ok({ total, page, limit, notices })

}

// ================================
// GET NOTICE BY ID
// ================================
/**
 * Handles get notice by id business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const getNoticeById = async (context, result = createServiceResponder()) => {
    const { id } = context.params

  const notice = await prisma.notice.findFirst({
    where: {
      id,
      ...getVisibleNoticeFilters(context)
    },
    include: {
      user: { select: { name: true, role: true } }
    }
  })

  if (!notice) {
    return result.withStatus(404, { message: 'Notice not found' })
  }

  result.ok({ notice })

}

// ================================
// UPDATE NOTICE (Admin/Instructor)
// ================================
/**
 * Handles update notice business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const updateNotice = async (context, result = createServiceResponder()) => {
    const { id } = context.params
  const { title, content, type, audience, targetDepartment, targetSemester } = context.body
  const sanitizedTitle = sanitizePlainText(title)
  const sanitizedContent = sanitizePlainText(content)

  if (!validateSanitizedNotice({ title: sanitizedTitle, content: sanitizedContent }, result)) {
    return
  }

  const notice = await prisma.notice.findUnique({ where: { id } })
  if (!notice) {
    return result.withStatus(404, { message: 'Notice not found' })
  }

  // Admins are notice moderators across departments; coordinators can manage
  // department-targeted notices for their own department.
  if (!canManageNotice(context, notice)) {
    return result.withStatus(403, { message: 'You can only update notices you own or manage in your department' })
  }

  const targeting = resolveNoticeTargeting(context, { audience, targetDepartment, targetSemester })
  if (targeting.error) {
    return result.withStatus(targeting.error.status, { message: targeting.error.message })
  }

  const updated = await prisma.notice.update({
    where: { id },
    data: {
      title: sanitizedTitle,
      content: sanitizedContent,
      type,
      audience: targeting.data.audience,
      targetDepartment: targeting.data.targetDepartment,
      targetSemester: targeting.data.targetSemester
    }
  })

  result.ok({ message: 'Notice updated successfully!', notice: updated })

  await createNoticeNotifications({
    notice: {
      ...updated,
      postedBy: context.user.id
    },
    title: `Notice updated: ${updated.title}`,
    message: updated.content,
    event: 'NOTICE_UPDATED',
    excludeUserId: context.user.id
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'NOTICE_UPDATED',
    entityType: 'Notice',
    entityId: updated.id,
    metadata: {
      type: updated.type,
      audience: updated.audience,
      targetDepartment: updated.targetDepartment,
      targetSemester: updated.targetSemester
    }
  })

}

// ================================
// DELETE NOTICE (Admin/Instructor)
// ================================
/**
 * Handles delete notice business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const deleteNotice = async (context, result = createServiceResponder()) => {
    const { id } = context.params

  const notice = await prisma.notice.findUnique({ where: { id } })
  if (!notice) {
    return result.withStatus(404, { message: 'Notice not found' })
  }

  // Admins are notice moderators across departments; coordinators can manage
  // department-targeted notices for their own department.
  if (!canManageNotice(context, notice)) {
    return result.withStatus(403, { message: 'You can only delete notices you own or manage in your department' })
  }

  await prisma.notice.delete({ where: { id } })

  result.ok({ message: 'Notice deleted successfully!' })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'NOTICE_DELETED',
    entityType: 'Notice',
    entityId: id,
    metadata: { type: notice.type }
  })

}

module.exports = {
  createNotice,
  getAllNotices,
  getNoticeById,
  updateNotice,
  deleteNotice
}


