const { createServiceResponder } = require('../utils/serviceResult')
const ExcelJS = require('exceljs')
const fs = require('fs')
const path = require('path')
const prisma = require('../utils/prisma')
const { enrollStudentInMatchingSubjects, syncStudentEnrollmentForSemester } = require('../utils/enrollment')
const { getPagination } = require('../utils/pagination')
const logger = require('../utils/logger')
const { ensureDepartmentExists } = require('./department.service')
const { recordAuditLog } = require('../utils/audit')
const { sendMail } = require('../utils/mailer')
const { welcomeTemplate } = require('../utils/emailTemplates')
const {
  buildEmailVerificationUrl,
  createEmailVerificationToken
} = require('../utils/emailVerification')
const { hashPassword, generateTemporaryPassword } = require('../utils/security')
const { sanitizePlainText, sanitizeXlsxCell } = require('../utils/sanitize')
const { revokeAllAccessTokensForUser } = require('../utils/accessTokenRevocation')
const { clearStatsCache } = require('../utils/statsCache')
const {
  normalizeEmail,
  sanitizeOptionalPlainText,
  deleteStaleDeletedStudentAccounts
} = require('../utils/adminHelpers')
const {
  getInstructorDepartments,
  normalizeDepartmentList
} = require('../utils/instructorDepartments')

const MAX_STUDENT_SEMESTER = 8

const buildContainsSearch = (search) => ({
  contains: search,
  mode: 'insensitive'
})
const getGraduationYear = (date = new Date()) => date.getFullYear()

const omitUndefined = (data) => Object.fromEntries(
  Object.entries(data).filter(([, value]) => value !== undefined)
)

