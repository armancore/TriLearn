const { createServiceResponder } = require('../utils/serviceResult')
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
const { hashPassword, getStudentTemporaryPassword } = require('../utils/security')
const { sanitizePlainText } = require('../utils/sanitize')
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
        instructorId,
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

  if (user.role === 'GATEKEEPER') {
    return true
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
 * Handles get all users business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAllUsers = async (context, result = createServiceResponder()) => {
    const { role, isActive, search, includeAssignable, semester, graduated } = context.query
  const { page, limit, skip } = getPagination(context.query)

  const filters = { deletedAt: null }
  const andFilters = []
  if (context.user?.role === 'COORDINATOR') {
    const allowedRoles = ['STUDENT', 'INSTRUCTOR', 'GATEKEEPER']
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
      emailVerified: true,
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

  result.ok({ total, page, limit, users: users.map(addUserInstructorDepartments) })

}

// ================================
// GET USER BY ID
// ================================
/**
 * Handles get user by id business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
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

// ================================
// CREATE COORDINATOR
// ================================
/**
 * Handles create coordinator business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createCoordinator = async (context, result = createServiceResponder()) => {
    const { name, email, password, phone, address, department } = context.body
  const normalizedEmail = normalizeEmail(email)
  const normalizedDepartment = department?.trim() || null
  const sanitizedName = sanitizePlainText(name)
  const sanitizedPhone = sanitizeOptionalPlainText(phone)
  const sanitizedAddress = sanitizeOptionalPlainText(address)

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existingUser) {
    return result.withStatus(400, { message: 'Email already exists' })
  }

  if (normalizedDepartment) {
    const validDepartment = await ensureDepartmentExists(normalizedDepartment)
    if (!validDepartment) {
      return result.withStatus(400, { message: 'Please select a valid department' })
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
 * Handles create gatekeeper business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createGatekeeper = async (context, result = createServiceResponder()) => {
    const { name, email, password, phone, address } = context.body
  const normalizedEmail = normalizeEmail(email)
  const sanitizedName = sanitizePlainText(name)
  const sanitizedPhone = sanitizeOptionalPlainText(phone)
  const sanitizedAddress = sanitizeOptionalPlainText(address)

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existingUser) {
    return result.withStatus(400, { message: 'Email already exists' })
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

  result.withStatus(201, {
    message: 'Gatekeeper created successfully!',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: user.id,
    metadata: { role: user.role }
  })
}

// ================================
// CREATE INSTRUCTOR
// ================================
/**
 * Handles create instructor business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
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
 * Handles create student business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
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
 * Handles update user business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const updateUser = async (context, result = createServiceResponder()) => {
    const { id } = context.params
  const { name, phone, address, department, departments, semester, section } = context.body
  const normalizedDepartment = department?.trim() || null
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

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { name: sanitizedName, phone: sanitizedPhone, address: sanitizedAddress }
  })

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
      section
    }
  })

}

// ================================
// TOGGLE USER STATUS (enable/disable)
// ================================
/**
 * Handles toggle user status business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
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
 * Handles delete user business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
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
      coordinator: true
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

  await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: {
        userId: id,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    }),
    prisma.user.delete({
      where: { id }
    })
  ])
  await revokeAllAccessTokensForUser(id)
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
 * Handles bulk assign student section business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
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
 * Handles promote student semester business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
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


