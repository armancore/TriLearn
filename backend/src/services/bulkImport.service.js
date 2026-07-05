const { createServiceResponder } = require('../utils/serviceResult')
const prisma = require('../utils/prisma')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const ExcelJS = require('exceljs')
const readXlsxFile = require('read-excel-file/node')
const logger = require('../utils/logger')
const { recordAuditLog } = require('../utils/audit')
const { sendMail } = require('../utils/mailer')
const { welcomeTemplate } = require('../utils/emailTemplates')
const {
  buildEmailVerificationUrl,
  createEmailVerificationToken
} = require('../utils/emailVerification')
const { hashPassword, generateTemporaryPassword } = require('../utils/security')
const { sanitizePlainText, sanitizeXlsxCell } = require('../utils/sanitize')
const { clearStatsCache } = require('../utils/statsCache')
const {
  BULK_STUDENT_IMPORT_JOB,
  notificationQueue
} = require('../jobs/notificationQueue')
const {
  sanitizeOptionalPlainText,
  deleteStaleDeletedStudentAccounts
} = require('../utils/adminHelpers')
const { normalizeDepartmentList } = require('../utils/instructorDepartments')

const MAX_STUDENT_SEMESTER = 8
// Hard ceiling on rows parsed from an uploaded workbook. xlsx is zip-compressed,
// so a small file can decompress into millions of rows (decompression bomb);
// reject oversized sheets before materialising them into memory.
const MAX_IMPORT_ROWS = 5000
const WELCOME_EMAIL_SEND_DELAY_MS = 1200
const WELCOME_EMAIL_RATE_LIMIT_RETRY_DELAY_MS = 2500
const WELCOME_EMAIL_MAX_ATTEMPTS = 3
const sanitizeImportedSpreadsheetText = (value) => sanitizeXlsxCell(sanitizePlainText(value))
const sanitizeImportedOptionalText = (value) => {
  const sanitized = sanitizeImportedSpreadsheetText(value)
  return sanitized || null
}


const normalizeImportHeader = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')

const STUDENT_IMPORT_HEADER_ALIASES = {
  name: ['name', 'fullname', 'studentname'],
  email: ['email', 'studentemail', 'personalemail'],
  studentId: ['studentid', 'rollnumber', 'rollno', 'roll'],
  phone: ['phone', 'mobile', 'mobilenumber'],
  address: ['address', 'temporaryaddress'],
  department: ['department', 'departmentname'],
  semester: ['semester', 'sem'],
  section: ['section']
}

const resolveStudentImportColumns = (headerValues = []) => {
  const normalizedHeaders = headerValues.map((value) => normalizeImportHeader(value))

  return Object.entries(STUDENT_IMPORT_HEADER_ALIASES).reduce((acc, [field, aliases]) => {
    const columnIndex = normalizedHeaders.findIndex((header) => aliases.includes(header))
    if (columnIndex >= 0) {
      acc[field] = columnIndex + 1
    }
    return acc
  }, {})
}

