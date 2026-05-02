const prisma = require('../utils/prisma')
const { enrollStudentInMatchingSubjects, syncStudentEnrollmentForSemester } = require('../utils/enrollment')
const { getPagination } = require('../utils/pagination')
const logger = require('../utils/logger')
const { ensureDepartmentExists } = require('../controllers/department.controller')
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

// ================================
// GET ALL USERS
// ================================
/**
 * Handles get all users business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAllUsers = async (req, response) => {
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
          return response.json({ total: 0, page, limit, users: [] })
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

    response.json({ total, page, limit, users: users.map(addUserInstructorDepartments) })

  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// GET USER BY ID
// ================================
/**
 * Handles get user by id business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getUserById = async (req, response) => {
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
        emailVerified: true,
        createdAt: true,
        student: true,
        instructor: { include: instructorDepartmentMembershipInclude },
        admin: true,
        coordinator: true,
      }
    })

    if (!user) {
      return response.status(404).json({ message: 'User not found' })
    }

    if (!coordinatorCanManageUser(req, user)) {
      return response.status(403).json({ message: 'You can only access users in your own department' })
    }

    response.json({ user: addUserInstructorDepartments(user) })

  } catch (error) {
    response.internalError(error)
  }
}

// ================================
// CREATE COORDINATOR
// ================================
/**
 * Handles create coordinator business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createCoordinator = async (req, response) => {
  try {
    const { name, email, password, phone, address, department } = req.body
    const normalizedEmail = normalizeEmail(email)
    const normalizedDepartment = department?.trim() || null
    const sanitizedName = sanitizePlainText(name)
    const sanitizedPhone = sanitizeOptionalPlainText(phone)
    const sanitizedAddress = sanitizeOptionalPlainText(address)

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existingUser) {
      return response.status(400).json({ message: 'Email already exists' })
    }

    if (normalizedDepartment) {
      const validDepartment = await ensureDepartmentExists(normalizedDepartment)
      if (!validDepartment) {
        return response.status(400).json({ message: 'Please select a valid department' })
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

    response.status(201).json({
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
    response.internalError(error)
  }
}

// ================================
// CREATE GATEKEEPER
// ================================
/**
 * Handles create gatekeeper business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createGatekeeper = async (req, response) => {
  try {
    const { name, email, password, phone, address } = req.body
    const normalizedEmail = normalizeEmail(email)
    const sanitizedName = sanitizePlainText(name)
    const sanitizedPhone = sanitizeOptionalPlainText(phone)
    const sanitizedAddress = sanitizeOptionalPlainText(address)

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existingUser) {
      return response.status(400).json({ message: 'Email already exists' })
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

    response.status(201).json({
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
    response.internalError(error)
  }
}

// ================================
// CREATE INSTRUCTOR
// ================================
/**
 * Handles create instructor business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createInstructor = async (req, response) => {
  try {
    const { name, email, password, phone, address, department, departments } = req.body
    const normalizedEmail = normalizeEmail(email)
    const sanitizedName = sanitizePlainText(name)
    const sanitizedPhone = sanitizeOptionalPlainText(phone)
    const sanitizedAddress = sanitizeOptionalPlainText(address)

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existingUser) {
      return response.status(400).json({ message: 'Email already exists' })
    }

    const instructorDepartments = await resolveInstructorDepartmentsInput({ department, departments })
    if (!instructorDepartments?.primaryDepartment) {
      return response.status(400).json({ message: 'Please select at least one valid department' })
    }

    const coordinatorDepartments = getCoordinatorDepartments(req)
    if (
      coordinatorDepartments.length > 0 &&
      !instructorDepartments.departments.every((value) => coordinatorDepartments.includes(value))
    ) {
      return response.status(403).json({ message: 'Coordinators can only create instructors in their own department' })
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

    response.status(201).json({
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
    response.internalError(error)
  }
}

// ================================
// CREATE STUDENT
// ================================
/**
 * Handles create student business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createStudent = async (req, response) => {
  try {
    const { name, email, studentId, phone, address, semester, section, department } = req.body
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
      return response.status(400).json({ message: 'Student email already exists' })
    }

    if (existingStudent) {
      return response.status(400).json({ message: 'Student ID already exists' })
    }

    if (normalizedDepartment) {
      const validDepartment = await ensureDepartmentExists(normalizedDepartment)
      if (!validDepartment) {
        return response.status(400).json({ message: 'Please select a valid department' })
      }
    }

    const coordinatorDepartments = getCoordinatorDepartments(req)
    if (coordinatorDepartments.length > 0 && !coordinatorDepartments.includes(normalizedDepartment)) {
      return response.status(403).json({ message: 'Coordinators can only create students in their own department' })
    }

    const validSection = await hasDepartmentSection({
      department: normalizedDepartment,
      semester: semester || 1,
      section: normalizedSection
    })

    if (!validSection) {
      return response.status(400).json({ message: 'Please create this section under the selected department and semester first' })
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

    response.status(201).json({
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
    response.internalError(error)
  }
}

// ================================
// UPDATE USER
// ================================
/**
 * Handles update user business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const updateUser = async (req, response) => {
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
      return response.status(404).json({ message: 'User not found' })
    }

    if (!isCoordinatorInstructorDepartmentUpdate(req, user, hasInstructorDepartmentUpdate) && !coordinatorCanManageUser(req, user)) {
      return response.status(403).json({ message: 'You can only manage users in your own department' })
    }

    if (normalizedDepartment && user.role !== 'INSTRUCTOR') {
      const validDepartment = await ensureDepartmentExists(normalizedDepartment)
      if (!validDepartment) {
        return response.status(400).json({ message: 'Please select a valid department' })
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { name: sanitizedName, phone: sanitizedPhone, address: sanitizedAddress }
    })

    if (user.role === 'INSTRUCTOR' && hasInstructorDepartmentUpdate) {
      const instructorDepartments = await resolveInstructorDepartmentsInput({ department, departments })
      if (!instructorDepartments?.primaryDepartment) {
        return response.status(400).json({ message: 'Please select at least one valid department' })
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
          return response.status(403).json({ message: 'You can only manage your own department assignments for instructors' })
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
        return response.status(403).json({ message: 'You can only manage users in your own department' })
      }

      await prisma.coordinator.update({
        where: { userId: id },
        data: { department: normalizedDepartment }
      })
    }

    if (user.role === 'STUDENT') {
      const coordinatorDepartments = getCoordinatorDepartments(req)
      if (coordinatorDepartments.length > 0 && normalizedDepartment && !coordinatorDepartments.includes(normalizedDepartment)) {
        return response.status(403).json({ message: 'You can only manage users in your own department' })
      }

      if (semester !== undefined && semester > MAX_STUDENT_SEMESTER) {
        return response.status(400).json({ message: `Semester must be between 1 and ${MAX_STUDENT_SEMESTER}` })
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
          return response.status(400).json({ message: 'Please choose a section that exists for the selected department and semester' })
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

    response.json({ message: 'User updated successfully!', user: updatedUser })

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
    response.internalError(error)
  }
}

// ================================
// TOGGLE USER STATUS (enable/disable)
// ================================
/**
 * Handles toggle user status business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const toggleUserStatus = async (req, response) => {
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
      return response.status(404).json({ message: 'User not found' })
    }

    if (user.id === req.user.id) {
      return response.status(400).json({ message: 'You cannot disable yourself' })
    }

    if (!coordinatorCanManageUser(req, user)) {
      return response.status(403).json({ message: 'You can only manage users in your own department' })
    }

    const updateResult = await prisma.user.updateMany({
      where: {
        id,
        isActive: user.isActive
      },
      data: { isActive: !user.isActive }
    })

    if (updateResult.count === 0) {
      return response.status(409).json({
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

    response.json({
      message: `User ${updatedUser.isActive ? 'enabled' : 'disabled'} successfully!`,
      isActive: updatedUser.isActive
    })

    if (!updatedUser.isActive) {
      await revokeAllAccessTokensForUser(id)
    }

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
    response.internalError(error)
  }
}

// ================================
// DELETE USER
// ================================
/**
 * Handles delete user business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteUser = async (req, response) => {
  try {
    const { id } = req.params

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
      return response.status(404).json({ message: 'User not found' })
    }

    if (user.id === req.user.id) {
      return response.status(400).json({ message: 'You cannot delete yourself' })
    }

    if (!coordinatorCanManageUser(req, user)) {
      return response.status(403).json({ message: 'You can only manage users in your own department' })
    }

    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN', deletedAt: null }
      })

      if (adminCount <= 1) {
        return response.status(400).json({ message: 'You cannot delete the last admin user' })
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

    response.json({ message: 'User deleted successfully!' })

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
    response.internalError(error)
  }
}

/**
 * Handles bulk assign student section business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const bulkAssignStudentSection = async (req, response) => {
  try {
    const { userIds, department, semester, section } = req.body
    const normalizedDepartment = normalizeDepartmentValue(department)
    const normalizedSection = normalizeSectionValue(section)

    const validDepartment = await ensureDepartmentExists(normalizedDepartment)
    if (!validDepartment) {
      return response.status(400).json({ message: 'Please select a valid department' })
    }

    const coordinatorDepartments = getCoordinatorDepartments(req)
    if (coordinatorDepartments.length > 0 && !coordinatorDepartments.includes(normalizedDepartment)) {
      return response.status(403).json({ message: 'You can only manage students in your own department' })
    }

    const validSection = await hasDepartmentSection({
      department: normalizedDepartment,
      semester,
      section: normalizedSection
    })
    if (!validSection) {
      return response.status(400).json({ message: 'Please choose a section configured for the selected department and semester' })
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
      return response.status(400).json({ message: 'Some selected users are missing or not student accounts' })
    }

    const blockedUser = targetUsers.find((user) => !coordinatorCanManageUser(req, user))
    if (blockedUser) {
      return response.status(403).json({ message: 'You can only manage students in your own department' })
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

    response.json({
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
    response.internalError(error)
  }
}

/**
 * Handles promote student semester business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const promoteStudentSemester = async (req, response) => {
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
      return response.status(404).json({ message: 'Student not found' })
    }

    if (!coordinatorCanManageUser(req, user)) {
      return response.status(403).json({ message: 'You can only manage users in your own department' })
    }

    if (user.student.isGraduated) {
      return response.status(400).json({ message: `Student already graduated in ${user.student.graduationYear || 'the recorded year'}` })
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

      response.json({
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

    response.json({
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
    response.internalError(error)
  }
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


