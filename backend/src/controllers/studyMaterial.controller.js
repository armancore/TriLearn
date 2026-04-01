const prisma = require('../utils/prisma')
const logger = require('../utils/logger')

const buildUploadedFileUrl = (req, file) => {
  if (!file) return undefined
  return `/uploads/${file.filename}`
}

// ================================
// CREATE STUDY MATERIAL (Instructor)
// ================================
const createMaterial = async (req, res) => {
  try {
    const { title, description, fileUrl, subjectId } = req.body
    const uploadedFileUrl = buildUploadedFileUrl(req, req.file)
    const finalFileUrl = uploadedFileUrl || fileUrl

    const instructor = await prisma.instructor.findUnique({
      where: { userId: req.user.id }
    })

    if (!instructor) {
      return res.status(403).json({ message: 'Only instructors can upload materials' })
    }

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId }
    })

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' })
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
        instructorId: instructor.id
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
// DELETE MATERIAL (Instructor/Admin)
// ================================
const deleteMaterial = async (req, res) => {
  try {
    const { id } = req.params

    const material = await prisma.studyMaterial.findUnique({ where: { id } })
    if (!material) {
      return res.status(404).json({ message: 'Material not found' })
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


