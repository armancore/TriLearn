const prisma = require('../utils/prisma')
const { getPagination } = require('../utils/pagination')
const logger = require('../utils/logger')
const { recordAuditLog } = require('../utils/audit')

// ================================
// CREATE NOTICE (Admin/Instructor)
// ================================
const createNotice = async (req, res) => {
  try {
    const { title, content, type } = req.body

    const notice = await prisma.notice.create({
      data: {
        title,
        content,
        type: type || 'GENERAL',
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
      metadata: { type: notice.type }
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
    const { type } = req.query
    const { page, limit, skip } = getPagination(req.query)

    const filters = {}
    if (type) filters.type = type

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

    const notice = await prisma.notice.findUnique({
      where: { id },
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
    const { title, content, type } = req.body

    const notice = await prisma.notice.findUnique({ where: { id } })
    if (!notice) {
      return res.status(404).json({ message: 'Notice not found' })
    }

    // Only the person who posted can update
    if (notice.postedBy !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'You can only update your own notices' })
    }

    const updated = await prisma.notice.update({
      where: { id },
      data: { title, content, type }
    })

    res.json({ message: 'Notice updated successfully!', notice: updated })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'NOTICE_UPDATED',
      entityType: 'Notice',
      entityId: updated.id,
      metadata: { type: updated.type }
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


