const prisma = require('../utils/prisma')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const ExcelJS = require('exceljs')
const { enrollStudentInMatchingSubjects, syncStudentEnrollmentForSemester } = require('../utils/enrollment')
const { getPagination } = require('../utils/pagination')
const logger = require('../utils/logger')
const { ensureDepartmentExists } = require('./department.controller')
const { recordAuditLog } = require('../utils/audit')
const { sendMail } = require('../utils/mailer')
const { welcomeTemplate } = require('../utils/emailTemplates')
const { hashPassword, getStudentTemporaryPassword } = require('../utils/security')
const { sanitizePlainText } = require('../utils/sanitize')
const { getReadyRedisClient } = require('../utils/redis')
const {
  getInstructorDepartments,
  normalizeDepartmentList
} = require('../utils/instructorDepartments')

const STATS_CACHE_TTL = 30 * 1000 // 30 seconds
const STATS_CACHE_KEY = 'admin:stats:v1'
const ADMIN_STATS_FIELDS = [
  'totalUsers',
  'totalStudents',
  'totalInstructors',
  'totalCoordinators',
  'totalGatekeepers',
  'totalSubjects'
]
const MAX_STUDENT_SEMESTER = 8
let statsCache = null
let statsCacheExpiresAt = 0
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

const normalizeCachedAdminStats = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const normalized = {}
  for (const field of ADMIN_STATS_FIELDS) {
    const fieldValue = value[field]
    if (!Number.isSafeInteger(fieldValue) || fieldValue < 0) {
      return null
    }
    normalized[field] = fieldValue
  }

  return normalized
}

const readSharedStatsCache = async () => {
  try {
    const client = await getReadyRedisClient({ context: 'admin stats cache' })
    if (!client) {
      return null
    }

    const cachedValue = await client.get(STATS_CACHE_KEY)
    if (!cachedValue) {
      return null
    }

    const parsedCache = JSON.parse(cachedValue)
    const normalizedStats = normalizeCachedAdminStats(parsedCache)
    if (!normalizedStats) {
      logger.warn('Ignoring invalid admin stats cache payload from Redis')
      return null
    }

    return normalizedStats
  } catch (error) {
    logger.warn('Failed to read admin stats cache from Redis', { message: error.message })
    return null
  }
}

const writeSharedStatsCache = async (stats) => {
  try {
    const client = await getReadyRedisClient({ context: 'admin stats cache' })
    if (!client) {
      return
    }

    await client.set(STATS_CACHE_KEY, JSON.stringify(stats), { PX: STATS_CACHE_TTL })
  } catch (error) {
    logger.warn('Failed to write admin stats cache to Redis', { message: error.message })
  }
}

const clearSharedStatsCache = async () => {
  try {
    const client = await getReadyRedisClient({ context: 'admin stats cache' })
    if (!client) {
      return
    }

    await client.del(STATS_CACHE_KEY)
  } catch (error) {
    logger.warn('Failed to clear admin stats cache in Redis', { message: error.message })
  }
}

const clearStatsCache = () => {
  statsCache = null
  statsCacheExpiresAt = 0
  void clearSharedStatsCache()
}
const sanitizeOptionalPlainText = (value) => (value == null ? value : sanitizePlainText(value))

const buildContainsSearch = (search) => ({
  contains: search,
  mode: 'insensitive'
})

const normalizeImportHeader = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')

const getGraduationYear = (date = new Date()) => date.getFullYear()

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
    await workbook.xlsx.readFile(filePath)
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
      name: columns.name ? sanitizePlainText(row.getCell(columns.name).text) : '',
      email: columns.email ? sanitizePlainText(row.getCell(columns.email).text) : '',
      studentId: columns.studentId ? sanitizePlainText(row.getCell(columns.studentId).text) : '',
      phone: columns.phone ? sanitizePlainText(row.getCell(columns.phone).text) : '',
      address: columns.address ? sanitizePlainText(row.getCell(columns.address).text) : '',
      department: columns.department ? sanitizePlainText(row.getCell(columns.department).text) : '',
      semester: columns.semester ? sanitizePlainText(row.getCell(columns.semester).text) : '',
      section: columns.section ? sanitizePlainText(row.getCell(columns.section).text) : ''
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
  const temporaryPassword = getStudentTemporaryPassword()
  const hashedPassword = await hashPassword(temporaryPassword)
  const sanitizedName = sanitizePlainText(name)
  const sanitizedPhone = sanitizeOptionalPlainText(phone)
  const sanitizedAddress = sanitizeOptionalPlainText(address)
  const sanitizedSection = sanitizeOptionalPlainText(section)

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
    temporaryPassword
  }
}

