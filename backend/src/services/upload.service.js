const { createServiceResponder } = require('../utils/serviceResult')
const fs = require('fs')
const path = require('path')
const prisma = require('../utils/prisma')
const {
  uploadPath,
  legacyUploadPaths,
  getFileBuffer
} = require('../utils/fileStorage')
const { getTrustedOrigins } = require('../middleware/csrf.middleware')
const { recordAuditLog } = require('../utils/audit')

const UPLOAD_NOT_FOUND_MIN_RESPONSE_MS = 25

const waitForUploadNegativeResponseFloor = async (startedAt) => {
  const remainingMs = UPLOAD_NOT_FOUND_MIN_RESPONSE_MS - (Date.now() - startedAt)
  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs))
  }
}

const uploadNegativeResponse = async (result, startedAt, statusCode, message) => {
  await waitForUploadNegativeResponseFloor(startedAt)
  return result.withStatus(statusCode, { message })
}

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

// Excludes \s deliberately: \s matches CR/LF, which must never survive into the
// Content-Disposition header. Keep the class strict so the helper is safe
// regardless of how callers build the header value.
const getSafeDownloadFileName = (filePath) => path.basename(filePath).replace(/[^\w.-]/g, '_')

const resolveUploadFilePath = (basePath, fileName) => {
  const uploadDir = path.resolve(basePath)
  const absolutePath = path.resolve(uploadDir, fileName)

  if (!absolutePath.startsWith(uploadDir + path.sep)) {
    throw new Error('Path traversal blocked')
  }

  return absolutePath
}

const resolveExistingUploadFilePath = (fileName) => {
  const candidatePaths = [uploadPath, ...(Array.isArray(legacyUploadPaths) ? legacyUploadPaths : [])]
    .filter(Boolean)

  for (const basePath of candidatePaths) {
    const absolutePath = resolveUploadFilePath(basePath, fileName)
    if (fs.existsSync(absolutePath)) {
      return absolutePath
    }
  }

  return resolveUploadFilePath(uploadPath, fileName)
}

