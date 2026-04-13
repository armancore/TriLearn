const prisma = require('../utils/prisma')
const { getPagination } = require('../utils/pagination')
const { buildUploadedFileUrl } = require('../utils/fileStorage')
const { sanitizePlainText } = require('../utils/sanitize')

const resolveMaterialManager = async (req, subjectId) => {
  const { user, instructor } = req
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId }
  })

  if (!subject) {
    return { error: { status: 404, message: 'Subject not found' } }
  }

  if (user.role === 'COORDINATOR' || user.role === 'ADMIN') {
    if (!subject.instructorId) {
      return { error: { status: 400, message: 'Assign an instructor to this subject before uploading materials' } }
    }

    return { subject, instructorId: subject.instructorId }
  }

  if (!instructor) {
    return { error: { status: 403, message: 'Instructor profile not found' } }
  }

  if (!subject.instructorId) {
    return { error: { status: 403, message: 'No instructor assigned to this subject' } }
  }

  if (subject.instructorId !== instructor.id) {
    return { error: { status: 403, message: 'You can only upload materials for your assigned subjects' } }
  }

  return { subject, instructorId: instructor.id }
}

// ================================
// CREATE STUDY MATERIAL
// ================================
const createMaterial = async (req, res) => {
  try {
    const { title, description, fileUrl, subjectId } = req.body
    const uploadedFileUrl = buildUploadedFileUrl(req.file)
    const finalFileUrl = uploadedFileUrl || fileUrl

    const access = await resolveMaterialManager(req, subjectId)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

    if (!finalFileUrl) {
      return res.status(400).json({ message: 'Please upload a PDF or provide a file URL' })
    }

    const sanitizedTitle = sanitizePlainText(title)
    const sanitizedDescription = sanitizePlainText(description)

    const material = await prisma.studyMaterial.create({
      data: {
        title: sanitizedTitle,
        description: sanitizedDescription,
        fileUrl: finalFileUrl,
        subjectId,
        instructorId: access.instructorId
      },
      include: {
        subject: { select: { name: true, code: true } },
        instructor: { include: { user: { select: { name: true } } } }
      }
    })

    res.status(201).json({
      message: 'Study material uploaded successfully!',
      material
    })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET MATERIALS BY SUBJECT
// ================================
const getMaterialsBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params
    const where = { subjectId }

    if (req.user.role === 'INSTRUCTOR') {
      where.instructorId = req.instructor?.id || '__no_materials__'
    }

    if (req.user.role === 'STUDENT') {
      const student = req.student
      if (!student) {
        return res.status(403).json({ message: 'Student profile not found' })
      }

      where.subject = {
        enrollments: {
          some: {
            studentId: student.id
          }
        }
      }
    }

    const materials = await prisma.studyMaterial.findMany({
      where,
      include: {
        instructor: { include: { user: { select: { name: true } } } },
        subject: { select: { name: true, code: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json({ total: materials.length, materials })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET ALL MATERIALS
// ================================
const getAllMaterials = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query)
    const where = {}

    if (req.user.role === 'INSTRUCTOR') {
      where.instructorId = req.instructor?.id || '__no_materials__'
    }

    if (req.user.role === 'STUDENT') {
      const student = req.student
      if (!student) {
        return res.status(403).json({ message: 'Student profile not found' })
      }

      where.subject = {
        enrollments: {
          some: {
            studentId: student.id
          }
        }
      }
    }

    const [materials, total] = await Promise.all([
      prisma.studyMaterial.findMany({
        where,
        include: {
          instructor: { include: { user: { select: { name: true } } } },
          subject: { select: { name: true, code: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.studyMaterial.count({ where })
    ])

    res.json({ total, page, limit, materials })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// DELETE MATERIAL
// ================================
const deleteMaterial = async (req, res) => {
  try {
    const { id } = req.params

    const material = await prisma.studyMaterial.findUnique({ where: { id } })
    if (!material) {
      return res.status(404).json({ message: 'Material not found' })
    }

    if (req.user.role === 'INSTRUCTOR') {
      if (material.instructorId !== req.instructor?.id) {
        return res.status(403).json({ message: 'You can only delete your own materials' })
      }
    }

    await prisma.studyMaterial.delete({ where: { id } })

    res.json({ message: 'Material deleted successfully!' })
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = {
  createMaterial,
  getMaterialsBySubject,
  getAllMaterials,
  deleteMaterial
}
