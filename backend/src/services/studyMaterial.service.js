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
/**
 * Handles create material business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createMaterial = async (req, response) => {
  try {
    const { title, description, fileUrl, subjectId } = req.body
    const uploadedFileUrl = buildUploadedFileUrl(req.file)
    const finalFileUrl = uploadedFileUrl || fileUrl

    const access = await resolveMaterialManager(req, subjectId)
    if (access.error) {
      return response.status(access.error.status).json({ message: access.error.message })
    }

    if (!finalFileUrl) {
      return response.status(400).json({ message: 'Please upload a PDF or provide a file URL' })
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

    response.status(201).json({
      message: 'Study material uploaded successfully!',
      material
    })
  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// GET MATERIALS BY SUBJECT
// ================================
/**
 * Handles get materials by subject business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getMaterialsBySubject = async (req, response) => {
  try {
    const { subjectId } = req.params
    const where = { subjectId }

    if (req.user.role === 'INSTRUCTOR') {
      where.instructorId = req.instructor?.id || '__no_materials__'
    }

    if (req.user.role === 'STUDENT') {
      const student = req.student
      if (!student) {
        return response.status(403).json({ message: 'Student profile not found' })
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

    response.json({ total: materials.length, materials })
  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// GET ALL MATERIALS
// ================================
/**
 * Handles get all materials business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAllMaterials = async (req, response) => {
  try {
    const { page, limit, skip } = getPagination(req.query)
    const where = {}

    if (req.user.role === 'INSTRUCTOR') {
      where.instructorId = req.instructor?.id || '__no_materials__'
    }

    if (req.user.role === 'STUDENT') {
      const student = req.student
      if (!student) {
        return response.status(403).json({ message: 'Student profile not found' })
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

    response.json({ total, page, limit, materials })
  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// DELETE MATERIAL
// ================================
/**
 * Handles delete material business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteMaterial = async (req, response) => {
  try {
    const { id } = req.params

    const material = await prisma.studyMaterial.findUnique({ where: { id } })
    if (!material) {
      return response.status(404).json({ message: 'Material not found' })
    }

    if (req.user.role === 'INSTRUCTOR') {
      if (material.instructorId !== req.instructor?.id) {
        return response.status(403).json({ message: 'You can only delete your own materials' })
      }
    }

    await prisma.studyMaterial.delete({ where: { id } })

    response.json({ message: 'Material deleted successfully!' })
  } catch (error) {
    response.internalError(error)
  }
}

module.exports = {
  createMaterial,
  getMaterialsBySubject,
  getAllMaterials,
  deleteMaterial
}