const sanitizeFilenamePart = (value) => String(value || 'students')
  .replace(/[^a-z0-9-_]+/gi, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase()

const normalizeSpreadsheetHeader = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')

const normalizeStudentIdValue = (value) => String(value || '').trim().toUpperCase()

const studentExportFiltersFromQuery = (context) => {
  const { semester, section, graduated } = context.query
  const filters = {
    role: 'STUDENT',
    deletedAt: null,
    student: {
      is: {}
    }
  }
  const coordinatorDepartments = getCoordinatorDepartments(context)

  if (coordinatorDepartments.length > 0) {
    filters.student.is.department = { in: coordinatorDepartments }
  }

  if (semester !== undefined) {
    filters.student.is.semester = Number(semester)
  }

  if (section) {
    filters.student.is.section = section.trim().toUpperCase()
  }

  if (graduated !== undefined) {
    filters.student.is.isGraduated = graduated === 'true'
  }

  return filters
}

const buildDeletedEmail = (user, deletedAt = new Date()) => (
  `deleted:${deletedAt.getTime()}:${user.id}:${user.email}`
)

const releaseDeletedUserEmail = async (tx, existingUser) => {
  if (!existingUser?.deletedAt) {
    return
  }

  await tx.user.update({
    where: { id: existingUser.id },
    data: { email: buildDeletedEmail(existingUser, existingUser.deletedAt) }
  })
}


const createStudentAccountRecord = async ({
  name,
  email,
  studentId,
  phone,
  address,
  semester,
  section,
  department
}) => {
  const temporaryPassword = generateTemporaryPassword()
  const hashedPassword = await hashPassword(temporaryPassword)
  const sanitizedName = sanitizePlainText(name)
  const sanitizedPhone = sanitizeOptionalPlainText(phone)
  const sanitizedAddress = sanitizeOptionalPlainText(address)
  const sanitizedSection = sanitizeOptionalPlainText(section)
  const emailVerification = createEmailVerificationToken()

  const user = await prisma.user.create({
    data: {
      name: sanitizedName,
      email,
      password: hashedPassword,
      role: 'STUDENT',
      phone: sanitizedPhone,
      address: sanitizedAddress,
      mustChangePassword: true,
      profileCompleted: false,
      emailVerified: false,
      emailVerificationToken: emailVerification.tokenHash,
      emailVerificationExpiry: emailVerification.expiresAt,
      student: {
        create: {
          rollNumber: studentId,
          semester,
          section: sanitizedSection,
          department
        }
      }
    },
    include: { student: true }
  })

  await enrollStudentInMatchingSubjects({
    studentId: user.student.id,
    semester: user.student.semester,
    department: user.student.department
  })

  return {
    user,
    temporaryPassword,
    emailVerificationToken: emailVerification.token
  }
}

const sendStudentWelcomeEmail = async ({ name, email, temporaryPassword, userId, emailVerificationToken }) => {
  const { subject, html, text } = welcomeTemplate({
    name,
    email,
    tempPassword: temporaryPassword,
    verificationUrl: emailVerificationToken ? buildEmailVerificationUrl(emailVerificationToken) : undefined
  })

  try {
    await sendMail({ to: email, subject, html, text })
    return true
  } catch (error) {
    logger.error('Welcome email failed', {
      message: error.message,
      stack: error.stack,
      userId
    })
    return false
  }
}

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

const hasDepartmentSection = async ({ department, semester, section }) => {
  if (!department || !semester || !section) {
    return false
  }

  const departmentSectionDelegate = getDepartmentSectionDelegate()
  if (!departmentSectionDelegate) {
    return true
  }

  const record = await departmentSectionDelegate.findFirst({
    where: {
      semester: Number(semester),
      section: normalizeSectionValue(section),
      department: {
        is: {
          name: normalizeDepartmentValue(department)
        }
      }
    },
    select: { id: true }
  })

  return Boolean(record)
}

const resolveInstructorDepartmentsInput = async ({ department, departments }) => {
  const requestedDepartments = normalizeDepartmentList(
    Array.isArray(departments) && departments.length > 0
      ? departments
      : [department]
  )

  const resolvedDepartments = []
  for (const departmentValue of requestedDepartments) {
    const validDepartment = await ensureDepartmentExists(departmentValue)
    if (!validDepartment) {
      return null
    }

    resolvedDepartments.push(
      typeof validDepartment === 'object' && validDepartment?.name
        ? validDepartment.name
        : departmentValue
    )
  }

  const normalizedDepartments = normalizeDepartmentList(resolvedDepartments)

  return {
    departments: normalizedDepartments,
    primaryDepartment: normalizedDepartments[0] || null
  }
}

const instructorDepartmentMembershipInclude = {
  departmentMemberships: {
    include: {
      department: {
        select: { name: true }
      }
    },
    orderBy: { createdAt: 'asc' }
  }
}

const addInstructorDepartments = (instructor) => {
  if (!instructor) {
    return instructor
  }

  const rest = { ...instructor }
  delete rest.departmentMemberships

  return {
    ...rest,
    departments: getInstructorDepartments(instructor)
  }
}

const addUserInstructorDepartments = (user) => (
  user?.instructor
    ? {
        ...user,
        instructor: addInstructorDepartments(user.instructor)
      }
    : user
)

const syncInstructorDepartmentMemberships = async (tx, instructorId, departments) => {
  await tx.instructorDepartmentMembership.deleteMany({
    where: { instructorId }
  })

  if (departments.length === 0) {
    return
  }

  await Promise.all(departments.map((departmentName) => (
    tx.instructorDepartmentMembership.create({
      data: {
        instructor: {
          connect: { id: instructorId }
        },
        department: {
          connect: { name: departmentName }
        }
      }
    })
  )))
}

const getCoordinatorDepartments = (context) => {
  if (context?.user?.role !== 'COORDINATOR') {
    return []
  }

  return normalizeDepartmentList([
    ...(Array.isArray(context.coordinator?.departments) ? context.coordinator.departments : []),
    context.coordinator?.department
  ])
}

const getManagedUserDepartments = (user) => {
  if (!user || typeof user !== 'object') {
    return []
  }

  if (user.role === 'STUDENT') {
    return normalizeDepartmentList([user.student?.department])
  }

  if (user.role === 'INSTRUCTOR') {
    return getInstructorDepartments(user.instructor)
  }

  if (user.role === 'GATEKEEPER') {
    return normalizeDepartmentList([user.gatekeeper?.department])
  }

  if (user.role === 'COORDINATOR') {
    return normalizeDepartmentList([
      ...(Array.isArray(user.coordinator?.departments) ? user.coordinator.departments : []),
      user.coordinator?.department
    ])
  }

  return []
}

const isCoordinatorInstructorDepartmentUpdate = (context, user, hasInstructorDepartmentUpdate) => (
  context?.user?.role === 'COORDINATOR' &&
  user?.role === 'INSTRUCTOR' &&
  hasInstructorDepartmentUpdate
)

const coordinatorCanManageUser = (context, user) => {
  if (context?.user?.role !== 'COORDINATOR') {
    return true
  }

  if (!user || ['ADMIN', 'COORDINATOR'].includes(user.role)) {
    return false
  }

  const coordinatorDepartments = getCoordinatorDepartments(context)
  if (coordinatorDepartments.length === 0) {
    return ['STUDENT', 'INSTRUCTOR', 'GATEKEEPER'].includes(user.role)
  }

  const targetDepartments = getManagedUserDepartments(user)
  if (targetDepartments.length === 0) {
    return false
  }

  const normalizedCoordinatorDepartments = new Set(
    coordinatorDepartments.map((department) => department.toLowerCase())
  )

  return targetDepartments.some((department) => (
    normalizedCoordinatorDepartments.has(department.toLowerCase())
  ))
}

// ================================
// GET ALL USERS
// ================================
/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const getAllUsers = async (context, result = createServiceResponder()) => {
    const { role, excludeRole, isActive, search, includeAssignable, semester, section, graduated } = context.query
  const { page, limit, skip } = getPagination(context.query)

  const filters = { deletedAt: null }
  const andFilters = []
  if (context.user?.role === 'COORDINATOR') {
    const allowedRoles = ['STUDENT', 'INSTRUCTOR', 'GATEKEEPER'].filter((allowedRole) => allowedRole !== excludeRole)
    const canSearchAssignableInstructors = includeAssignable === 'true' && role === 'INSTRUCTOR'
    const coordinatorDepartments = getCoordinatorDepartments(context)

    if (canSearchAssignableInstructors) {
      filters.role = 'INSTRUCTOR'
    } else if (role) {
      if (!allowedRoles.includes(role)) {
        return result.ok({ total: 0, page, limit, users: [] })
      }

      filters.role = role
    } else {
      filters.role = { in: allowedRoles }
    }

    if (coordinatorDepartments.length > 0) {
      const departmentScopedRoles = []

      if ((!role || role === 'STUDENT') && allowedRoles.includes('STUDENT')) {
        departmentScopedRoles.push({
          role: 'STUDENT',
          student: {
            is: {
              department: {
                in: coordinatorDepartments
              }
            }
          }
        })
      }

      if ((!role || role === 'INSTRUCTOR') && allowedRoles.includes('INSTRUCTOR')) {
        departmentScopedRoles.push({
          role: 'INSTRUCTOR',
          instructor: {
            is: {
              OR: [
                {
                  department: {
                    in: coordinatorDepartments
                  }
                },
                {
                  departmentMemberships: {
                    some: {
                      department: {
                        is: {
                          name: {
                            in: coordinatorDepartments
                          }
                        }
                      }
                    }
                  }
                }
              ]
            }
          }
        })
      }

      if ((!role || role === 'GATEKEEPER') && allowedRoles.includes('GATEKEEPER')) {
        departmentScopedRoles.push({
          role: 'GATEKEEPER',
          gatekeeper: {
            is: {
              department: {
                in: coordinatorDepartments
              }
            }
          }
        })
      }

      andFilters.push({
        OR: departmentScopedRoles
      })
    }
  } else if (role) {
    filters.role = role
  } else if (excludeRole) {
    filters.role = { not: excludeRole }
  }

  if (isActive !== undefined) filters.isActive = isActive === 'true'
  if (semester !== undefined || section || graduated !== undefined) {
    const studentFilters = {}

    if (semester !== undefined) {
      studentFilters.semester = Number(semester)
    }

    if (section) {
      studentFilters.section = section.trim().toUpperCase()
    }

    if (graduated !== undefined) {
      studentFilters.isGraduated = graduated === 'true'
    }

    andFilters.push({
      role: 'STUDENT',
      student: {
        is: studentFilters
      }
    })
  }

  if (search) {
    andFilters.push({
      OR: [
      { name: buildContainsSearch(search) },
      { email: buildContainsSearch(search) },
      { phone: buildContainsSearch(search) },
      { student: { is: { rollNumber: buildContainsSearch(search) } } },
      { student: { is: { department: buildContainsSearch(search) } } },
      { instructor: { is: { department: buildContainsSearch(search) } } },
      { instructor: { is: { departmentMemberships: { some: { department: { is: { name: buildContainsSearch(search) } } } } } } },
      { gatekeeper: { is: { department: buildContainsSearch(search) } } },
      { coordinator: { is: { department: buildContainsSearch(search) } } }
      ]
    })
  }

  if (andFilters.length > 0) {
    filters.AND = andFilters
  }

  const shouldSortStudentsByName = filters.role === 'STUDENT' || andFilters.some((filter) => filter.role === 'STUDENT')

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: filters,
      skip,
      take: limit,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      isActive: true,
      mustChangePassword: true,
      profileCompleted: true,
      emailVerified: true,
      createdAt: true,
      student: true,
      instructor: { include: instructorDepartmentMembershipInclude },
      gatekeeper: true,
      admin: true,
      coordinator: true
      },
      orderBy: shouldSortStudentsByName
        ? [{ name: 'asc' }, { student: { rollNumber: 'asc' } }]
        : { createdAt: 'desc' }
    }),
    prisma.user.count({ where: filters })
  ])

  result.ok({ total, page, limit, users: users.map(addUserInstructorDepartments) })

}