const sendStudentWelcomeEmail = async ({ name, email, temporaryPassword, userId }) => {
  const { subject, html, text } = welcomeTemplate({
    name,
    email,
    tempPassword: temporaryPassword
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

const sectionScopeKey = ({ department, semester, section }) => (
  `${normalizeDepartmentValue(department).toLowerCase()}::${Number(semester)}::${normalizeSectionValue(section) || ''}`
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
        instructorId,
        department: {
          connect: { name: departmentName }
        }
      }
    })
  )))
}

const getCoordinatorDepartments = (req) => {
  if (req?.user?.role !== 'COORDINATOR') {
    return []
  }

  return normalizeDepartmentList([
    ...(Array.isArray(req.coordinator?.departments) ? req.coordinator.departments : []),
    req.coordinator?.department
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

  if (user.role === 'COORDINATOR') {
    return normalizeDepartmentList([
      ...(Array.isArray(user.coordinator?.departments) ? user.coordinator.departments : []),
      user.coordinator?.department
    ])
  }

  return []
}

const isCoordinatorInstructorDepartmentUpdate = (req, user, hasInstructorDepartmentUpdate) => (
  req?.user?.role === 'COORDINATOR' &&
  user?.role === 'INSTRUCTOR' &&
  hasInstructorDepartmentUpdate
)

const coordinatorCanManageUser = (req, user) => {
  if (req?.user?.role !== 'COORDINATOR') {
    return true
  }

  if (!user || ['ADMIN', 'COORDINATOR'].includes(user.role)) {
    return false
  }

  if (user.role === 'GATEKEEPER') {
    return true
  }

  const coordinatorDepartments = getCoordinatorDepartments(req)
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

const getAdminStats = async (req, res) => {
  try {
    if (statsCache && Date.now() < statsCacheExpiresAt) {
      return res.json({ stats: statsCache })
    }

    const sharedStats = await readSharedStatsCache()
    if (sharedStats) {
      statsCache = sharedStats
      statsCacheExpiresAt = Date.now() + STATS_CACHE_TTL
      return res.json({ stats: sharedStats })
    }

    const [totalUsers, totalStudents, totalInstructors, totalCoordinators, totalGatekeepers, totalSubjects] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { role: 'STUDENT', deletedAt: null } }),
      prisma.user.count({ where: { role: 'INSTRUCTOR', deletedAt: null } }),
      prisma.user.count({ where: { role: 'COORDINATOR', deletedAt: null } }),
      prisma.user.count({ where: { role: 'GATEKEEPER', deletedAt: null } }),
      prisma.subject.count()
    ])

    const stats = {
      totalUsers,
      totalStudents,
      totalInstructors,
      totalCoordinators,
      totalGatekeepers,
      totalSubjects
    }

    statsCache = stats
    statsCacheExpiresAt = Date.now() + STATS_CACHE_TTL
    await writeSharedStatsCache(stats)

    res.json({ stats })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET ALL USERS
// ================================
const getAllUsers = async (req, res) => {
  try {
    const { role, isActive, search, includeAssignable, semester, graduated } = req.query
    const { page, limit, skip } = getPagination(req.query)

    const filters = { deletedAt: null }
    const andFilters = []
    if (req.user?.role === 'COORDINATOR') {
      const allowedRoles = ['STUDENT', 'INSTRUCTOR', 'GATEKEEPER']
      const canSearchAssignableInstructors = includeAssignable === 'true' && role === 'INSTRUCTOR'
      const coordinatorDepartments = getCoordinatorDepartments(req)

      if (canSearchAssignableInstructors) {
        filters.role = 'INSTRUCTOR'
      } else if (role) {
        if (!allowedRoles.includes(role)) {
          return res.json({ total: 0, page, limit, users: [] })
        }

        filters.role = role
      } else {
        filters.role = { in: allowedRoles }
      }

      if (coordinatorDepartments.length > 0) {
        const departmentScopedRoles = []

        if (!role || role === 'STUDENT') {
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

        if (!role || role === 'INSTRUCTOR') {
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

        if (!role || role === 'GATEKEEPER') {
          departmentScopedRoles.push({ role: 'GATEKEEPER' })
        }

        andFilters.push({
          OR: departmentScopedRoles
        })
      }
    } else if (role) {
      filters.role = role
    }

    if (isActive !== undefined) filters.isActive = isActive === 'true'
    if (semester !== undefined || graduated !== undefined) {
      const studentFilters = {}

      if (semester !== undefined) {
        studentFilters.semester = Number(semester)
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
        { coordinator: { is: { department: buildContainsSearch(search) } } }
        ]
      })
    }

    if (andFilters.length > 0) {
      filters.AND = andFilters
    }

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
        createdAt: true,
        student: true,
        instructor: { include: instructorDepartmentMembershipInclude },
        admin: true,
        coordinator: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where: filters })
    ])

    res.json({ total, page, limit, users: users.map(addUserInstructorDepartments) })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET USER BY ID
