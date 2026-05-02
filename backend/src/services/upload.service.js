const fs = require('fs')
const path = require('path')
const prisma = require('../utils/prisma')
const { uploadPath, legacyUploadPaths, uploadPublicPath, uploadPublicPaths } = require('../utils/fileStorage')
const { getTrustedOrigins } = require('../middleware/csrf.middleware')
const { recordAuditLog } = require('../utils/audit')

const resolvedUploadPublicPaths = Array.isArray(uploadPublicPaths) && uploadPublicPaths.length > 0
  ? uploadPublicPaths
  : [uploadPublicPath || '/api/v1/uploads']

const buildRelativeUploadPaths = (fileName) => resolvedUploadPublicPaths.map((publicPath) => `${publicPath}/${fileName}`)

const setUploadSecurityHeaders = (response) => {
  const allowedFrameAncestors = ["'self'"]
  const trustedOrigins = getTrustedOrigins()

  trustedOrigins.forEach((origin) => {
    if (origin && !allowedFrameAncestors.includes(origin)) {
      allowedFrameAncestors.push(origin)
    }
  })

  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  response.setHeader('Content-Security-Policy', `default-src 'none'; frame-ancestors ${allowedFrameAncestors.join(' ')}; sandbox allow-scripts allow-downloads`)
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

const resolveExistingUploadFilePath = (fileName) => {
  const candidatePaths = [uploadPath, ...(Array.isArray(legacyUploadPaths) ? legacyUploadPaths : [])]

  for (const basePath of candidatePaths) {
    const absolutePath = path.join(basePath, fileName)
    if (fs.existsSync(absolutePath)) {
      return absolutePath
    }
  }

  return path.join(uploadPath, fileName)
}

const sendUploadFile = (response, fileName) => {
  setUploadSecurityHeaders(response)
  const contentType = getSafeContentType(fileName)
  const absolutePath = resolveExistingUploadFilePath(fileName)

  return response.sendFile(absolutePath, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${path.basename(fileName)}"`
    }
  }, (error) => {
    if (!error || response.headersSent) {
      return
    }

    if (error.code === 'ENOENT') {
      response.status(404).json({ message: 'File not found' })
      return
    }

    response.status(500).json({ message: 'Something went wrong' })
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

/**
 * Handles serve uploaded file business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const serveUploadedFile = async (req, response) => {
  try {
    const fileName = path.basename(String(req.params.filename || ''))
    if (!fileName) {
      return response.status(404).json({ message: 'File not found' })
    }

    const relativePaths = buildRelativeUploadPaths(fileName)

    const user = req.user

    const avatar = await prisma.user.findFirst({
      where: { avatar: { in: relativePaths } },
      select: { id: true }
    })

    if (avatar) {
      if (!user || (user.id !== avatar.id && !['ADMIN', 'COORDINATOR'].includes(user.role))) {
        await logUploadAccessDenied(req, fileName, 'AVATAR')
        return response.status(403).json({ message: 'Access denied' })
      }

      return sendUploadFile(response, fileName)
    }

    const assignment = await prisma.assignment.findFirst({
      where: { questionPdfUrl: { in: relativePaths } },
      select: {
        id: true,
        subjectId: true,
        instructorId: true
      }
    })

    if (assignment) {
      if (!(await canAccessAssignmentFile(user, assignment))) {
        await logUploadAccessDenied(req, fileName, 'ASSIGNMENT')
        return response.status(403).json({ message: 'Access denied' })
      }

      return sendUploadFile(response, fileName)
    }

    const submission = await prisma.submission.findFirst({
      where: { fileUrl: { in: relativePaths } },
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
        return response.status(403).json({ message: 'Access denied' })
      }

      return sendUploadFile(response, fileName)
    }

    const material = await prisma.studyMaterial.findFirst({
      where: { fileUrl: { in: relativePaths } },
      select: {
        id: true,
        subjectId: true,
        instructorId: true
      }
    })

    if (material) {
      if (!(await canAccessMaterialFile(user, material))) {
        await logUploadAccessDenied(req, fileName, 'MATERIAL')
        return response.status(403).json({ message: 'Access denied' })
      }

      return sendUploadFile(response, fileName)
    }

    return response.status(404).json({ message: 'File not found' })
  } catch (error) {
    return response.internalError
      ? response.internalError(error)
      : response.status(500).json({ message: 'Something went wrong' })
  }
}

module.exports = {
  serveUploadedFile
}