// ================================
// GET USER BY ID
// ================================
/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const getUserById = async (context, result = createServiceResponder()) => {
    const { id } = context.params

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      address: true,
      avatar: true,
      isActive: true,
      emailVerified: true,
      createdAt: true,
      student: true,
      instructor: { include: instructorDepartmentMembershipInclude },
      gatekeeper: true,
      admin: true,
      coordinator: true,
    }
  })

  if (!user) {
    return result.withStatus(404, { message: 'User not found' })
  }

  if (!coordinatorCanManageUser(context, user)) {
    return result.withStatus(403, { message: 'You can only access users in your own department' })
  }

  result.ok({ user: addUserInstructorDepartments(user) })

}

const exportStudents = async (context, result = createServiceResponder()) => {
  const { semester, section, graduated } = context.query
  const filters = studentExportFiltersFromQuery(context)

  const students = await prisma.user.findMany({
    where: filters,
    select: {
      name: true,
      email: true,
      phone: true,
      isActive: true,
      student: {
        select: {
          rollNumber: true,
          department: true,
          semester: true,
          section: true,
          isGraduated: true,
          graduationYear: true
        }
      }
    },
    orderBy: [
      { name: 'asc' },
      { student: { rollNumber: 'asc' } }
    ]
  })

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Students')
  const semesterLabel = semester ? `semester-${semester}${section ? `-section-${section}` : ''}` : graduated === 'true' ? 'graduates' : 'all-semesters'
  const fileName = `students-${sanitizeFilenamePart(semesterLabel)}.xlsx`

  worksheet.columns = [
    { header: 'S.N.', key: 'sn', width: 8 },
    { header: 'Student Name', key: 'name', width: 28 },
    { header: 'Student ID', key: 'studentId', width: 20 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Semester', key: 'semester', width: 12 },
    { header: 'Section', key: 'section', width: 12 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Status', key: 'status', width: 14 }
  ]

  students.forEach((user, index) => {
    worksheet.addRow({
      sn: index + 1,
      name: sanitizeXlsxCell(user.name),
      studentId: sanitizeXlsxCell(user.student?.rollNumber || ''),
      department: sanitizeXlsxCell(user.student?.department || ''),
      semester: user.student?.isGraduated ? 'Graduate' : user.student?.semester,
      section: sanitizeXlsxCell(user.student?.section || ''),
      email: sanitizeXlsxCell(user.email),
      phone: sanitizeXlsxCell(user.phone || ''),
      status: user.isActive ? 'Active' : 'Disabled'
    })
  })

  worksheet.getRow(1).font = { bold: true }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]

  result.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  result.header('Content-Disposition', `attachment; filename="${fileName}"`)
  await workbook.xlsx.write(result)
  result.end()
}

const getStudentsForIdTemplate = async (context) => prisma.user.findMany({
  where: studentExportFiltersFromQuery(context),
  select: {
    name: true,
    student: {
      select: {
        rollNumber: true,
        department: true,
        semester: true,
        section: true
      }
    }
  },
  orderBy: [
    { name: 'asc' },
    { student: { rollNumber: 'asc' } }
  ]
})

const exportStudentIdUpdateTemplate = async (context, result = createServiceResponder()) => {
  const { semester, section, graduated } = context.query
  const students = await getStudentsForIdTemplate(context)
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Student ID Updates')
  const semesterLabel = semester ? `semester-${semester}${section ? `-section-${section}` : ''}` : graduated === 'true' ? 'graduates' : 'all-semesters'
  const fileName = `student-id-update-template-${sanitizeFilenamePart(semesterLabel)}.xlsx`

  worksheet.columns = [
    { header: 'currentStudentId', key: 'currentStudentId', width: 20 },
    { header: 'newStudentId', key: 'newStudentId', width: 20 },
    { header: 'studentName', key: 'studentName', width: 28 },
    { header: 'department', key: 'department', width: 18 },
    { header: 'semester', key: 'semester', width: 12 },
    { header: 'section', key: 'section', width: 12 }
  ]

  students.forEach((user) => {
    worksheet.addRow({
      currentStudentId: sanitizeXlsxCell(user.student?.rollNumber || ''),
      newStudentId: '',
      studentName: sanitizeXlsxCell(user.name),
      department: sanitizeXlsxCell(user.student?.department || ''),
      semester: user.student?.semester,
      section: sanitizeXlsxCell(user.student?.section || '')
    })
  })

  worksheet.getRow(1).font = { bold: true }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]

  result.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  result.header('Content-Disposition', `attachment; filename="${fileName}"`)
  await workbook.xlsx.write(result)
  result.end()
}

