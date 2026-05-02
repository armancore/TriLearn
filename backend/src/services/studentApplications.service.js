const prisma = require('../utils/prisma')
const { enrollStudentInMatchingSubjects } = require('../utils/enrollment')
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
const {
  normalizeEmail,
  sanitizeOptionalPlainText,
  deleteStaleDeletedStudentAccounts
} = require('../utils/adminHelpers')
const { normalizeDepartmentList } = require('../utils/instructorDepartments')

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

const getCoordinatorDepartments = (req) => {
  if (req?.user?.role !== 'COORDINATOR') {
    return []
  }

  return normalizeDepartmentList([
    ...(Array.isArray(req.coordinator?.departments) ? req.coordinator.departments : []),
    req.coordinator?.department
  ])
}
/**
 * Handles get student applications business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getStudentApplications = async (req, response) => {
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

    response.json({ total, page, limit, applications })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles get student application business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getStudentApplication = async (req, response) => {
  try {
    const { id } = req.params
    const application = await prisma.studentApplication.findUnique({
      where: { id }
    })

    if (!application) {
      return response.status(404).json({ message: 'Student application not found' })
    }

    const coordinatorDepartments = getCoordinatorDepartments(req)
    if (
      coordinatorDepartments.length > 0 &&
      !coordinatorDepartments.includes(application.preferredDepartment)
    ) {
      return response.status(403).json({ message: 'You can only manage applications in your own department' })
    }

    response.json({ application })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles update student application status business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const updateStudentApplicationStatus = async (req, response) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (status === 'CONVERTED') {
      return response.status(400).json({
        message: 'Student applications can only be marked as converted when an account is created from the application.'
      })
    }

    const existingApplication = await prisma.studentApplication.findUnique({
      where: { id }
    })

    if (!existingApplication) {
      return response.status(404).json({ message: 'Student application not found' })
    }

    const coordinatorDepartments = getCoordinatorDepartments(req)
    if (
      coordinatorDepartments.length > 0 &&
      !coordinatorDepartments.includes(existingApplication.preferredDepartment)
    ) {
      return response.status(403).json({ message: 'You can only manage applications in your own department' })
    }

    const application = await prisma.studentApplication.update({
      where: { id },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedBy: req.user.id
      }
    })

    response.json({
      message: 'Application status updated successfully!',
      application
    })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles create student from application business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createStudentFromApplication = async (req, response) => {
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
      return response.status(404).json({ message: 'Student application not found' })
    }

    if (application.linkedUserId || application.status === 'CONVERTED') {
      const linkedActiveUser = application.linkedUserId
        ? await prisma.user.findFirst({
            where: {
              id: application.linkedUserId,
              deletedAt: null
            },
            select: { id: true }
          })
        : null

      if (linkedActiveUser) {
        return response.status(400).json({ message: 'A student account has already been created from this application' })
      }
    }

    const coordinatorDepartments = getCoordinatorDepartments(req)
    if (
      coordinatorDepartments.length > 0 &&
      !coordinatorDepartments.includes(application.preferredDepartment)
    ) {
      return response.status(403).json({ message: 'You can only manage applications in your own department' })
    }

    const validDepartment = await ensureDepartmentExists(normalizedDepartment)
    if (!validDepartment) {
      return response.status(400).json({ message: 'Please select a valid department' })
    }

    const normalizedApplicationEmail = normalizeEmail(application.email)

    await deleteStaleDeletedStudentAccounts(prisma, {
      emails: [normalizedApplicationEmail],
      studentIds: [normalizedStudentId]
    })

    const [existingUser, existingStudent] = await Promise.all([
      prisma.user.findUnique({ where: { email: normalizedApplicationEmail } }),
      prisma.student.findUnique({ where: { rollNumber: normalizedStudentId } })
    ])

    if (existingUser) {
      return response.status(400).json({ message: 'An account already exists with the application email address' })
    }

    if (existingStudent) {
      return response.status(400).json({ message: 'Student ID already exists' })
    }

    const sectionToAssign = normalizedSection || normalizeSectionValue(application.preferredSection)
    if (!sectionToAssign) {
      return response.status(400).json({ message: 'Section is required to create a student account from application' })
    }

    const validSection = await hasDepartmentSection({
      department: normalizedDepartment,
      semester,
      section: sectionToAssign
    })

    if (!validSection) {
      return response.status(400).json({ message: 'Please create this section under the selected department and semester first' })
    }

    const temporaryPassword = getStudentTemporaryPassword()
    const hashedPassword = await hashPassword(temporaryPassword)
    const emailVerification = createEmailVerificationToken()

    const user = await prisma.user.create({
      data: {
        name: sanitizePlainText(application.fullName),
        email: normalizedApplicationEmail,
        password: hashedPassword,
        role: 'STUDENT',
        phone: sanitizeOptionalPlainText(application.phone),
        address: sanitizeOptionalPlainText(application.temporaryAddress),
        mustChangePassword: true,
        profileCompleted: true,
        emailVerified: false,
        emailVerificationToken: emailVerification.tokenHash,
        emailVerificationExpiry: emailVerification.expiresAt,
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
      userId: user.id,
      emailVerificationToken: emailVerification.token
    })

    response.status(201).json({
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
    response.internalError(error)
  }
}

/**
 * Handles delete student application business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteStudentApplication = async (req, response) => {
  try {
    const { id } = req.params

    const application = await prisma.studentApplication.findUnique({
      where: { id }
    })

    if (!application) {
      return response.status(404).json({ message: 'Student application not found' })
    }

    const coordinatorDepartments = getCoordinatorDepartments(req)
    if (
      coordinatorDepartments.length > 0 &&
      !coordinatorDepartments.includes(application.preferredDepartment)
    ) {
      return response.status(403).json({ message: 'You can only manage applications in your own department' })
    }

    await prisma.studentApplication.delete({
      where: { id }
    })

    response.json({ message: 'Student application deleted successfully!' })

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
    response.internalError(error)
  }
}

const reviewStudentApplication = updateStudentApplicationStatus
const convertStudentApplication = createStudentFromApplication

module.exports = {
  getStudentApplications,
  getStudentApplication,
  reviewStudentApplication,
  updateStudentApplicationStatus,
  convertStudentApplication,
  createStudentFromApplication,
  deleteStudentApplication
}