// ================================
const getUserById = async (req, res) => {
  try {
    const { id } = req.params

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
        createdAt: true,
        student: true,
        instructor: { include: instructorDepartmentMembershipInclude },
        admin: true,
        coordinator: true,
      }
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (!coordinatorCanManageUser(req, user)) {
      return res.status(403).json({ message: 'You can only access users in your own department' })
    }

    res.json({ user: addUserInstructorDepartments(user) })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// CREATE COORDINATOR
// ================================
const createCoordinator = async (req, res) => {
  try {
    const { name, email, password, phone, address, department } = req.body
    const normalizedEmail = normalizeEmail(email)
    const normalizedDepartment = department?.trim() || null
    const sanitizedName = sanitizePlainText(name)
    const sanitizedPhone = sanitizeOptionalPlainText(phone)
    const sanitizedAddress = sanitizeOptionalPlainText(address)

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' })
    }

    if (normalizedDepartment) {
      const validDepartment = await ensureDepartmentExists(normalizedDepartment)
      if (!validDepartment) {
        return res.status(400).json({ message: 'Please select a valid department' })
      }
    }

    const hashedPassword = await hashPassword(password)

    const user = await prisma.user.create({
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
    clearStatsCache()

    res.status(201).json({
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
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      metadata: {
        role: user.role,
        department: user.coordinator.department
      }
    })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// CREATE GATEKEEPER
// ================================
const createGatekeeper = async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body
    const normalizedEmail = normalizeEmail(email)
    const sanitizedName = sanitizePlainText(name)
    const sanitizedPhone = sanitizeOptionalPlainText(phone)
    const sanitizedAddress = sanitizeOptionalPlainText(address)

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' })
    }

    const hashedPassword = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        name: sanitizedName,
        email: normalizedEmail,
        password: hashedPassword,
        role: 'GATEKEEPER',
        phone: sanitizedPhone,
        address: sanitizedAddress
      }
    })
    clearStatsCache()

    res.status(201).json({
      message: 'Gatekeeper created successfully!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      metadata: { role: user.role }
    })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// CREATE INSTRUCTOR