const resolveStudentIdUpdateColumns = (headers = []) => {
  const normalizedHeaders = headers.map((value) => normalizeSpreadsheetHeader(value))
  const findColumn = (aliases) => {
    const index = normalizedHeaders.findIndex((header) => aliases.includes(header))
    return index >= 0 ? index + 1 : null
  }

  return {
    currentStudentId: findColumn(['currentstudentid', 'oldstudentid', 'currentid', 'oldid', 'studentid', 'rollnumber', 'rollno']),
    newStudentId: findColumn(['newstudentid', 'newid', 'updatedstudentid', 'updatedid'])
  }
}

const buildStudentIdUpdateRowsFromWorksheet = (worksheet) => {
  const headerRow = worksheet.getRow(1)
  const headers = Array.from({ length: headerRow.cellCount }, (_, index) => headerRow.getCell(index + 1).text)
  const columns = resolveStudentIdUpdateColumns(headers)

  if (!columns.currentStudentId || !columns.newStudentId) {
    throw new Error('Missing required columns: currentStudentId, newStudentId')
  }

  const rows = []
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const currentStudentId = normalizeStudentIdValue(row.getCell(columns.currentStudentId).text)
    const newStudentId = normalizeStudentIdValue(row.getCell(columns.newStudentId).text)

    if (currentStudentId || newStudentId) {
      rows.push({ rowNumber, currentStudentId, newStudentId })
    }
  }

  return rows
}

const loadStudentIdUpdateRows = async (filePath, originalName) => {
  const extension = path.extname(String(originalName || filePath)).toLowerCase()
  const workbook = new ExcelJS.Workbook()

  if (extension === '.csv') {
    await workbook.csv.readFile(filePath)
  } else if (extension === '.xlsx') {
    try {
      await workbook.xlsx.readFile(filePath)
    } catch {
      const workbookBuffer = await fs.promises.readFile(filePath)
      await workbook.xlsx.load(workbookBuffer)
    }
  } else {
    throw new Error('Please upload a CSV or XLSX file')
  }

  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error('The uploaded file does not contain any worksheet data')
  }

  return buildStudentIdUpdateRowsFromWorksheet(worksheet)
}

const buildStudentIdUpdateError = (rowNumber, message, row = {}) => ({
  rowNumber,
  currentStudentId: row.currentStudentId || '',
  newStudentId: row.newStudentId || '',
  message
})

const bulkUpdateStudentIds = async (context, result = createServiceResponder()) => {
  if (!context.file?.path) {
    return result.withStatus(400, { message: 'Please upload a CSV or XLSX file' })
  }

  let rows
  try {
    rows = await loadStudentIdUpdateRows(context.file.path, context.file.originalname)
  } catch (error) {
    return result.withStatus(400, { message: error.message || 'Unable to read uploaded file' })
  }

  if (rows.length === 0) {
    return result.withStatus(400, { message: 'No Student ID updates found in the uploaded file' })
  }

  const failures = []
  const seenCurrentIds = new Set()
  const seenNewIds = new Set()
  const candidateRows = []

  rows.forEach((row) => {
    if (!row.currentStudentId) {
      failures.push(buildStudentIdUpdateError(row.rowNumber, 'Current Student ID is required', row))
      return
    }

    if (!row.newStudentId) {
      failures.push(buildStudentIdUpdateError(row.rowNumber, 'New Student ID is required', row))
      return
    }

    if (row.currentStudentId === row.newStudentId) {
      return
    }

    if (seenCurrentIds.has(row.currentStudentId)) {
      failures.push(buildStudentIdUpdateError(row.rowNumber, 'Current Student ID appears more than once in this file', row))
      return
    }

    if (seenNewIds.has(row.newStudentId)) {
      failures.push(buildStudentIdUpdateError(row.rowNumber, 'New Student ID appears more than once in this file', row))
      return
    }

    seenCurrentIds.add(row.currentStudentId)
    seenNewIds.add(row.newStudentId)
    candidateRows.push(row)
  })

  if (candidateRows.length === 0 && failures.length === 0) {
    return result.ok({
      message: 'No Student ID changes were needed.',
      summary: { processed: rows.length, updated: 0, failed: 0 },
      failures: []
    })
  }

  const currentIds = candidateRows.map((row) => row.currentStudentId)
  const newIds = candidateRows.map((row) => row.newStudentId)
  const [currentStudents, conflictingStudents] = await Promise.all([
    prisma.student.findMany({
      where: { rollNumber: { in: currentIds } },
      select: {
        id: true,
        rollNumber: true,
        department: true,
        user: {
          select: {
            id: true,
            deletedAt: true
          }
        }
      }
    }),
    prisma.student.findMany({
      where: { rollNumber: { in: newIds } },
      select: { id: true, rollNumber: true }
    })
  ])
  const currentStudentMap = new Map(currentStudents.map((student) => [student.rollNumber, student]))
  const conflictingStudentMap = new Map(conflictingStudents.map((student) => [student.rollNumber, student]))
  const coordinatorDepartments = getCoordinatorDepartments(context)

  candidateRows.forEach((row) => {
    const student = currentStudentMap.get(row.currentStudentId)
    if (!student || student.user?.deletedAt) {
      failures.push(buildStudentIdUpdateError(row.rowNumber, 'Current Student ID was not found', row))
      return
    }

    if (coordinatorDepartments.length > 0 && !coordinatorDepartments.includes(student.department)) {
      failures.push(buildStudentIdUpdateError(row.rowNumber, 'You can only update students in your own department', row))
      return
    }

    const conflict = conflictingStudentMap.get(row.newStudentId)
    if (conflict && conflict.id !== student.id) {
      failures.push(buildStudentIdUpdateError(row.rowNumber, 'New Student ID already exists', row))
    }
  })

  if (failures.length > 0) {
    return result.withStatus(400, {
      message: 'Student ID update file has validation errors. No changes were applied.',
      summary: { processed: rows.length, updated: 0, failed: failures.length },
      failures
    })
  }

  await prisma.$transaction(candidateRows.map((row) => prisma.student.update({
    where: { rollNumber: row.currentStudentId },
    data: { rollNumber: row.newStudentId }
  })))

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'STUDENT_IDS_BULK_UPDATED',
    entityType: 'Student',
    entityId: context.user.id,
    metadata: {
      updated: candidateRows.length
    }
  })

  result.ok({
    message: `${candidateRows.length} Student ID${candidateRows.length === 1 ? '' : 's'} updated successfully.`,
    summary: { processed: rows.length, updated: candidateRows.length, failed: 0 },
    failures: []
  })
}

