const path = require('path')
const prisma = require('../utils/prisma')
const { uploadPath, uploadPublicPath } = require('../utils/fileStorage')
const { getTrustedOrigins } = require('../middleware/csrf.middleware')
const { recordAuditLog } = require('../utils/audit')

const buildRelativeUploadPath = (fileName) => `${uploadPublicPath}/${fileName}`

const setUploadSecurityHeaders = (res) => {
  const allowedFrameAncestors = ["'self'"]
  const trustedOrigins = getTrustedOrigins()

  trustedOrigins.forEach((origin) => {
    if (origin && !allowedFrameAncestors.includes(origin)) {
      allowedFrameAncestors.push(origin)
    }
  })

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  res.setHeader('Content-Security-Policy', `default-src 'none'; frame-ancestors ${allowedFrameAncestors.join(' ')}; sandbox allow-scripts allow-downloads`)
}

const getSafeContentType = (fileName) => {
  const extension = path.extname(String(fileName || '')).toLowerCase()

  if (extension === '.pdf') {
    return 'application/pdf'
  }

  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extension)) {
    return ({
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif'
    })[extension]
  }

  return 'application/octet-stream'
}

const sendUploadFile = (res, fileName, { forceAttachment = false } = {}) => {
  setUploadSecurityHeaders(res)
  const contentType = getSafeContentType(fileName)
  const shouldForceAttachment = (
    forceAttachment ||
    contentType === 'application/octet-stream' ||
    contentType === 'application/pdf'
  )

  res.sendFile(path.join(uploadPath, fileName), {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': contentType,
      'Content-Disposition': shouldForceAttachment
        ? `attachment; filename="${path.basename(fileName)}"`
        : 'inline'
    }
  })
}

const isStudentEnrolledInSubject = async (studentId, subjectId) => {
  const enrollment = await prisma.subjectEnrollment.findUnique({
    where: {
      subjectId_studentId: {
        subjectId,
        studentId
      }
    },
    select: {
      id: true
    }
  })

  return Boolean(enrollment)
}

const canAccessAssignmentFile = async (user, assignment) => {
  if (!user) {
    return false
  }

  if (['ADMIN', 'COORDINATOR'].includes(user.role)) {
    return true
  }

  if (user.role === 'INSTRUCTOR') {
    return assignment.instructorId === user.instructor?.id
  }

  if (user.role === 'STUDENT' && user.student?.id) {
    return isStudentEnrolledInSubject(user.student.id, assignment.subjectId)
  }

  return false
}

const canAccessSubmissionFile = async (user, submission) => {
  if (!user) {
    return false
  }

  if (['ADMIN', 'COORDINATOR'].includes(user.role)) {
    return true
  }

  if (user.role === 'INSTRUCTOR') {
    return submission.assignment.instructorId === user.instructor?.id
  }

  if (user.role === 'STUDENT') {
    return submission.studentId === user.student?.id
  }

  return false
}

const canAccessMaterialFile = async (user, material) => {
  if (!user) {
    return false
  }

  if (['ADMIN', 'COORDINATOR'].includes(user.role)) {
    return true
  }

  if (user.role === 'INSTRUCTOR') {
    return material.instructorId === user.instructor?.id
  }

  if (user.role === 'STUDENT' && user.student?.id) {
    return isStudentEnrolledInSubject(user.student.id, material.subjectId)
  }

  return false
}

const logUploadAccessDenied = async (req, fileName, resourceType) => {
  await recordAuditLog({
    actorId: req.user?.id || null,
    actorRole: req.user?.role || null,
    action: 'UPLOAD_FILE_ACCESS_DENIED',
    entityType: 'UploadFile',
    entityId: fileName,
    metadata: {
      fileName,
      resourceType,
      requestPath: req.originalUrl || null
    }
  })
}

const serveUploadedFile = async (req, res) => {
  try {
    const fileName = path.basename(String(req.params.filename || ''))
    if (!fileName) {
      return res.status(404).json({ message: 'File not found' })
    }

    const relativePath = buildRelativeUploadPath(fileName)

    const user = req.user

    const avatar = await prisma.user.findFirst({
      where: { avatar: relativePath },
      select: { id: true }
    })

    if (avatar) {
      if (!user || (user.id !== avatar.id && !['ADMIN', 'COORDINATOR'].includes(user.role))) {
        await logUploadAccessDenied(req, fileName, 'AVATAR')
        return res.status(403).json({ message: 'Access denied' })
      }

      return sendUploadFile(res, fileName)
    }

    const assignment = await prisma.assignment.findFirst({
      where: { questionPdfUrl: relativePath },
      select: {
        id: true,
        subjectId: true,
        instructorId: true
      }
    })

    if (assignment) {
      if (!(await canAccessAssignmentFile(user, assignment))) {
        await logUploadAccessDenied(req, fileName, 'ASSIGNMENT')
        return res.status(403).json({ message: 'Access denied' })
      }

      return sendUploadFile(res, fileName)
    }

    const submission = await prisma.submission.findFirst({
      where: { fileUrl: relativePath },
      select: {
        id: true,
        studentId: true,
        assignment: {
          select: {
            instructorId: true
          }
        }
      }
    })

    if (submission) {
      if (!(await canAccessSubmissionFile(user, submission))) {
        await logUploadAccessDenied(req, fileName, 'SUBMISSION')
        return res.status(403).json({ message: 'Access denied' })
      }

      return sendUploadFile(res, fileName)
    }

    const material = await prisma.studyMaterial.findFirst({
      where: { fileUrl: relativePath },
      select: {
        id: true,
        subjectId: true,
        instructorId: true
      }
    })

    if (material) {
      if (!(await canAccessMaterialFile(user, material))) {
        await logUploadAccessDenied(req, fileName, 'MATERIAL')
        return res.status(403).json({ message: 'Access denied' })
      }

      return sendUploadFile(res, fileName)
    }

    return res.status(404).json({ message: 'File not found' })
  } catch (error) {
    return res.internalError
      ? res.internalError(error)
      : res.status(500).json({ message: 'Something went wrong' })
  }
}

module.exports = {
  serveUploadedFile
}
