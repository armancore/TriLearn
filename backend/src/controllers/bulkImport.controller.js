const prisma = require('../utils/prisma')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const ExcelJS = require('exceljs')
const logger = require('../utils/logger')
const { recordAuditLog } = require('../utils/audit')
const { sendMail } = require('../utils/mailer')
const { welcomeTemplate } = require('../utils/emailTemplates')
const {
  buildEmailVerificationUrl,
  createEmailVerificationToken
} = require('../utils/emailVerification')
const { hashPassword, getStudentTemporaryPassword } = require('../utils/security')
const { sanitizePlainText, sanitizeXlsxCell } = require('../utils/sanitize')
const { clearStatsCache } = require('../utils/statsCache')
const {
  sanitizeOptionalPlainText,
  deleteStaleDeletedStudentAccounts
} = require('../utils/adminHelpers')
const { normalizeDepartmentList } = require('../utils/instructorDepartments')

const MAX_STUDENT_SEMESTER = 8
const sanitizeImportedSpreadsheetText = (value) => sanitizeXlsxCell(sanitizePlainText(value))


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

const loadStudentImportRows = async (filePath, originalName) => {
  const extension = path.extname(String(originalName || filePath)).toLowerCase()
  const workbook = new ExcelJS.Workbook()

  if (extension === '.csv') {
    await workbook.csv.readFile(filePath)
  } else if (extension === '.xlsx') {
    try {
      await workbook.xlsx.readFile(filePath)
    } catch {
      throw new Error('Unable to read the XLSX file. Please save it again as a valid .xlsx workbook or upload a CSV file.')
    }
  } else {
    throw new Error('Please upload a CSV or XLSX file')
  }

  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error('The uploaded file does not contain any worksheet data')
  }

  const headerRow = worksheet.getRow(1)
  const headerValues = Array.from({ length: headerRow.cellCount }, (_, index) => headerRow.getCell(index + 1).text)
  const columns = resolveStudentImportColumns(headerValues)
  const requiredColumns = ['name', 'email', 'studentId', 'department', 'semester', 'section']
  const missingColumns = requiredColumns.filter((field) => !columns[field])

  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}`)
  }

  const rows = []

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const entry = {
      rowNumber,
      name: columns.name ? sanitizeImportedSpreadsheetText(row.getCell(columns.name).text) : '',
      email: columns.email ? sanitizeImportedSpreadsheetText(row.getCell(columns.email).text) : '',
      studentId: columns.studentId ? sanitizeImportedSpreadsheetText(row.getCell(columns.studentId).text) : '',
      phone: columns.phone ? sanitizeImportedSpreadsheetText(row.getCell(columns.phone).text) : '',
      address: columns.address ? sanitizeImportedSpreadsheetText(row.getCell(columns.address).text) : '',
      department: columns.department ? sanitizeImportedSpreadsheetText(row.getCell(columns.department).text) : '',
      semester: columns.semester ? sanitizeImportedSpreadsheetText(row.getCell(columns.semester).text) : '',
      section: columns.section ? sanitizeImportedSpreadsheetText(row.getCell(columns.section).text) : ''
    }

    const hasData = Object.values(entry).some((value) => value && String(value).trim() !== '')
    if (hasData) {
      rows.push(entry)
    }
  }

  return rows
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

const getCoordinatorDepartments = (req) => {
  if (req?.user?.role !== 'COORDINATOR') {
    return []
  }

  return normalizeDepartmentList([
    ...(Array.isArray(req.coordinator?.departments) ? req.coordinator.departments : []),
    req.coordinator?.department
  ])
}

const importStudents = async (req, res) => {
  const uploadedFilePath = req.file?.path

  try {
    if (!req.file?.path) {
      return res.status(400).json({ message: 'Please upload a CSV or XLSX file to import students' })
    }

    let importedRows
    try {
      importedRows = await loadStudentImportRows(req.file.path, req.file.originalname)
    } catch (error) {
      return res.status(400).json({
        message: error?.message || 'Unable to read the uploaded student import file'
      })
    }
    if (importedRows.length === 0) {
      return res.status(400).json({ message: 'The uploaded file does not contain any student rows' })
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
    const coordinatorDepartments = getCoordinatorDepartments(req)
    const seenEmails = new Set()
    const seenStudentIds = new Set()
    const normalizedRows = []
    const failures = []

    importedRows.forEach((row) => {
      const normalizedEmail = row.email.trim().toLowerCase()
      const normalizedStudentId = row.studentId.trim().toUpperCase()
      const normalizedDepartmentKey = normalizeDepartmentValue(row.department).toLowerCase()
      const resolvedDepartment = departmentLookup[normalizedDepartmentKey] || null
      const semester = Number.parseInt(row.semester, 10)
      const sanitizedName = sanitizePlainText(row.name)
      const sanitizedPhone = sanitizeOptionalPlainText(row.phone) || null
      const sanitizedAddress = sanitizeOptionalPlainText(row.address) || null
      const sanitizedSection = normalizeSectionValue(row.section)

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
          const temporaryPassword = getStudentTemporaryPassword()
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

        await Promise.allSettled(created.map(async (row) => {
          const { subject, html, text } = welcomeTemplate({
            name: row.name,
            email: row.email,
            tempPassword: row.temporaryPassword,
            verificationUrl: buildEmailVerificationUrl(row.emailVerificationToken)
          })

          await sendMail({ to: row.email, subject, html, text })
        })).then((results) => {
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              logger.error('Welcome email failed', {
                message: result.reason?.message,
                stack: result.reason?.stack,
                userId: created[index]?.id
              })
            } else if (created[index]) {
              created[index].welcomeEmailSent = true
            }
          })
        })
      } catch (error) {
        rowsToCreate.forEach((row) => {
          failures.push(buildStudentImportError(row.rowNumber, error?.message || 'Unable to create the student accounts', row))
        })
      }
    }

    if (created.length > 0) {
      clearStatsCache()

      await recordAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'USER_BULK_IMPORTED',
        entityType: 'User',
        metadata: {
          importedStudents: created.length,
          failedRows: failures.length
        }
      })
    }

    res.status(created.length > 0 ? 201 : 400).json({
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
  } catch (error) {
    res.internalError(error, 'Unable to import students')
  } finally {
    if (uploadedFilePath) {
      await fs.promises.unlink(uploadedFilePath).catch(() => {})
    }
  }
}

module.exports = {
  importStudents
}