// ================================
// CREATE COORDINATOR
// ================================
/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const createCoordinator = async (context, result = createServiceResponder()) => {
    const { name, email, password, phone, address, department } = context.body
  const normalizedEmail = normalizeEmail(email)
  const normalizedDepartment = department?.trim() || null
  const sanitizedName = sanitizePlainText(name)
  const sanitizedPhone = sanitizeOptionalPlainText(phone)
  const sanitizedAddress = sanitizeOptionalPlainText(address)

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existingUser && !existingUser.deletedAt) {
    return result.withStatus(400, { message: 'Email already exists' })
  }

  if (normalizedDepartment) {
    const validDepartment = await ensureDepartmentExists(normalizedDepartment)
    if (!validDepartment) {
      return result.withStatus(400, { message: 'Please select a valid department' })
    }
  }

  const hashedPassword = await hashPassword(password)

  const user = await prisma.$transaction(async (tx) => {
    await releaseDeletedUserEmail(tx, existingUser)

    return tx.user.create({
      data: {
        name: sanitizedName,
        email: normalizedEmail,
        password: hashedPassword,
        role: 'COORDINATOR',
        phone: sanitizedPhone,
        address: sanitizedAddress,
        coordinator: {
          create: { department: normalizedDepartment }
        }
      },
      include: { coordinator: true }
    })
  })
  clearStatsCache()

  result.withStatus(201, {
    message: 'Coordinator created successfully!',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.coordinator.department
    }
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: user.id,
    metadata: {
      role: user.role,
      department: user.coordinator.department
    }
  })
}

// ================================
// CREATE GATEKEEPER
// ================================
/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const createGatekeeper = async (context, result = createServiceResponder()) => {
    const { name, email, password, phone, address, department } = context.body
  const normalizedEmail = normalizeEmail(email)
  const normalizedDepartment = department?.trim() || context.coordinator?.department || null
  const sanitizedName = sanitizePlainText(name)
  const sanitizedPhone = sanitizeOptionalPlainText(phone)
  const sanitizedAddress = sanitizeOptionalPlainText(address)

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existingUser && !existingUser.deletedAt) {
    return result.withStatus(400, { message: 'Email already exists' })
  }

  if (normalizedDepartment) {
    const validDepartment = await ensureDepartmentExists(normalizedDepartment)
    if (!validDepartment) {
      return result.withStatus(400, { message: 'Please select a valid department' })
    }
  }

  const candidateUser = {
    role: 'GATEKEEPER',
    gatekeeper: {
      department: normalizedDepartment
    }
  }
  if (!coordinatorCanManageUser(context, candidateUser)) {
    return result.withStatus(403, { message: 'Coordinators can only create gatekeepers in their own department' })
  }

  const hashedPassword = await hashPassword(password)

  const user = await prisma.$transaction(async (tx) => {
    await releaseDeletedUserEmail(tx, existingUser)

    return tx.user.create({
      data: {
        name: sanitizedName,
        email: normalizedEmail,
        password: hashedPassword,
        role: 'GATEKEEPER',
        phone: sanitizedPhone,
        address: sanitizedAddress,
        gatekeeper: {
          create: {
            department: normalizedDepartment
          }
        }
      }
    })
  })
  clearStatsCache()

  result.withStatus(201, {
    message: 'Gatekeeper created successfully!',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: normalizedDepartment
    }
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: user.id,
    metadata: {
      role: user.role,
      department: normalizedDepartment
    }
  })
}

// ================================
// CREATE INSTRUCTOR
// ================================
/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const createInstructor = async (context, result = createServiceResponder()) => {
    const { name, email, password, phone, address, department, departments } = context.body
  const normalizedEmail = normalizeEmail(email)
  const sanitizedName = sanitizePlainText(name)
  const sanitizedPhone = sanitizeOptionalPlainText(phone)
  const sanitizedAddress = sanitizeOptionalPlainText(address)

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existingUser) {
    return result.withStatus(400, { message: 'Email already exists' })
  }

  const instructorDepartments = await resolveInstructorDepartmentsInput({ department, departments })
  if (!instructorDepartments?.primaryDepartment) {
    return result.withStatus(400, { message: 'Please select at least one valid department' })
  }

  const coordinatorDepartments = getCoordinatorDepartments(context)
  if (
    coordinatorDepartments.length > 0 &&
    !instructorDepartments.departments.every((value) => coordinatorDepartments.includes(value))
  ) {
    return result.withStatus(403, { message: 'Coordinators can only create instructors in their own department' })
  }

  const hashedPassword = await hashPassword(password)

  const user = await prisma.user.create({
    data: {
      name: sanitizedName,
      email: normalizedEmail,
      password: hashedPassword,
      role: 'INSTRUCTOR',
      phone: sanitizedPhone,
      address: sanitizedAddress,
      instructor: {
        create: {
          department: instructorDepartments.primaryDepartment,
          departmentMemberships: {
            create: instructorDepartments.departments.map((departmentName) => ({
              department: {
                connect: { name: departmentName }
              }
            }))
          }
        }
      }
    },
    include: { instructor: { include: instructorDepartmentMembershipInclude } }
  })
  const createdInstructor = addInstructorDepartments(user.instructor)
  clearStatsCache()

  result.withStatus(201, {
    message: 'Instructor created successfully!',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: createdInstructor.department,
      departments: createdInstructor.departments
    }
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: user.id,
    metadata: {
      role: user.role,
      department: createdInstructor.department,
      departments: createdInstructor.departments
    }
  })

}

