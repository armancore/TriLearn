/** @typedef {{id: string, role: string, coordinator?: {department?: string}, instructor?: {id: string}, student?: {id: string}} | null} UploadUser */
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

const waitForUploadNegativeResponseFloor = async (/** @type {number} */ startedAt) => {
  const remainingMs = UPLOAD_NOT_FOUND_MIN_RESPONSE_MS - (Date.now() - startedAt)
  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs))
  }
}

const uploadNegativeResponse = async (/** @type {import("../utils/serviceResult").ServiceResponder} */ result, /** @type {number} */ startedAt, /** @type {number} */ statusCode, /** @type {string} */ message) => {
  await waitForUploadNegativeResponseFloor(startedAt)
  return result.withStatus(statusCode, { message })
}

const setUploadSecurityHeaders = (/** @type {{ header: (arg0: string, arg1: string) => void; }} */ result) => {
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

const getSafeContentType = (/** @type {string} */ fileName) => {
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
    })[extension] || 'application/octet-stream'
  }

  return 'application/octet-stream'
}

// Excludes \s deliberately: \s matches CR/LF, which must never survive into the
// Content-Disposition header. Keep the class strict so the helper is safe
// regardless of how callers build the header value.
const getSafeDownloadFileName = (/** @type {string} */ filePath) => path.basename(filePath).replace(/[^\w.-]/g, '_')

const resolveUploadFilePath = (/** @type {string} */ basePath, /** @type {string} */ fileName) => {
  const uploadDir = path.resolve(basePath)
  const absolutePath = path.resolve(uploadDir, fileName)

  if (!absolutePath.startsWith(uploadDir + path.sep)) {
    throw new Error('Path traversal blocked')
  }

  return absolutePath
}

const resolveExistingUploadFilePath = (/** @type {string} */ fileName) => {
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

const sendUploadFile = async (/** @type {import("../utils/serviceResult").ServiceResponder} */ result, /** @type {string} */ fileName) => {
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
  })
}

const isStudentEnrolledInSubject = async (/** @type {string} */ studentId, /** @type {string} */ subjectId) => {
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

/** @param {{ coordinator?: { department?: string } }} user @param {string} subjectId */
const canCoordinatorAccessSubject = async (user, subjectId) => {
  const department = user.coordinator?.department
  if (!department || !subjectId) return false
  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { department: true } })
  return subject?.department === department
}

/** @param {UploadUser} user @param {{subjectId: string, instructorId: string}} assignment */
const canAccessAssignmentFile = async (user, assignment) => {
  if (!user) {
    return false
  }

  if (user.role === 'COORDINATOR') return canCoordinatorAccessSubject(user, assignment.subjectId)
  if (user.role === 'ADMIN') {
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

/** @param {UploadUser} user @param {{studentId: string, assignment: {subjectId: string, instructorId: string}}} submission */
const canAccessSubmissionFile = async (user, submission) => {
  if (!user) {
    return false
  }

  if (user.role === 'COORDINATOR') return canCoordinatorAccessSubject(user, submission.assignment?.subjectId)
  if (user.role === 'ADMIN') {
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

/** @param {UploadUser} user @param {{subjectId: string, instructorId: string}} task */
const canAccessTaskFile = async (user, task) => {
  if (!user) {
    return false
  }

  if (user.role === 'COORDINATOR') return canCoordinatorAccessSubject(user, task.subjectId)
  if (user.role === 'ADMIN') {
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

/** @param {UploadUser} user @param {{studentId: string, task: {subjectId: string, instructorId: string}}} submission */
const canAccessTaskSubmissionFile = async (user, submission) => {
  if (!user) {
    return false
  }

  if (user.role === 'COORDINATOR') return canCoordinatorAccessSubject(user, submission.task?.subjectId)
  if (user.role === 'ADMIN') {
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

/** @param {UploadUser} user @param {{subjectId: string, instructorId: string}} material */
const canAccessMaterialFile = async (user, material) => {
  if (!user) {
    return false
  }

  if (user.role === 'COORDINATOR') return canCoordinatorAccessSubject(user, material.subjectId)
  if (user.role === 'ADMIN') {
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

const logUploadAccessDenied = async (/** @type {ReturnType<typeof import('../utils/controllerAdapter').buildServiceContext>} */ context, /** @type {string} */ fileName, /** @type {string} */ resourceType) => {
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

/** @param {UploadUser} user @param {Pick<import("@prisma/client").UploadedFile, "entityType" | "entityId" | "uploadedById"> | null} uploadedFile */
const canAccessUploadedFileRecord = (user, uploadedFile) => {
  if (!user || !uploadedFile) {
    return false
  }

  return (uploadedFile.uploadedById === user.id &&
    (user.role !== 'COORDINATOR' || !uploadedFile.entityType || uploadedFile.entityType === 'USER_AVATAR')) ||
    // Only USER_AVATAR records store a user id in entityId. Scope the match to
    // that entity type so a future entity storing an attacker-influenced id that
    // collides with a user id cannot become an authorization bypass.
    (uploadedFile.entityType === 'USER_AVATAR' && uploadedFile.entityId === user.id) ||
    user.role === 'ADMIN'
}

/** @param {UploadUser} user @param {Pick<import("@prisma/client").UploadedFile, "entityType" | "entityId" | "uploadedById"> | null} uploadedFile */
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
            subjectId: true,
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
            subjectId: true,
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