const buildStudentImportRowsFromTable = (headerValues = [], dataRows = []) => {
  const columns = resolveStudentImportColumns(headerValues)
  const requiredColumns = ['name', 'email', 'studentId', 'department', 'semester', 'section']
  const missingColumns = requiredColumns.filter((field) => !columns[field])

  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}`)
  }

  const getValue = (rowValues, field) => {
    const columnIndex = columns[field]
    return columnIndex ? rowValues[columnIndex - 1] : ''
  }

  return dataRows.reduce((rows, rowValues, rowIndex) => {
    const entry = {
      rowNumber: rowIndex + 2,
      name: sanitizeImportedSpreadsheetText(getValue(rowValues, 'name')),
      email: sanitizeImportedSpreadsheetText(getValue(rowValues, 'email')),
      studentId: sanitizeImportedSpreadsheetText(getValue(rowValues, 'studentId')),
      phone: sanitizeImportedSpreadsheetText(getValue(rowValues, 'phone')),
      address: sanitizeImportedSpreadsheetText(getValue(rowValues, 'address')),
      department: sanitizeImportedSpreadsheetText(getValue(rowValues, 'department')),
      semester: sanitizeImportedSpreadsheetText(getValue(rowValues, 'semester')),
      section: sanitizeImportedSpreadsheetText(getValue(rowValues, 'section'))
    }

    const hasData = Object.entries(entry).some(([key, value]) => (
      key !== 'rowNumber' && value && String(value).trim() !== ''
    ))
    if (hasData) {
      rows.push(entry)
    }

    return rows
  }, [])
}

const assertImportRowCountWithinLimit = (rowCount) => {
  if (Number(rowCount) > MAX_IMPORT_ROWS + 1) {
    throw new Error(`The uploaded file has too many rows. Split the import into files of at most ${MAX_IMPORT_ROWS} students.`)
  }
}

const buildStudentImportRowsFromExcelWorksheet = (worksheet) => {
  // rowCount includes the header row, hence the +1 allowance in the guard.
  assertImportRowCountWithinLimit(worksheet.actualRowCount ?? worksheet.rowCount)

  const headerRow = worksheet.getRow(1)
  const headerValues = Array.from({ length: headerRow.cellCount }, (_, index) => headerRow.getCell(index + 1).text)
  const dataRows = []
  const lastRowNumber = Math.min(worksheet.rowCount, MAX_IMPORT_ROWS + 1)

  for (let rowNumber = 2; rowNumber <= lastRowNumber; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    dataRows.push(Array.from({ length: headerRow.cellCount }, (_, index) => row.getCell(index + 1).text))
  }

  return buildStudentImportRowsFromTable(headerValues, dataRows)
}

const loadStudentImportRowsWithFallbackXlsxReader = async (filePath) => {
  const table = await readXlsxFile(filePath)

  if (table.length === 0) {
    throw new Error('The uploaded file does not contain any worksheet data')
  }

  assertImportRowCountWithinLimit(table.length)

  return buildStudentImportRowsFromTable(table[0] || [], table.slice(1))
}

const loadStudentImportRows = async (filePath, originalName) => {
  const extension = path.extname(String(originalName || filePath)).toLowerCase()
  const workbook = new ExcelJS.Workbook()

  if (extension === '.csv') {
    await workbook.csv.readFile(filePath)
  } else if (extension === '.xlsx') {
    try {
      await workbook.xlsx.readFile(filePath)
    } catch (readFileError) {
      try {
        const workbookBuffer = await fs.promises.readFile(filePath)
        await workbook.xlsx.load(workbookBuffer)
      } catch {
        logger.warn('Student import XLSX parse failed', {
          message: readFileError?.message,
          fileName: originalName
        })
        try {
          return await loadStudentImportRowsWithFallbackXlsxReader(filePath)
        } catch (fallbackError) {
          logger.warn('Student import XLSX fallback parse failed', {
            message: fallbackError?.message,
            fileName: originalName
          })
          throw new Error('Unable to read the XLSX file. Please save/export it as a real .xlsx workbook or use the CSV template from this import dialog.')
        }
      }
    }
  } else {
    throw new Error('Please upload a CSV or XLSX file')
  }

  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error('The uploaded file does not contain any worksheet data')
  }

  return buildStudentImportRowsFromExcelWorksheet(worksheet)
}

const buildDepartmentLookup = async () => {
  const departments = await prisma.department.findMany({
    select: {
      name: true,
      code: true
    }
  })

  return departments.reduce((acc, department) => {
    acc[normalizeDepartmentValue(department.name).toLowerCase()] = department.name
    acc[normalizeDepartmentValue(department.code).toLowerCase()] = department.name
    return acc
  }, {})
}

const buildStudentImportError = (rowNumber, message, student) => ({
  rowNumber,
  status: 'failed',
  name: student?.name || '',
  email: student?.email || '',
  studentId: student?.studentId || '',
  message
})

const getStudentImportSubjectFilter = (semester, department) => ({
  semester,
  OR: [
    { department: null },
    { department: '' },
    ...(department ? [{ department }] : [])
  ]
})

const normalizeDepartmentValue = (value) => String(value || '').trim()
const normalizeSectionValue = (value) => {
  const sanitizedSection = sanitizeOptionalPlainText(value)
  return sanitizedSection ? sanitizedSection.toUpperCase() : null
}
const getDepartmentSectionDelegate = () => (
  prisma?.departmentSection &&
  typeof prisma.departmentSection.findFirst === 'function' &&
  typeof prisma.departmentSection.findMany === 'function'
    ? prisma.departmentSection
    : null
)

const sectionScopeKey = ({ department, semester, section }) => (
  `${normalizeDepartmentValue(department).toLowerCase()}::${Number(semester)}::${normalizeSectionValue(section) || ''}`
)

const getCoordinatorDepartments = (context) => {
  if (context?.user?.role !== 'COORDINATOR') {
    return []
  }

  return normalizeDepartmentList([
    ...(Array.isArray(context.coordinator?.departments) ? context.coordinator.departments : []),
    context.coordinator?.department
  ])
}

const wait = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const isRateLimitedEmailError = (error) => (
  /too many requests|rate limit/i.test(String(error?.message || ''))
)

const sendWelcomeEmailWithRetry = async ({ row, subject, html, text }) => {
  for (let attempt = 1; attempt <= WELCOME_EMAIL_MAX_ATTEMPTS; attempt += 1) {
    try {
      await sendMail({ to: row.email, subject, html, text })
      return true
    } catch (emailError) {
      if (attempt < WELCOME_EMAIL_MAX_ATTEMPTS && isRateLimitedEmailError(emailError)) {
        await wait(WELCOME_EMAIL_RATE_LIMIT_RETRY_DELAY_MS * attempt)
        continue
      }

      logger.error('Welcome email failed', {
        message: emailError?.message,
        stack: emailError?.stack,
        userId: row.id,
        attempt
      })
      return false
    }
  }

  return false
}

/**
 * Handles import students business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const processStudentImportFile = async (context, result = createServiceResponder()) => {
  const uploadedFilePath = context.file?.path

  try {
    if (!context.file?.path) {
      return result.withStatus(400, { message: 'Please upload a CSV or XLSX file to import students' })
    }

    let importedRows
    try {
      importedRows = await loadStudentImportRows(context.file.path, context.file.originalname)
    } catch (error) {
      return result.withStatus(400, {
        message: error?.message || 'Unable to read the uploaded student import file'
      })
    }
    if (importedRows.length === 0) {
      return result.withStatus(400, { message: 'The uploaded file does not contain any student rows' })
    }

    const departmentSectionDelegate = getDepartmentSectionDelegate()
    const [departmentLookup, configuredSections] = await Promise.all([
      buildDepartmentLookup(),
      departmentSectionDelegate
        ? departmentSectionDelegate.findMany({
            select: {
              semester: true,
              section: true,
              department: {
                select: { name: true }
              }
            }
          })
        : Promise.resolve([])
    ])

    const sectionScopeSet = new Set(
      configuredSections.map((entry) => sectionScopeKey({
        department: entry.department?.name,
        semester: entry.semester,
        section: entry.section
      }))
    )
    const coordinatorDepartments = getCoordinatorDepartments(context)
    const seenEmails = new Set()
    const seenStudentIds = new Set()
    const normalizedRows = []
    const failures = []

    importedRows.forEach((row) => {
      const importedName = sanitizeImportedSpreadsheetText(row.name)
      const importedEmail = sanitizeImportedSpreadsheetText(row.email)
      const importedStudentId = sanitizeImportedSpreadsheetText(row.studentId)
      const importedDepartment = sanitizeImportedSpreadsheetText(row.department)
      const importedSection = sanitizeImportedSpreadsheetText(row.section)
      const normalizedEmail = importedEmail.trim().toLowerCase()
      const normalizedStudentId = importedStudentId.trim().toUpperCase()
      const normalizedDepartmentKey = normalizeDepartmentValue(importedDepartment).toLowerCase()
      const resolvedDepartment = departmentLookup[normalizedDepartmentKey] || null
      const semester = Number.parseInt(row.semester, 10)
      const sanitizedName = importedName
      const sanitizedPhone = sanitizeImportedOptionalText(row.phone)
      const sanitizedAddress = sanitizeImportedOptionalText(row.address)
      const sanitizedSection = normalizeSectionValue(importedSection)

      if (!sanitizedName || sanitizedName.length < 2) {
        failures.push(buildStudentImportError(row.rowNumber, 'Name must be at least 2 characters long', row))
        return
      }

      if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
        failures.push(buildStudentImportError(row.rowNumber, 'Email must be a valid email address', row))
        return
      }

      if (!normalizedStudentId) {
        failures.push(buildStudentImportError(row.rowNumber, 'Student ID is required', row))
        return
      }

      if (!resolvedDepartment) {
        failures.push(buildStudentImportError(row.rowNumber, 'Department must match an existing department name or code', row))
        return
      }

      if (coordinatorDepartments.length > 0 && !coordinatorDepartments.includes(resolvedDepartment)) {
        failures.push(buildStudentImportError(row.rowNumber, 'Coordinators can only import students in their own department', row))
        return
      }

      if (!Number.isInteger(semester) || semester < 1 || semester > MAX_STUDENT_SEMESTER) {
        failures.push(buildStudentImportError(row.rowNumber, `Semester must be a number between 1 and ${MAX_STUDENT_SEMESTER}`, row))
        return
      }

      if (!sanitizedSection || sanitizedSection.length < 1) {
        failures.push(buildStudentImportError(row.rowNumber, 'Section is required', row))
        return
      }

      const configuredSectionKey = sectionScopeKey({
        department: resolvedDepartment,
        semester,
        section: sanitizedSection
      })

      if (departmentSectionDelegate && !sectionScopeSet.has(configuredSectionKey)) {
        failures.push(buildStudentImportError(row.rowNumber, 'Section is not configured for this department and semester', row))
        return
      }

      if (seenEmails.has(normalizedEmail)) {
        failures.push(buildStudentImportError(row.rowNumber, 'This email is duplicated in the import file', row))
        return
      }

      if (seenStudentIds.has(normalizedStudentId)) {
        failures.push(buildStudentImportError(row.rowNumber, 'This student ID is duplicated in the import file', row))
        return
      }

      seenEmails.add(normalizedEmail)
      seenStudentIds.add(normalizedStudentId)

      normalizedRows.push({
        rowNumber: row.rowNumber,
        name: sanitizedName,
        email: normalizedEmail,
        studentId: normalizedStudentId,
        phone: sanitizedPhone,
        address: sanitizedAddress,
        department: resolvedDepartment,
        semester,
        section: sanitizedSection
      })
    })

    const rowsToCreate = [...normalizedRows]

    let created = []

    if (rowsToCreate.length > 0) {
      try {
        const preparedRows = await Promise.all(rowsToCreate.map(async (row) => {
          const temporaryPassword = generateTemporaryPassword()
          const hashedPassword = await hashPassword(temporaryPassword)
          const emailVerification = createEmailVerificationToken()

          return {
            ...row,
            userId: crypto.randomUUID(),
            studentProfileId: crypto.randomUUID(),
            temporaryPassword,
            hashedPassword,
            emailVerificationToken: emailVerification.token,
            emailVerificationTokenHash: emailVerification.tokenHash,
            emailVerificationExpiry: emailVerification.expiresAt
          }
        }))

        const { createdRows, conflictFailures } = await prisma.$transaction(async (tx) => {
          await deleteStaleDeletedStudentAccounts(tx, {
            emails: preparedRows.map((row) => row.email),
            studentIds: preparedRows.map((row) => row.studentId)
          })

          const [existingUsers, existingStudents] = await Promise.all([
            tx.user.findMany({
              where: {
                email: { in: preparedRows.map((row) => row.email) }
              },
              select: { email: true }
            }),
            tx.student.findMany({
              where: {
                rollNumber: { in: preparedRows.map((row) => row.studentId) }
              },
              select: { rollNumber: true }
            })
          ])

          const existingEmails = new Set(existingUsers.map((user) => user.email.toLowerCase()))
          const existingStudentIds = new Set(existingStudents.map((student) => student.rollNumber.toUpperCase()))
          const conflictFailures = []
          const insertableRows = []

          preparedRows.forEach((row) => {
            if (existingEmails.has(row.email)) {
              conflictFailures.push(buildStudentImportError(row.rowNumber, 'An account already exists with this email address', row))
              return
            }

            if (existingStudentIds.has(row.studentId)) {
              conflictFailures.push(buildStudentImportError(row.rowNumber, 'Student ID already exists', row))
              return
            }

            insertableRows.push(row)
          })

          if (insertableRows.length === 0) {
            return { createdRows: [], conflictFailures }
          }

          const uniqueSemesterDepartments = Array.from(new Map(
            insertableRows.map((row) => [
              `${row.semester}::${row.department || ''}`,
              { semester: row.semester, department: row.department || null }
            ])
          ).values())

          const subjectGroups = await Promise.all(uniqueSemesterDepartments.map(async ({ semester, department }) => {
            const subjects = await tx.subject.findMany({
              where: getStudentImportSubjectFilter(semester, department),
              select: { id: true }
            })

            return [`${semester}::${department || ''}`, subjects]
          }))

          const subjectMap = new Map(subjectGroups)

          await tx.user.createMany({
            data: insertableRows.map((row) => ({
              id: row.userId,
              name: row.name,
              email: row.email,
              password: row.hashedPassword,
              role: 'STUDENT',
              phone: row.phone,
              address: row.address,
              mustChangePassword: true,
              profileCompleted: false,
              emailVerified: false,
              emailVerificationToken: row.emailVerificationTokenHash,
              emailVerificationExpiry: row.emailVerificationExpiry
            }))
          })

          await tx.student.createMany({
            data: insertableRows.map((row) => ({
              id: row.studentProfileId,
              userId: row.userId,
              rollNumber: row.studentId,
              semester: row.semester,
              section: row.section,
              department: row.department
            }))
          })

          const enrollmentRows = insertableRows.flatMap((row) => (
            (subjectMap.get(`${row.semester}::${row.department || ''}`) || []).map((subject) => ({
              subjectId: subject.id,
              studentId: row.studentProfileId
            }))
          ))

          if (enrollmentRows.length > 0) {
            await tx.subjectEnrollment.createMany({
              data: enrollmentRows,
              skipDuplicates: true
            })
          }

          return {
            createdRows: insertableRows.map((row) => ({
              rowNumber: row.rowNumber,
              status: 'created',
              id: row.userId,
              name: row.name,
              email: row.email,
              studentId: row.studentId,
              department: row.department,
              semester: row.semester,
              section: row.section,
              temporaryPassword: row.temporaryPassword,
              emailVerificationToken: row.emailVerificationToken,
              welcomeEmailSent: false
            })),
            conflictFailures
          }
        })

        created = createdRows
        failures.push(...conflictFailures)

        for (const [index, row] of created.entries()) {
          if (index > 0) {
            await wait(WELCOME_EMAIL_SEND_DELAY_MS)
          }

          const { subject, html, text } = welcomeTemplate({
            name: row.name,
            email: row.email,
            tempPassword: row.temporaryPassword,
            verificationUrl: buildEmailVerificationUrl(row.emailVerificationToken)
          })

          const wasSent = await sendWelcomeEmailWithRetry({ row, subject, html, text })
          if (wasSent) {
            row.welcomeEmailSent = true
          }
        }
      } catch (error) {
        rowsToCreate.forEach((row) => {
          failures.push(buildStudentImportError(row.rowNumber, error?.message || 'Unable to create the student accounts', row))
        })
      }
    }

    if (created.length > 0) {
      clearStatsCache()

      await recordAuditLog({
        actorId: context.user.id,
        actorRole: context.user.role,
        action: 'USER_BULK_IMPORTED',
        entityType: 'User',
        metadata: {
          importedStudents: created.length,
          failedRows: failures.length
        }
      })
    }

    result.withStatus(created.length > 0 ? 201 : 400, {
      message: created.length > 0
        ? 'Student import completed.'
        : 'No student accounts were created from the uploaded file.',
      summary: {
        processed: importedRows.length,
        created: created.length,
        failed: failures.length
      },
      created: created.map(({ temporaryPassword: _temporaryPassword, emailVerificationToken: _emailVerificationToken, ...row }) => row),
      failures
    })
  }  finally {
    if (uploadedFilePath) {
      await fs.promises.unlink(uploadedFilePath).catch(() => {})
    }
  }
}

const buildStudentImportJobPayload = (context) => ({
  file: {
    path: context.file.path,
    originalname: context.file.originalname,
    filename: context.file.filename,
    mimetype: context.file.mimetype,
    size: context.file.size
  },
  user: context.user
    ? {
        id: context.user.id,
        role: context.user.role
      }
    : null,
  coordinator: context.coordinator
    ? {
        id: context.coordinator.id,
        department: context.coordinator.department,
        departments: context.coordinator.departments
      }
    : null
})

const importStudents = async (context, result = createServiceResponder()) => {
  if (!context.file?.path) {
    return result.withStatus(400, { message: 'Please upload a CSV or XLSX file to import students' })
  }

  try {
    const job = await notificationQueue.add(BULK_STUDENT_IMPORT_JOB, buildStudentImportJobPayload(context), {
      removeOnComplete: 100,
      removeOnFail: 500
    })

    if (job) {
      return result.withStatus(202, {
        message: 'Student import queued.',
        jobId: String(job.id),
        statusUrl: `/api/v1/admin/users/student-import/${job.id}`
      })
    }
  } catch (error) {
    logger.error('Student import queue failed', {
      message: error.message,
      stack: error.stack
    })

    await fs.promises.unlink(context.file.path).catch(() => {})
    return result.withStatus(503, { message: 'Student import queue is temporarily unavailable. Please try again shortly.' })
  }

  return processStudentImportFile(context, result)
}

const processStudentImportJob = async (payload) => {
  const result = createServiceResponder()
  await processStudentImportFile({
    file: payload.file,
    user: payload.user,
    coordinator: payload.coordinator
  }, result)

  const serviceResult = result.toServiceResult()
  if (!serviceResult || serviceResult.statusCode >= 400) {
    const error = new Error(serviceResult?.body?.message || 'Student import failed')
    error.result = serviceResult?.body
    throw error
  }

  return serviceResult.body
}

const getStudentImportJob = async (context, result = createServiceResponder()) => {
  const jobId = String(context.params.jobId || '').trim()
  if (!jobId) {
    return result.withStatus(400, { message: 'Job id is required' })
  }

  const job = await notificationQueue.getJob(jobId)
  if (!job) {
    return result.withStatus(404, { message: 'Student import job not found' })
  }

  const state = await job.getState()
  return result.ok({
    id: String(job.id),
    state,
    progress: job.progress,
    failedReason: job.failedReason || null,
    result: state === 'completed' ? job.returnvalue || null : null
  })
}

module.exports = {
  importStudents,
  getStudentImportJob,
  processStudentImportJob,
  processStudentImportFile
}