// ================================
// CREATE STUDENT
// ================================
/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const createStudent = async (context, result = createServiceResponder()) => {
    const { name, email, studentId, phone, address, semester, section, department } = context.body
  const normalizedDepartment = department?.trim() || null
  const normalizedStudentId = studentId.trim().toUpperCase()
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedSection = normalizeSectionValue(section)

  await deleteStaleDeletedStudentAccounts(prisma, {
    emails: [normalizedEmail],
    studentIds: [normalizedStudentId]
  })

  const [existingUser, existingStudent] = await Promise.all([
    prisma.user.findUnique({ where: { email: normalizedEmail } }),
    prisma.student.findUnique({ where: { rollNumber: normalizedStudentId } })
  ])
  if (existingUser) {
    return result.withStatus(400, { message: 'Student email already exists' })
  }

  if (existingStudent) {
    return result.withStatus(400, { message: 'Student ID already exists' })
  }

  if (normalizedDepartment) {
    const validDepartment = await ensureDepartmentExists(normalizedDepartment)
    if (!validDepartment) {
      return result.withStatus(400, { message: 'Please select a valid department' })
    }
  }

  const coordinatorDepartments = getCoordinatorDepartments(context)
  if (coordinatorDepartments.length > 0 && !coordinatorDepartments.includes(normalizedDepartment)) {
    return result.withStatus(403, { message: 'Coordinators can only create students in their own department' })
  }

  const validSection = await hasDepartmentSection({
    department: normalizedDepartment,
    semester: semester || 1,
    section: normalizedSection
  })

  if (!validSection) {
    return result.withStatus(400, { message: 'Please create this section under the selected department and semester first' })
  }

  const { user, temporaryPassword, emailVerificationToken } = await createStudentAccountRecord({
    name,
    email: normalizedEmail,
    studentId: normalizedStudentId,
    phone,
    address,
    semester: semester || 1,
    section: normalizedSection,
    department: normalizedDepartment
  })
  const welcomeEmailSent = await sendStudentWelcomeEmail({
    name: user.name,
    email: user.email,
    temporaryPassword,
    userId: user.id,
    emailVerificationToken
  })
  clearStatsCache()

  result.withStatus(201, {
    message: welcomeEmailSent
      ? 'Student created and enrolled in matching semester subjects successfully!'
      : 'Student created successfully, but the welcome email could not be delivered.',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      rollNumber: user.student.rollNumber,
      semester: user.student.semester
    },
    welcomeEmailSent
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: user.id,
    metadata: {
      role: user.role,
      department: user.student.department,
      semester: user.student.semester,
      section: user.student.section,
      mustChangePassword: true
    }
  })

}

// ================================
// UPDATE USER
// ================================
/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const updateUser = async (context, result = createServiceResponder()) => {
    const { id } = context.params
  const { name, phone, address, department, departments, semester, section, studentId } = context.body
  const normalizedDepartment = department?.trim() || null
  const normalizedStudentId = studentId === undefined ? undefined : studentId.trim().toUpperCase()
  const sanitizedName = name === undefined ? undefined : sanitizePlainText(name)
  const sanitizedPhone = phone === undefined ? undefined : sanitizeOptionalPlainText(phone)
  const sanitizedAddress = address === undefined ? undefined : sanitizeOptionalPlainText(address)
  const normalizedSection = section === undefined ? undefined : normalizeSectionValue(section)
  const hasInstructorDepartmentUpdate = (
    Object.prototype.hasOwnProperty.call(context.body, 'department') ||
    Object.prototype.hasOwnProperty.call(context.body, 'departments')
  )

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      role: true,
      student: {
        select: {
          id: true,
          rollNumber: true,
          semester: true,
          section: true,
          department: true
        }
      },
      instructor: {
        select: {
          department: true,
          departmentMemberships: {
            include: {
              department: {
                select: { name: true }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      },
      coordinator: {
        select: {
          department: true
        }
      }
    }
  })
  if (!user) {
    return result.withStatus(404, { message: 'User not found' })
  }

  if (!isCoordinatorInstructorDepartmentUpdate(context, user, hasInstructorDepartmentUpdate) && !coordinatorCanManageUser(context, user)) {
    return result.withStatus(403, { message: 'You can only manage users in your own department' })
  }

  if (normalizedDepartment && user.role !== 'INSTRUCTOR') {
    const validDepartment = await ensureDepartmentExists(normalizedDepartment)
    if (!validDepartment) {
      return result.withStatus(400, { message: 'Please select a valid department' })
    }
  }

  const userUpdateData = omitUndefined({
    name: sanitizedName,
    phone: sanitizedPhone,
    address: sanitizedAddress
  })
  const updatedUser = Object.keys(userUpdateData).length > 0
    ? await prisma.user.update({
        where: { id },
        data: userUpdateData
      })
    : user

  if (user.role === 'INSTRUCTOR' && hasInstructorDepartmentUpdate) {
    const instructorDepartments = await resolveInstructorDepartmentsInput({ department, departments })
    if (!instructorDepartments?.primaryDepartment) {
      return result.withStatus(400, { message: 'Please select at least one valid department' })
    }

    const coordinatorDepartments = getCoordinatorDepartments(context)
    if (
      coordinatorDepartments.length > 0 &&
      context.user?.role === 'COORDINATOR'
    ) {
      const currentInstructorDepartments = normalizeDepartmentList([
        ...getInstructorDepartments(user.instructor),
        user.instructor?.department
      ])
      const addedDepartments = instructorDepartments.departments.filter((value) => !currentInstructorDepartments.includes(value))
      const removedDepartments = currentInstructorDepartments.filter((value) => !instructorDepartments.departments.includes(value))

      if (
        addedDepartments.some((value) => !coordinatorDepartments.includes(value)) ||
        removedDepartments.some((value) => !coordinatorDepartments.includes(value))
      ) {
        return result.withStatus(403, { message: 'You can only manage your own department assignments for instructors' })
      }
    }

    await prisma.$transaction(async (tx) => {
      const updatedInstructor = await tx.instructor.update({
        where: { userId: id },
        data: {
          department: instructorDepartments.primaryDepartment
        },
        select: { id: true }
      })

      await syncInstructorDepartmentMemberships(
        tx,
        updatedInstructor.id,
        instructorDepartments.departments
      )
    })
  }

  if (user.role === 'COORDINATOR' && normalizedDepartment !== null) {
    if (getCoordinatorDepartments(context).length > 0) {
      return result.withStatus(403, { message: 'You can only manage users in your own department' })
    }

    await prisma.coordinator.update({
      where: { userId: id },
      data: { department: normalizedDepartment }
    })
  }

  if (user.role === 'STUDENT') {
    const coordinatorDepartments = getCoordinatorDepartments(context)
    if (coordinatorDepartments.length > 0 && normalizedDepartment && !coordinatorDepartments.includes(normalizedDepartment)) {
      return result.withStatus(403, { message: 'You can only manage users in your own department' })
    }

    if (semester !== undefined && semester > MAX_STUDENT_SEMESTER) {
      return result.withStatus(400, { message: `Semester must be between 1 and ${MAX_STUDENT_SEMESTER}` })
    }

    if (normalizedStudentId && normalizedStudentId !== user.student?.rollNumber) {
      const existingStudent = await prisma.student.findUnique({
        where: { rollNumber: normalizedStudentId },
        select: { id: true }
      })

      if (existingStudent && existingStudent.id !== user.student?.id) {
        return result.withStatus(400, { message: 'Student ID already exists' })
      }
    }

    const nextDepartment = normalizedDepartment ?? user.student?.department
    const nextSemester = semester ?? user.student?.semester
    const nextSection = normalizedSection === undefined ? user.student?.section : normalizedSection

    if (nextSection) {
      const validSection = await hasDepartmentSection({
        department: nextDepartment,
        semester: nextSemester,
        section: nextSection
      })

      if (!validSection) {
        return result.withStatus(400, { message: 'Please choose a section that exists for the selected department and semester' })
      }
    }

    const shouldResetGraduation = semester !== undefined

    const updatedStudent = await prisma.student.update({
      where: { userId: id },
      data: omitUndefined({
        rollNumber: normalizedStudentId,
        semester,
        section: normalizedSection,
        department: normalizedDepartment ?? undefined,
        ...(shouldResetGraduation
          ? {
              isGraduated: false,
              graduationYear: null,
              graduatedAt: null
            }
          : {})
      })
    })

    await syncStudentEnrollmentForSemester({
      studentId: updatedStudent.id,
      semester: updatedStudent.semester,
      department: updatedStudent.department
    })
  }

  result.ok({ message: 'User updated successfully!', user: updatedUser })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'USER_UPDATED',
    entityType: 'User',
    entityId: id,
    metadata: {
      role: user.role,
      department: normalizedDepartment,
      semester,
      section,
      studentId: normalizedStudentId
    }
  })

}

