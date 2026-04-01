const prisma = require('../utils/prisma')
const logger = require('../utils/logger')
const { buildUploadedFileUrl } = require('../utils/fileStorage')

const resolveMaterialManager = async (user, subjectId) => {
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

  const instructor = await prisma.instructor.findUnique({
    where: { userId: user.id }
  })

  if (!instructor) {
    return { error: { status: 403, message: 'Only instructors can upload materials' } }
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

    const access = await resolveMaterialManager(req.user, subjectId)
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message })
    }

    if (!finalFileUrl) {
      return res.status(400).json({ message: 'Please upload a PDF or provide a file URL' })
    }

    const material = await prisma.studyMaterial.create({
      data: {
        title,
        description,
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

    const materials = await prisma.studyMaterial.findMany({
      where: { subjectId },
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
    const materials = await prisma.studyMaterial.findMany({
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
      const instructor = await prisma.instructor.findUnique({
        where: { userId: req.user.id }
      })

      if (material.instructorId !== instructor?.id) {
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
