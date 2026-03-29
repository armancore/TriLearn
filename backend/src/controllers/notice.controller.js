const prisma = require('../utils/prisma')

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

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// GET ALL NOTICES
// ================================
const getAllNotices = async (req, res) => {
  try {
    const { type } = req.query

    const filters = {}
    if (type) filters.type = type

    const notices = await prisma.notice.findMany({
      where: filters,
      include: {
        user: { select: { name: true, role: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json({ total: notices.length, notices })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
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
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
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

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
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

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

module.exports = {
  createNotice,
  getAllNotices,
  getNoticeById,
  updateNotice,
  deleteNotice
}