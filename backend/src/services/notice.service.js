const prisma = require('../utils/prisma')
const {
  getInstructorDepartments,
  instructorHasDepartment
} = require('../utils/instructorDepartments')
const { getPagination } = require('../utils/pagination')
const { recordAuditLog } = require('../utils/audit')
const { sanitizePlainText } = require('../utils/sanitize')
const {
  NOTICE_POSTED_JOB,
  notificationQueue
} = require('../jobs/notificationQueue')

const validateSanitizedNotice = ({ title, content }, response) => {
  if (title.length < 3) {
    response.status(400).json({ message: 'Notice title must contain at least 3 plain-text characters' })
    return false
  }

  if (content.length < 10) {
    response.status(400).json({ message: 'Notice content must contain at least 10 plain-text characters' })
    return false
  }

  return true
}

const buildContainsSearch = (search) => ({
  contains: search,
  mode: 'insensitive'
})

const getStudentNoticeVisibilityFilters = (student) => {
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

const getVisibleNoticeFilters = (req, { type, audience } = {}) => {
  const filters = {}

  if (type) {
    filters.type = type
  }

  if (req.user.role === 'STUDENT') {
    Object.assign(filters, getStudentNoticeVisibilityFilters(req.student))
    return filters
  }

  if (req.user.role === 'INSTRUCTOR') {
    const visibleAudiences = ['ALL', 'INSTRUCTORS_ONLY']
    filters.audience = audience
      ? (visibleAudiences.includes(audience) ? audience : '__no_visible_notice__')
      : { in: visibleAudiences }
    return filters
  }

  if (audience) {
    filters.audience = audience
  }

  return filters
}

const resolveNoticeTargeting = (req, { audience, targetDepartment, targetSemester }) => {
  const normalizedAudience = audience || 'ALL'
  const normalizedTarget = {
    audience: normalizedAudience,
    targetDepartment: targetDepartment || null,
    targetSemester: Number.isInteger(targetSemester) ? targetSemester : null
  }

  if (normalizedAudience === 'INSTRUCTORS_ONLY') {
    normalizedTarget.targetSemester = null
  }

  if (req.user.role === 'INSTRUCTOR') {
    const instructorDepartments = getInstructorDepartments(req.instructor)

    if (normalizedAudience === 'INSTRUCTORS_ONLY') {
      return {
        error: { status: 403, message: 'Only admins and coordinators can post instructor-only notices' }
      }
    }

    if (!targetDepartment && instructorDepartments.length > 0) {
      normalizedTarget.targetDepartment = instructorDepartments[0]
    }
  }

  if (req.user.role === 'COORDINATOR') {
    const coordinatorDepartment = req.coordinator?.department

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
    req.user.role === 'ADMIN' &&
    typeof normalizedTarget.targetDepartment === 'string'
  ) {
    normalizedTarget.targetDepartment = normalizedTarget.targetDepartment.trim()
  }

  if (
    req.user.role === 'INSTRUCTOR' &&
    getInstructorDepartments(req.instructor).length > 0 &&
    targetDepartment &&
    !instructorHasDepartment(req.instructor, targetDepartment)
  ) {
    return {
      error: { status: 403, message: 'Instructors can only target notices to their own department' }
    }
  }

  if (normalizedAudience === 'INSTRUCTORS_ONLY' && !['ADMIN', 'COORDINATOR'].includes(req.user.role)) {
    return {
      error: { status: 403, message: 'Only admins and coordinators can post instructor-only notices' }
    }
  }

  return { data: normalizedTarget }
}

const notifyUsersAboutNotice = async (notice) => {
  await notificationQueue.add(NOTICE_POSTED_JOB, {
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
}

const coordinatorCanManageNotice = (req, notice) => (
  req.user.role === 'COORDINATOR' &&
  req.coordinator?.department &&
  notice.targetDepartment === req.coordinator.department
)

const canManageNotice = (req, notice) => (
  notice.postedBy === req.user.id ||
  req.user.role === 'ADMIN' ||
  coordinatorCanManageNotice(req, notice)
)

// ================================
// CREATE NOTICE (Admin/Instructor)
// ================================
/**
 * Handles create notice business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createNotice = async (req, response) => {
  try {
    const { title, content, type, audience, targetDepartment, targetSemester } = req.body
    const sanitizedTitle = sanitizePlainText(title)
    const sanitizedContent = sanitizePlainText(content)

    if (!validateSanitizedNotice({ title: sanitizedTitle, content: sanitizedContent }, response)) {
      return
    }

    const targeting = resolveNoticeTargeting(req, { audience, targetDepartment, targetSemester })
    if (targeting.error) {
      return response.status(targeting.error.status).json({ message: targeting.error.message })
    }

    const notice = await prisma.notice.create({
      data: {
        title: sanitizedTitle,
        content: sanitizedContent,
        type: type || 'GENERAL',
        audience: targeting.data.audience,
        targetDepartment: targeting.data.targetDepartment,
        targetSemester: targeting.data.targetSemester,
        postedBy: req.user.id
      },
      include: {
        user: { select: { name: true, role: true } }
      }
    })

    response.status(201).json({
      message: 'Notice created successfully!',
      notice
    })

    await notifyUsersAboutNotice(notice)

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
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

  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// GET ALL NOTICES
// ================================
/**
 * Handles get all notices business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAllNotices = async (req, response) => {
  try {
    const { type, audience, search } = req.query
    const { page, limit, skip } = getPagination(req.query)

    const filters = getVisibleNoticeFilters(req, { type, audience })
    if (search) {
      filters.AND = [
        ...(filters.AND || []),
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

    response.json({ total, page, limit, notices })

  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// GET NOTICE BY ID
// ================================
/**
 * Handles get notice by id business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getNoticeById = async (req, response) => {
  try {
    const { id } = req.params

    const notice = await prisma.notice.findFirst({
      where: {
        id,
        ...getVisibleNoticeFilters(req)
      },
      include: {
        user: { select: { name: true, role: true } }
      }
    })

    if (!notice) {
      return response.status(404).json({ message: 'Notice not found' })
    }

    response.json({ notice })

  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// UPDATE NOTICE (Admin/Instructor)
// ================================
/**
 * Handles update notice business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const updateNotice = async (req, response) => {
  try {
    const { id } = req.params
    const { title, content, type, audience, targetDepartment, targetSemester } = req.body
    const sanitizedTitle = sanitizePlainText(title)
    const sanitizedContent = sanitizePlainText(content)

    if (!validateSanitizedNotice({ title: sanitizedTitle, content: sanitizedContent }, response)) {
      return
    }

    const notice = await prisma.notice.findUnique({ where: { id } })
    if (!notice) {
      return response.status(404).json({ message: 'Notice not found' })
    }

    // Admins are notice moderators across departments; coordinators can manage
    // department-targeted notices for their own department.
    if (!canManageNotice(req, notice)) {
      return response.status(403).json({ message: 'You can only update notices you own or manage in your department' })
    }

    const targeting = resolveNoticeTargeting(req, { audience, targetDepartment, targetSemester })
    if (targeting.error) {
      return response.status(targeting.error.status).json({ message: targeting.error.message })
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

    response.json({ message: 'Notice updated successfully!', notice: updated })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
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

  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// DELETE NOTICE (Admin/Instructor)
// ================================
/**
 * Handles delete notice business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteNotice = async (req, response) => {
  try {
    const { id } = req.params

    const notice = await prisma.notice.findUnique({ where: { id } })
    if (!notice) {
      return response.status(404).json({ message: 'Notice not found' })
    }

    // Admins are notice moderators across departments; coordinators can manage
    // department-targeted notices for their own department.
    if (!canManageNotice(req, notice)) {
      return response.status(403).json({ message: 'You can only delete notices you own or manage in your department' })
    }

    await prisma.notice.delete({ where: { id } })

    response.json({ message: 'Notice deleted successfully!' })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'NOTICE_DELETED',
      entityType: 'Notice',
      entityId: id,
      metadata: { type: notice.type }
    })

  } catch (error) {
    response.internalError(error)
  }
}

module.exports = {
  createNotice,
  getAllNotices,
  getNoticeById,
  updateNotice,
  deleteNotice
}


