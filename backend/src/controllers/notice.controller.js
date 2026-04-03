const prisma = require('../utils/prisma')
const { getPagination } = require('../utils/pagination')
const logger = require('../utils/logger')
const { recordAuditLog } = require('../utils/audit')
const { sanitizePlainText } = require('../utils/sanitize')

const validateSanitizedNotice = ({ title, content }, res) => {
  if (title.length < 3) {
    res.status(400).json({ message: 'Notice title must contain at least 3 plain-text characters' })
    return false
  }

  if (content.length < 10) {
    res.status(400).json({ message: 'Notice content must contain at least 10 plain-text characters' })
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

  if (req.user.role === 'COORDINATOR') {
    if (!req.coordinator?.department) {
      return {
        error: { status: 403, message: 'Coordinator department is not configured yet' }
      }
    }

    normalizedTarget.targetDepartment = req.coordinator.department
  }

  if (req.user.role === 'INSTRUCTOR') {
    if (normalizedAudience === 'INSTRUCTORS_ONLY') {
      return {
        error: { status: 403, message: 'Only admins and coordinators can post instructor-only notices' }
      }
    }

    if (req.instructor?.department) {
      normalizedTarget.targetDepartment = req.instructor.department
    }
  }

  if (
    normalizedTarget.targetDepartment &&
    req.user.role === 'ADMIN' &&
    typeof normalizedTarget.targetDepartment === 'string'
  ) {
    normalizedTarget.targetDepartment = normalizedTarget.targetDepartment.trim()
  }

  if (
    req.user.role === 'COORDINATOR' &&
    targetDepartment &&
    targetDepartment !== req.coordinator?.department
  ) {
    return {
      error: { status: 403, message: 'Coordinators can only target notices to their own department' }
    }
  }

  if (
    req.user.role === 'INSTRUCTOR' &&
    req.instructor?.department &&
    targetDepartment &&
    targetDepartment !== req.instructor.department
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

// ================================
// CREATE NOTICE (Admin/Instructor)
// ================================
const createNotice = async (req, res) => {
  try {
    const { title, content, type, audience, targetDepartment, targetSemester } = req.body
    const sanitizedTitle = sanitizePlainText(title)
    const sanitizedContent = sanitizePlainText(content)

    if (!validateSanitizedNotice({ title: sanitizedTitle, content: sanitizedContent }, res)) {
      return
    }

    const targeting = resolveNoticeTargeting(req, { audience, targetDepartment, targetSemester })
    if (targeting.error) {
      return res.status(targeting.error.status).json({ message: targeting.error.message })
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

    res.status(201).json({
      message: 'Notice created successfully!',
      notice
    })

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
    res.internalError(error)
  }
}

// ================================
// GET ALL NOTICES
// ================================
const getAllNotices = async (req, res) => {
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

    res.json({ total, page, limit, notices })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET NOTICE BY ID
// ================================
const getNoticeById = async (req, res) => {
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
      return res.status(404).json({ message: 'Notice not found' })
    }

    res.json({ notice })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// UPDATE NOTICE (Admin/Instructor)
// ================================
const updateNotice = async (req, res) => {
  try {
    const { id } = req.params
    const { title, content, type, audience, targetDepartment, targetSemester } = req.body
    const sanitizedTitle = sanitizePlainText(title)
    const sanitizedContent = sanitizePlainText(content)

    if (!validateSanitizedNotice({ title: sanitizedTitle, content: sanitizedContent }, res)) {
      return
    }

    const notice = await prisma.notice.findUnique({ where: { id } })
    if (!notice) {
      return res.status(404).json({ message: 'Notice not found' })
    }

    // Only the person who posted can update
    if (notice.postedBy !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'You can only update your own notices' })
    }

    const targeting = resolveNoticeTargeting(req, { audience, targetDepartment, targetSemester })
    if (targeting.error) {
      return res.status(targeting.error.status).json({ message: targeting.error.message })
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

    res.json({ message: 'Notice updated successfully!', notice: updated })

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
    res.internalError(error)
  }
}

// ================================
// DELETE NOTICE (Admin/Instructor)
// ================================
const deleteNotice = async (req, res) => {
  try {
    const { id } = req.params

    const notice = await prisma.notice.findUnique({ where: { id } })
    if (!notice) {
      return res.status(404).json({ message: 'Notice not found' })
    }

    if (notice.postedBy !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'You can only delete your own notices' })
    }

    await prisma.notice.delete({ where: { id } })

    res.json({ message: 'Notice deleted successfully!' })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'NOTICE_DELETED',
      entityType: 'Notice',
      entityId: id,
      metadata: { type: notice.type }
    })

  } catch (error) {
    res.internalError(error)
  }
}

module.exports = {
  createNotice,
  getAllNotices,
  getNoticeById,
  updateNotice,
  deleteNotice
}


