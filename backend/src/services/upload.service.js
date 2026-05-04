const { createServiceResponder } = require('../utils/serviceResult')
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

const setUploadSecurityHeaders = (result) => {
  const allowedFrameAncestors = ["'self'"]
  const trustedOrigins = getTrustedOrigins()

  trustedOrigins.forEach((origin) => {
    if (origin && !allowedFrameAncestors.includes(origin)) {
      allowedFrameAncestors.push(origin)
    }
  })

  result.header('X-Content-Type-Options', 'nosniff')
  result.header('Cross-Origin-Resource-Policy', 'same-site')
  result.header('Content-Security-Policy', `default-src 'none'; frame-ancestors ${allowedFrameAncestors.join(' ')}; sandbox allow-scripts allow-downloads`)
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

const sendUploadFile = (result, fileName) => {
  setUploadSecurityHeaders(result)
  const contentType = getSafeContentType(fileName)
  const absolutePath = resolveExistingUploadFilePath(fileName)

  return result.sendFile(absolutePath, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${path.basename(fileName)}"`
    }
  }, (error) => {
    if (!error || result.headersSent) {
      return
    }

    if (error.code === 'ENOENT') {
      result.withStatus(404, { message: 'File not found' })
      return
    }

    result.withStatus(500, { message: 'Something went wrong' })
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

const logUploadAccessDenied = async (context, fileName, resourceType) => {
  await recordAuditLog({
    actorId: context.user?.id || null,
    actorRole: context.user?.role || null,
    action: 'UPLOAD_FILE_ACCESS_DENIED',
    entityType: 'UploadFile',
    entityId: fileName,
    metadata: {
      fileName,
      resourceType,
      requestPath: context.originalUrl || null
    }
  })
}

/**
 * Handles serve uploaded file business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const serveUploadedFile = async (context, result = createServiceResponder()) => {
    const fileName = path.basename(String(context.params.filename || ''))
  if (!fileName) {
    return result.withStatus(404, { message: 'File not found' })
  }

  const relativePaths = buildRelativeUploadPaths(fileName)

  const user = context.user

  const avatar = await prisma.user.findFirst({
    where: { avatar: { in: relativePaths } },
    select: { id: true }
  })

  if (avatar) {
    if (!user || (user.id !== avatar.id && !['ADMIN', 'COORDINATOR'].includes(user.role))) {
      await logUploadAccessDenied(context, fileName, 'AVATAR')
      return result.withStatus(403, { message: 'Access denied' })
    }

    return sendUploadFile(result, fileName)
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
      await logUploadAccessDenied(context, fileName, 'ASSIGNMENT')
      return result.withStatus(403, { message: 'Access denied' })
    }

    return sendUploadFile(result, fileName)
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
      await logUploadAccessDenied(context, fileName, 'SUBMISSION')
      return result.withStatus(403, { message: 'Access denied' })
    }

    return sendUploadFile(result, fileName)
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
      await logUploadAccessDenied(context, fileName, 'MATERIAL')
      return result.withStatus(403, { message: 'Access denied' })
    }

    return sendUploadFile(result, fileName)
  }

  return result.withStatus(404, { message: 'File not found' })
}

module.exports = {
  serveUploadedFile
}