// ================================
// TOGGLE USER STATUS (enable/disable)
// ================================
/**
 * Enables or disables a managed user after scope checks and revokes access
 * tokens when disabling the account.
 * @param {Record<string, any> & { params: { id: string }, user: { id: string, role: string } }} context - Toggle-status request context.
 * @param {import('../utils/serviceResult').ServiceResponder} [result] - Service result responder.
 * @returns {Promise<import('../utils/serviceResult').ServiceResult | void>} Service result.
 */
const toggleUserStatus = async (context, result = createServiceResponder()) => {
    const { id } = context.params

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      role: true,
      isActive: true,
      email: true,
      student: {
        select: { department: true }
      },
      instructor: {
        select: {
          department: true,
          departmentMemberships: {
            include: {
              department: {
                select: { name: true }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      },
      coordinator: {
        select: { department: true }
      }
    }
  })

  if (!user) {
    return result.withStatus(404, { message: 'User not found' })
  }

  if (user.id === context.user.id) {
    return result.withStatus(400, { message: 'You cannot disable yourself' })
  }

  if (!coordinatorCanManageUser(context, user)) {
    return result.withStatus(403, { message: 'You can only manage users in your own department' })
  }

  const updateResult = await prisma.user.updateMany({
    where: {
      id,
      isActive: user.isActive
    },
    data: { isActive: !user.isActive }
  })

  if (updateResult.count === 0) {
    return result.withStatus(409, {
      message: 'User status changed before this request could be applied. Please refresh and try again.'
    })
  }

  const updatedUser = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      isActive: true
    }
  })

  result.ok({
    message: `User ${updatedUser.isActive ? 'enabled' : 'disabled'} successfully!`,
    isActive: updatedUser.isActive
  })

  if (!updatedUser.isActive) {
    await revokeAllAccessTokensForUser(id)
  }

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: updatedUser.isActive ? 'USER_ENABLED' : 'USER_DISABLED',
    entityType: 'User',
    entityId: id,
    metadata: {
      role: user.role
    }
  })

}