const sendUploadFile = async (result, fileName) => {
  const contentType = getSafeContentType(fileName)
  const absolutePath = resolveExistingUploadFilePath(fileName)
  // Force download - prevents inline rendering of PDFs with embedded JavaScript.
  const safeFilename = getSafeDownloadFileName(absolutePath)
  const fileBuffer = typeof getFileBuffer === 'function'
    ? await getFileBuffer(fileName)
    : null

  if (fileBuffer) {
    setUploadSecurityHeaders(result)
    result.header('Content-Type', contentType)
    result.header('Content-Disposition', `attachment; filename="${safeFilename}"`)
    result.header('Cache-Control', 'private, no-store')
    result.end(fileBuffer)
    return result.toServiceResult()
  }

  setUploadSecurityHeaders(result)

  result.header('Content-Disposition', `attachment; filename="${safeFilename}"`)
  result.header('X-Content-Type-Options', 'nosniff')
  result.header('Cache-Control', 'private, no-store')

  return result.sendFile(absolutePath, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${safeFilename}"`
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

const canAccessTaskFile = async (user, task) => {
  if (!user) {
    return false
  }

  if (['ADMIN', 'COORDINATOR'].includes(user.role)) {
    return true
  }

  if (user.role === 'INSTRUCTOR') {
    return task.instructorId === user.instructor?.id
  }

  if (user.role === 'STUDENT' && user.student?.id) {
    return isStudentEnrolledInSubject(user.student.id, task.subjectId)
  }

  return false
}

const canAccessTaskSubmissionFile = async (user, submission) => {
  if (!user) {
    return false
  }

  if (['ADMIN', 'COORDINATOR'].includes(user.role)) {
    return true
  }

  if (user.role === 'INSTRUCTOR') {
    return submission.task.instructorId === user.instructor?.id
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

const canAccessUploadedFileRecord = (user, uploadedFile) => {
  if (!user || !uploadedFile) {
    return false
  }

  return uploadedFile.uploadedById === user.id ||
    // Only USER_AVATAR records store a user id in entityId. Scope the match to
    // that entity type so a future entity storing an attacker-influenced id that
    // collides with a user id cannot become an authorization bypass.
    (uploadedFile.entityType === 'USER_AVATAR' && uploadedFile.entityId === user.id) ||
    ['ADMIN', 'COORDINATOR'].includes(user.role)
}

const canAccessUploadedFileEntity = async (user, uploadedFile) => {
  if (canAccessUploadedFileRecord(user, uploadedFile)) {
    return true
  }

  if (!uploadedFile?.entityType || !uploadedFile?.entityId) {
    return false
  }

  if (uploadedFile.entityType === 'ASSIGNMENT') {
    const assignment = await prisma.assignment.findUnique({
      where: { id: uploadedFile.entityId },
      select: {
        id: true,
        subjectId: true,
        instructorId: true
      }
    })

    return assignment ? canAccessAssignmentFile(user, assignment) : false
  }

  if (uploadedFile.entityType === 'SUBMISSION') {
    const submission = await prisma.submission.findUnique({
      where: { id: uploadedFile.entityId },
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

    return submission ? canAccessSubmissionFile(user, submission) : false
  }

  if (uploadedFile.entityType === 'STUDY_MATERIAL') {
    const material = await prisma.studyMaterial.findUnique({
      where: { id: uploadedFile.entityId },
      select: {
        id: true,
        subjectId: true,
        instructorId: true
      }
    })

    return material ? canAccessMaterialFile(user, material) : false
  }

  if (uploadedFile.entityType === 'TASK') {
    const task = await prisma.task.findUnique({
      where: { id: uploadedFile.entityId },
      select: {
        id: true,
        subjectId: true,
        instructorId: true
      }
    })

    return task ? canAccessTaskFile(user, task) : false
  }

  if (uploadedFile.entityType === 'TASK_SUBMISSION') {
    const submission = await prisma.taskSubmission.findUnique({
      where: { id: uploadedFile.entityId },
      select: {
        id: true,
        studentId: true,
        task: {
          select: {
            instructorId: true
          }
        }
      }
    })

    return submission ? canAccessTaskSubmissionFile(user, submission) : false
  }

  if (uploadedFile.entityType === 'USER_AVATAR') {
    return user?.id === uploadedFile.entityId
  }

  return false
}

/**
 * Handles serve uploaded file business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const serveUploadedFile = async (context, result = createServiceResponder()) => {
  const startedAt = Date.now()
  const fileName = path.basename(String(context.params.filename || ''))
  if (!fileName) {
    return uploadNegativeResponse(result, startedAt, 404, 'File not found')
  }

  const user = context.user
  // Every uploaded file is tracked in UploadedFile (created on upload and stamped
  // with entityType/entityId when attached to its owning entity). Legacy files
  // are backfilled by scripts/backfillUploadedFiles.js, so a single indexed
  // lookup replaces the former per-column fallback scans.
  const uploadedFile = prisma.uploadedFile?.findUnique
    ? await prisma.uploadedFile.findUnique({
        where: { fileName },
        select: {
          id: true,
          uploadedById: true,
          fileUrl: true,
          entityType: true,
          entityId: true
        }
      })
    : null

  if (!uploadedFile) {
    return uploadNegativeResponse(result, startedAt, 404, 'File not found')
  }

  if (!(await canAccessUploadedFileEntity(user, uploadedFile))) {
    await logUploadAccessDenied(context, fileName, uploadedFile.entityType || 'UPLOAD')
    return uploadNegativeResponse(result, startedAt, 403, 'Access denied')
  }

  return sendUploadFile(result, fileName)
}

module.exports = {
  serveUploadedFile,
  resolveExistingUploadFilePath
}