// ================================
const createInstructor = async (req, res) => {
  try {
    const { name, email, password, phone, address, department, departments } = req.body
    const normalizedEmail = normalizeEmail(email)
    const sanitizedName = sanitizePlainText(name)
    const sanitizedPhone = sanitizeOptionalPlainText(phone)
    const sanitizedAddress = sanitizeOptionalPlainText(address)

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' })
    }

    const instructorDepartments = await resolveInstructorDepartmentsInput({ department, departments })
    if (!instructorDepartments?.primaryDepartment) {
      return res.status(400).json({ message: 'Please select at least one valid department' })
    }

    const coordinatorDepartments = getCoordinatorDepartments(req)
    if (
      coordinatorDepartments.length > 0 &&
      !instructorDepartments.departments.every((value) => coordinatorDepartments.includes(value))
    ) {
      return res.status(403).json({ message: 'Coordinators can only create instructors in their own department' })
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

    res.status(201).json({
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
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      metadata: {
        role: user.role,
        department: createdInstructor.department,
        departments: createdInstructor.departments
      }
    })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// CREATE STUDENT
// ================================
const createStudent = async (req, res) => {
  try {
    const { name, email, studentId, phone, address, semester, section, department } = req.body
    const normalizedDepartment = department?.trim() || null
    const normalizedStudentId = studentId.trim().toUpperCase()
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedSection = normalizeSectionValue(section)

    const [existingUser, existingStudent] = await Promise.all([
      prisma.user.findUnique({ where: { email: normalizedEmail } }),
      prisma.student.findUnique({ where: { rollNumber: normalizedStudentId } })
    ])
    if (existingUser) {
      return res.status(400).json({ message: 'Student email already exists' })
    }

    if (existingStudent) {
      return res.status(400).json({ message: 'Student ID already exists' })
    }

    if (normalizedDepartment) {
      const validDepartment = await ensureDepartmentExists(normalizedDepartment)
      if (!validDepartment) {
        return res.status(400).json({ message: 'Please select a valid department' })
      }
    }

    const coordinatorDepartments = getCoordinatorDepartments(req)
    if (coordinatorDepartments.length > 0 && !coordinatorDepartments.includes(normalizedDepartment)) {
      return res.status(403).json({ message: 'Coordinators can only create students in their own department' })
    }

    const validSection = await hasDepartmentSection({
      department: normalizedDepartment,
      semester: semester || 1,
      section: normalizedSection
    })

    if (!validSection) {
      return res.status(400).json({ message: 'Please create this section under the selected department and semester first' })
    }

    const { user, temporaryPassword } = await createStudentAccountRecord({
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
      userId: user.id
    })
    clearStatsCache()

    res.status(201).json({
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
      actorId: req.user.id,
      actorRole: req.user.role,
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

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// UPDATE USER
// ================================
const updateUser = async (req, res) => {
  try {
    const { id } = req.params
    const { name, phone, address, department, departments, semester, section } = req.body
    const normalizedDepartment = department?.trim() || null
    const sanitizedName = name === undefined ? undefined : sanitizePlainText(name)
    const sanitizedPhone = phone === undefined ? undefined : sanitizeOptionalPlainText(phone)
    const sanitizedAddress = address === undefined ? undefined : sanitizeOptionalPlainText(address)
    const normalizedSection = section === undefined ? undefined : normalizeSectionValue(section)
    const hasInstructorDepartmentUpdate = (
      Object.prototype.hasOwnProperty.call(req.body, 'department') ||
      Object.prototype.hasOwnProperty.call(req.body, 'departments')
    )

    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        role: true,
        student: {
          select: {
            id: true,
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
      return res.status(404).json({ message: 'User not found' })
    }

    if (!isCoordinatorInstructorDepartmentUpdate(req, user, hasInstructorDepartmentUpdate) && !coordinatorCanManageUser(req, user)) {
      return res.status(403).json({ message: 'You can only manage users in your own department' })
    }

    if (normalizedDepartment && user.role !== 'INSTRUCTOR') {
      const validDepartment = await ensureDepartmentExists(normalizedDepartment)
      if (!validDepartment) {
        return res.status(400).json({ message: 'Please select a valid department' })
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { name: sanitizedName, phone: sanitizedPhone, address: sanitizedAddress }
    })

    if (user.role === 'INSTRUCTOR' && hasInstructorDepartmentUpdate) {
      const instructorDepartments = await resolveInstructorDepartmentsInput({ department, departments })
      if (!instructorDepartments?.primaryDepartment) {
        return res.status(400).json({ message: 'Please select at least one valid department' })
      }

      const coordinatorDepartments = getCoordinatorDepartments(req)
      if (
        coordinatorDepartments.length > 0 &&
        req.user?.role === 'COORDINATOR'
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
          return res.status(403).json({ message: 'You can only manage your own department assignments for instructors' })
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
      if (getCoordinatorDepartments(req).length > 0) {
        return res.status(403).json({ message: 'You can only manage users in your own department' })
      }

      await prisma.coordinator.update({
        where: { userId: id },
        data: { department: normalizedDepartment }
      })
    }

    if (user.role === 'STUDENT') {
      const coordinatorDepartments = getCoordinatorDepartments(req)
      if (coordinatorDepartments.length > 0 && normalizedDepartment && !coordinatorDepartments.includes(normalizedDepartment)) {
        return res.status(403).json({ message: 'You can only manage users in your own department' })
      }

      if (semester !== undefined && semester > MAX_STUDENT_SEMESTER) {
        return res.status(400).json({ message: `Semester must be between 1 and ${MAX_STUDENT_SEMESTER}` })
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
          return res.status(400).json({ message: 'Please choose a section that exists for the selected department and semester' })
        }
      }

      const shouldResetGraduation = semester !== undefined

      const updatedStudent = await prisma.student.update({
        where: { userId: id },
        data: {
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
        }
      })

      await syncStudentEnrollmentForSemester({
        studentId: updatedStudent.id,
        semester: updatedStudent.semester,
        department: updatedStudent.department
      })
    }

    res.json({ message: 'User updated successfully!', user: updatedUser })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: id,
      metadata: {
        role: user.role,
        department: normalizedDepartment,
        semester,
        section
      }
    })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// TOGGLE USER STATUS (enable/disable)
// ================================
const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params

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
      return res.status(404).json({ message: 'User not found' })
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot disable yourself' })
    }

    if (!coordinatorCanManageUser(req, user)) {
      return res.status(403).json({ message: 'You can only manage users in your own department' })
    }

    const updateResult = await prisma.user.updateMany({
      where: {
        id,
        isActive: user.isActive
      },
      data: { isActive: !user.isActive }
    })

    if (updateResult.count === 0) {
      return res.status(409).json({
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

    res.json({
      message: `User ${updatedUser.isActive ? 'enabled' : 'disabled'} successfully!`,
      isActive: updatedUser.isActive
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: updatedUser.isActive ? 'USER_ENABLED' : 'USER_DISABLED',
      entityType: 'User',
      entityId: id,
      metadata: {
        role: user.role
      }
    })

  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// DELETE USER
// ================================
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params

    const user = await prisma.user.findFirst({ where: { id, deletedAt: null } })
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete yourself' })
    }

    if (!coordinatorCanManageUser(req, user)) {
      return res.status(403).json({ message: 'You can only manage users in your own department' })
    }

    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN', deletedAt: null }
      })

      if (adminCount <= 1) {
        return res.status(400).json({ message: 'You cannot delete the last admin user' })
      }
    }

    await prisma.$transaction([
      prisma.refreshToken.updateMany({
        where: {
          userId: id,
          revokedAt: null
        },
        data: { revokedAt: new Date() }
      }),
      prisma.user.update({
        where: { id },
        data: {
          isActive: false,
          deletedAt: new Date()
        }
      })
    ])
    clearStatsCache()

    res.json({ message: 'User deleted successfully!' })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'USER_DELETED',
      entityType: 'User',
      entityId: id,
      metadata: {
        role: user.role,
        email: user.email
      }
    })

  } catch (error) {
    res.internalError(error)
  }
}

const bulkAssignStudentSection = async (req, res) => {
  try {
    const { userIds, department, semester, section } = req.body
    const normalizedDepartment = normalizeDepartmentValue(department)
    const normalizedSection = normalizeSectionValue(section)

    const validDepartment = await ensureDepartmentExists(normalizedDepartment)
    if (!validDepartment) {
      return res.status(400).json({ message: 'Please select a valid department' })
    }

    const coordinatorDepartments = getCoordinatorDepartments(req)
    if (coordinatorDepartments.length > 0 && !coordinatorDepartments.includes(normalizedDepartment)) {
      return res.status(403).json({ message: 'You can only manage students in your own department' })
    }

    const validSection = await hasDepartmentSection({
      department: normalizedDepartment,
      semester,
      section: normalizedSection
    })
    if (!validSection) {
      return res.status(400).json({ message: 'Please choose a section configured for the selected department and semester' })
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
      return res.status(400).json({ message: 'Some selected users are missing or not student accounts' })
    }

    const blockedUser = targetUsers.find((user) => !coordinatorCanManageUser(req, user))
    if (blockedUser) {
      return res.status(403).json({ message: 'You can only manage students in your own department' })
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

    res.json({
      message: `Updated sections for ${updatedStudents.length} student${updatedStudents.length === 1 ? '' : 's'}.`,
      updated: updatedStudents.length
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'STUDENT_SECTION_BULK_ASSIGNED',
      entityType: 'Student',
      metadata: {
        userIds,
        department: normalizedDepartment,
        semester,
        section: normalizedSection
      }
    })
  } catch (error) {
    res.internalError(error)
  }
}

const promoteStudentSemester = async (req, res) => {
  try {
    const { id } = req.params

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
      return res.status(404).json({ message: 'Student not found' })
    }

    if (!coordinatorCanManageUser(req, user)) {
      return res.status(403).json({ message: 'You can only manage users in your own department' })
    }

    if (user.student.isGraduated) {
      return res.status(400).json({ message: `Student already graduated in ${user.student.graduationYear || 'the recorded year'}` })
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

      res.json({
        message: `${user.name} marked as graduated for ${graduationYear}.`,
        student: graduatedStudent
      })

      await recordAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
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

    res.json({
      message: `Student promoted to semester ${updatedStudent.semester} successfully!`,
      student: updatedStudent
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
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
  } catch (error) {
    res.internalError(error)
  }
}

const importStudents = async (req, res) => {
  const uploadedFilePath = req.file?.path

  try {
    if (!req.file?.path) {
      return res.status(400).json({ message: 'Please upload a CSV or XLSX file to import students' })
    }

    const importedRows = await loadStudentImportRows(req.file.path, req.file.originalname)
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

          return {
            ...row,
            userId: crypto.randomUUID(),
            studentProfileId: crypto.randomUUID(),
            temporaryPassword,
            hashedPassword
          }
        }))

        const { createdRows, conflictFailures } = await prisma.$transaction(async (tx) => {
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
              profileCompleted: false
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
            tempPassword: row.temporaryPassword
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
      created: created.map(({ temporaryPassword: _temporaryPassword, ...row }) => row),
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

const getStudentApplications = async (req, res) => {
  try {
    const { status } = req.query
    const { page, limit, skip } = getPagination(req.query)
    const filters = {}
    const coordinatorDepartments = getCoordinatorDepartments(req)

    if (status) {
      filters.status = status
    }

    if (coordinatorDepartments.length > 0) {
      filters.preferredDepartment = { in: coordinatorDepartments }
    }

    const [applications, total] = await Promise.all([
      prisma.studentApplication.findMany({
        where: filters,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.studentApplication.count({ where: filters })
    ])

    res.json({ total, page, limit, applications })
  } catch (error) {
    res.internalError(error)
  }
}

const updateStudentApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (status === 'CONVERTED') {
      return res.status(400).json({
        message: 'Student applications can only be marked as converted when an account is created from the application.'
      })
    }

    const existingApplication = await prisma.studentApplication.findUnique({
      where: { id }
    })

    if (!existingApplication) {
      return res.status(404).json({ message: 'Student application not found' })
    }

    const coordinatorDepartments = getCoordinatorDepartments(req)
    if (
      coordinatorDepartments.length > 0 &&
      !coordinatorDepartments.includes(existingApplication.preferredDepartment)
    ) {
      return res.status(403).json({ message: 'You can only manage applications in your own department' })
    }

    const application = await prisma.studentApplication.update({
      where: { id },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedBy: req.user.id
      }
    })

    res.json({
      message: 'Application status updated successfully!',
      application
    })
  } catch (error) {
    res.internalError(error)
  }
}

const createStudentFromApplication = async (req, res) => {
  try {
    const { id } = req.params
    const { studentId, department, semester, section } = req.body
    const normalizedStudentId = studentId.trim().toUpperCase()
    const normalizedDepartment = department.trim()
    const normalizedSection = normalizeSectionValue(section || '')

    const application = await prisma.studentApplication.findUnique({
      where: { id }
    })

    if (!application) {
      return res.status(404).json({ message: 'Student application not found' })
    }

    if (application.linkedUserId || application.status === 'CONVERTED') {
      return res.status(400).json({ message: 'A student account has already been created from this application' })
    }

    const coordinatorDepartments = getCoordinatorDepartments(req)
    if (
      coordinatorDepartments.length > 0 &&
      !coordinatorDepartments.includes(application.preferredDepartment)
    ) {
      return res.status(403).json({ message: 'You can only manage applications in your own department' })
    }

    const validDepartment = await ensureDepartmentExists(normalizedDepartment)
    if (!validDepartment) {
      return res.status(400).json({ message: 'Please select a valid department' })
    }

    const [existingUser, existingStudent] = await Promise.all([
      prisma.user.findUnique({ where: { email: normalizeEmail(application.email) } }),
      prisma.student.findUnique({ where: { rollNumber: normalizedStudentId } })
    ])

    if (existingUser) {
      return res.status(400).json({ message: 'An account already exists with the application email address' })
    }

    if (existingStudent) {
      return res.status(400).json({ message: 'Student ID already exists' })
    }

    const sectionToAssign = normalizedSection || normalizeSectionValue(application.preferredSection)
    if (!sectionToAssign) {
      return res.status(400).json({ message: 'Section is required to create a student account from application' })
    }

    const validSection = await hasDepartmentSection({
      department: normalizedDepartment,
      semester,
      section: sectionToAssign
    })

    if (!validSection) {
      return res.status(400).json({ message: 'Please create this section under the selected department and semester first' })
    }

    const temporaryPassword = getStudentTemporaryPassword()
    const hashedPassword = await hashPassword(temporaryPassword)

    const user = await prisma.user.create({
      data: {
        name: sanitizePlainText(application.fullName),
        email: application.email.toLowerCase(),
        password: hashedPassword,
        role: 'STUDENT',
        phone: sanitizeOptionalPlainText(application.phone),
        address: sanitizeOptionalPlainText(application.temporaryAddress),
        mustChangePassword: true,
        profileCompleted: true,
        student: {
          create: {
            rollNumber: normalizedStudentId,
            semester,
            section: sectionToAssign,
            department: normalizedDepartment,
            fatherName: sanitizeOptionalPlainText(application.fatherName),
            motherName: sanitizeOptionalPlainText(application.motherName),
            fatherPhone: sanitizeOptionalPlainText(application.fatherPhone),
            motherPhone: sanitizeOptionalPlainText(application.motherPhone),
            bloodGroup: sanitizeOptionalPlainText(application.bloodGroup),
            localGuardianName: sanitizeOptionalPlainText(application.localGuardianName),
            localGuardianAddress: sanitizeOptionalPlainText(application.localGuardianAddress),
            localGuardianPhone: sanitizeOptionalPlainText(application.localGuardianPhone),
            permanentAddress: sanitizeOptionalPlainText(application.permanentAddress),
            temporaryAddress: sanitizeOptionalPlainText(application.temporaryAddress),
            dateOfBirth: application.dateOfBirth
          }
        }
      },
      include: { student: true }
    })

    await prisma.studentApplication.update({
      where: { id },
      data: {
        status: 'CONVERTED',
        reviewedAt: new Date(),
        reviewedBy: req.user.id,
        linkedUserId: user.id,
        preferredDepartment: normalizedDepartment,
        preferredSemester: semester,
        preferredSection: sectionToAssign
      }
    })

    await enrollStudentInMatchingSubjects({
      studentId: user.student.id,
      semester: user.student.semester,
      department: user.student.department
    })

    const welcomeEmailSent = await sendStudentWelcomeEmail({
      name: user.name,
      email: user.email,
      temporaryPassword,
      userId: user.id
    })

    res.status(201).json({
      message: welcomeEmailSent
        ? 'Student account created from application successfully!'
        : 'Student account created, but the welcome email could not be delivered.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        rollNumber: user.student.rollNumber,
        semester: user.student.semester,
      },
      welcomeEmailSent
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'USER_CREATED_FROM_APPLICATION',
      entityType: 'StudentApplication',
      entityId: id,
      metadata: {
        linkedUserId: user.id,
        department: normalizedDepartment,
        semester,
        section: sectionToAssign
      }
    })
  } catch (error) {
    res.internalError(error)
  }
}

const deleteStudentApplication = async (req, res) => {
  try {
    const { id } = req.params

    const application = await prisma.studentApplication.findUnique({
      where: { id }
    })

    if (!application) {
      return res.status(404).json({ message: 'Student application not found' })
    }

    const coordinatorDepartments = getCoordinatorDepartments(req)
    if (
      coordinatorDepartments.length > 0 &&
      !coordinatorDepartments.includes(application.preferredDepartment)
    ) {
      return res.status(403).json({ message: 'You can only manage applications in your own department' })
    }

    await prisma.studentApplication.delete({
      where: { id }
    })

    res.json({ message: 'Student application deleted successfully!' })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'STUDENT_APPLICATION_DELETED',
      entityType: 'StudentApplication',
      entityId: id,
      metadata: {
        email: application.email,
        status: application.status,
        linkedUserId: application.linkedUserId
      }
    })
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = {
  clearStatsCache,
  getAdminStats,
  getAllUsers,
  getUserById,
  getStudentApplications,
  updateStudentApplicationStatus,
  createStudentFromApplication,
  deleteStudentApplication,
  createGatekeeper,
  createCoordinator,
  createInstructor,
  createStudent,
  importStudents,
  updateUser,
  bulkAssignStudentSection,
  promoteStudentSemester,
  toggleUserStatus,
  deleteUser
}