// ================================
// DELETE USER
// ================================
/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const deleteUser = async (context, result = createServiceResponder()) => {
    const { id } = context.params

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: {
      student: true,
      instructor: {
        include: instructorDepartmentMembershipInclude
      },
      coordinator: true,
      gatekeeper: true
    }
  })
  if (!user) {
    return result.withStatus(404, { message: 'User not found' })
  }

  if (user.id === context.user.id) {
    return result.withStatus(400, { message: 'You cannot delete yourself' })
  }

  if (!coordinatorCanManageUser(context, user)) {
    return result.withStatus(403, { message: 'You can only manage users in your own department' })
  }

  if (user.role === 'ADMIN') {
    const adminCount = await prisma.user.count({
      where: { role: 'ADMIN', deletedAt: null }
    })

    if (adminCount <= 1) {
      return result.withStatus(400, { message: 'You cannot delete the last admin user' })
    }
  }

  await prisma.$transaction(async (tx) => {
    const deletedAt = new Date()

    await tx.user.update({
      where: { id },
      data: {
        deletedAt,
        email: buildDeletedEmail(user, deletedAt)
      }
    })

    if (user.student && tx.subjectEnrollment) {
      await tx.subjectEnrollment.deleteMany({
        where: { studentId: user.student.id }
      })
    }

    // Revoke all active sessions for the deleted user
    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: deletedAt }
    })

    // Also revoke the current access token from Redis if available
    await revokeAllAccessTokensForUser(user.id, { throwOnFailure: true })
  })
  clearStatsCache()

  result.ok({ message: 'User deleted successfully!' })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'USER_DELETED',
    entityType: 'User',
    entityId: id,
    metadata: {
      role: user.role,
      email: user.email
    }
  })

}

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const bulkAssignStudentSection = async (context, result = createServiceResponder()) => {
    const { userIds, department, semester, section } = context.body
  const normalizedDepartment = normalizeDepartmentValue(department)
  const normalizedSection = normalizeSectionValue(section)

  const validDepartment = await ensureDepartmentExists(normalizedDepartment)
  if (!validDepartment) {
    return result.withStatus(400, { message: 'Please select a valid department' })
  }

  const coordinatorDepartments = getCoordinatorDepartments(context)
  if (coordinatorDepartments.length > 0 && !coordinatorDepartments.includes(normalizedDepartment)) {
    return result.withStatus(403, { message: 'You can only manage students in your own department' })
  }

  const validSection = await hasDepartmentSection({
    department: normalizedDepartment,
    semester,
    section: normalizedSection
  })
  if (!validSection) {
    return result.withStatus(400, { message: 'Please choose a section configured for the selected department and semester' })
  }

  const targetUsers = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      role: 'STUDENT',
      deletedAt: null
    },
    select: {
      id: true,
      role: true,
      student: {
        select: {
          id: true,
          department: true,
          semester: true,
          section: true
        }
      }
    }
  })

  if (targetUsers.length !== userIds.length) {
    return result.withStatus(400, { message: 'Some selected users are missing or not student accounts' })
  }

  const blockedUser = targetUsers.find((user) => !coordinatorCanManageUser(context, user))
  if (blockedUser) {
    return result.withStatus(403, { message: 'You can only manage students in your own department' })
  }

  const updatedStudents = await prisma.$transaction(async (tx) => {
    const updates = []

    for (const targetUser of targetUsers) {
      const updatedStudent = await tx.student.update({
        where: { userId: targetUser.id },
        data: {
          department: normalizedDepartment,
          semester,
          section: normalizedSection,
          isGraduated: false,
          graduationYear: null,
          graduatedAt: null
        },
        select: {
          id: true,
          userId: true,
          department: true,
          semester: true,
          section: true
        }
      })

      updates.push(updatedStudent)
    }

    return updates
  })

  await Promise.all(updatedStudents.map((student) => (
    syncStudentEnrollmentForSemester({
      studentId: student.id,
      semester: student.semester,
      department: student.department
    })
  )))

  result.ok({
    message: `Updated sections for ${updatedStudents.length} student${updatedStudents.length === 1 ? '' : 's'}.`,
    updated: updatedStudents.length
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'STUDENT_SECTION_BULK_ASSIGNED',
    entityType: 'Student',
    metadata: {
      userIds,
      department: normalizedDepartment,
      semester,
      section: normalizedSection
    }
  })
}

/**
 * @param {object} context - The request context passed by controllerAdapter
 * @param {object} [result] - The serviceResult responder
 * @returns {Promise<object>} Service result
 */
const promoteStudentSemester = async (context, result = createServiceResponder()) => {
    const { id } = context.params

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      role: true,
      name: true,
      student: {
        select: {
          id: true,
          semester: true,
          department: true,
          isGraduated: true,
          graduationYear: true
        }
      }
    }
  })

  if (!user || user.role !== 'STUDENT' || !user.student) {
    return result.withStatus(404, { message: 'Student not found' })
  }

  if (!coordinatorCanManageUser(context, user)) {
    return result.withStatus(403, { message: 'You can only manage users in your own department' })
  }

  if (user.student.isGraduated) {
    return result.withStatus(400, { message: `Student already graduated in ${user.student.graduationYear || 'the recorded year'}` })
  }

  if (user.student.semester >= MAX_STUDENT_SEMESTER) {
    const graduatedAt = new Date()
    const graduationYear = getGraduationYear(graduatedAt)
    const graduatedStudent = await prisma.student.update({
      where: { userId: id },
      data: {
        isGraduated: true,
        graduationYear,
        graduatedAt
      },
      select: {
        id: true,
        semester: true,
        department: true,
        section: true,
        rollNumber: true,
        isGraduated: true,
        graduationYear: true,
        graduatedAt: true
      }
    })

    result.ok({
      message: `${user.name} marked as graduated for ${graduationYear}.`,
      student: graduatedStudent
    })

    await recordAuditLog({
      actorId: context.user.id,
      actorRole: context.user.role,
      action: 'STUDENT_GRADUATED',
      entityType: 'Student',
      entityId: graduatedStudent.id,
      metadata: {
        userId: id,
        finalSemester: user.student.semester,
        graduationYear,
        department: graduatedStudent.department
      }
    })

    return
  }

  const nextSemester = user.student.semester + 1
  const updatedStudent = await prisma.student.update({
    where: { userId: id },
    data: {
      semester: nextSemester,
      isGraduated: false,
      graduationYear: null,
      graduatedAt: null
    },
    select: {
      id: true,
      semester: true,
      department: true,
      section: true,
      rollNumber: true,
      isGraduated: true,
      graduationYear: true
    }
  })

  await syncStudentEnrollmentForSemester({
    studentId: updatedStudent.id,
    semester: updatedStudent.semester,
    department: updatedStudent.department
  })

  result.ok({
    message: `Student promoted to semester ${updatedStudent.semester} successfully!`,
    student: updatedStudent
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'STUDENT_SEMESTER_PROMOTED',
    entityType: 'Student',
    entityId: updatedStudent.id,
    metadata: {
      userId: id,
      previousSemester: user.student.semester,
      newSemester: updatedStudent.semester,
      department: updatedStudent.department
    }
  })
}

module.exports = {
  getAllUsers,
  getUsers: getAllUsers,
  exportStudents,
  exportStudentIdUpdateTemplate,
  bulkUpdateStudentIds,
  getUserById,
  createCoordinator,
  createGatekeeper,
  createInstructor,
  createStudent,
  createUser: createStudent,
  updateUser,
  toggleUserStatus,
  suspendUser: toggleUserStatus,
  unsuspendUser: toggleUserStatus,
  deleteUser,
  bulkAssignStudentSection,
  promoteStudentSemester
}


