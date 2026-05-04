const { createServiceResponder } = require('../utils/serviceResult')
const prisma = require('../utils/prisma')
const { getPagination } = require('../utils/pagination')
const { buildUploadedFileUrl } = require('../utils/fileStorage')
const { sanitizePlainText } = require('../utils/sanitize')

const resolveMaterialManager = async (context, subjectId) => {
  const { user, instructor } = context
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
const createMaterial = async (context, result = createServiceResponder()) => {
    const { title, description, fileUrl, subjectId } = context.body
  const uploadedFileUrl = buildUploadedFileUrl(context.file)
  const finalFileUrl = uploadedFileUrl || fileUrl

  const access = await resolveMaterialManager(context, subjectId)
  if (access.error) {
    return result.withStatus(access.error.status, { message: access.error.message })
  }

  if (!finalFileUrl) {
    return result.withStatus(400, { message: 'Please upload a PDF or provide a file URL' })
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

  result.withStatus(201, {
    message: 'Study material uploaded successfully!',
    material
  })
}

// ================================
// GET MATERIALS BY SUBJECT
// ================================
/**
 * Handles get materials by subject business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getMaterialsBySubject = async (context, result = createServiceResponder()) => {
    const { subjectId } = context.params
  const where = { subjectId }

  if (context.user.role === 'INSTRUCTOR') {
    where.instructorId = context.instructor?.id || '__no_materials__'
  }

  if (context.user.role === 'STUDENT') {
    const student = context.student
    if (!student) {
      return result.withStatus(403, { message: 'Student profile not found' })
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

  result.ok({ total: materials.length, materials })
}

// ================================
// GET ALL MATERIALS
// ================================
/**
 * Handles get all materials business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAllMaterials = async (context, result = createServiceResponder()) => {
    const { page, limit, skip } = getPagination(context.query)
  const where = {}

  if (context.user.role === 'INSTRUCTOR') {
    where.instructorId = context.instructor?.id || '__no_materials__'
  }

  if (context.user.role === 'STUDENT') {
    const student = context.student
    if (!student) {
      return result.withStatus(403, { message: 'Student profile not found' })
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

  result.ok({ total, page, limit, materials })
}

// ================================
// DELETE MATERIAL
// ================================
/**
 * Handles delete material business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteMaterial = async (context, result = createServiceResponder()) => {
    const { id } = context.params

  const material = await prisma.studyMaterial.findUnique({ where: { id } })
  if (!material) {
    return result.withStatus(404, { message: 'Material not found' })
  }

  if (context.user.role === 'INSTRUCTOR') {
    if (material.instructorId !== context.instructor?.id) {
      return result.withStatus(403, { message: 'You can only delete your own materials' })
    }
  }

  await prisma.studyMaterial.delete({ where: { id } })

  result.ok({ message: 'Material deleted successfully!' })
}

module.exports = {
  createMaterial,
  getMaterialsBySubject,
  getAllMaterials,
  deleteMaterial
}
