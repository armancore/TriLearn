const prisma = require('../utils/prisma')
const bcrypt = require('bcryptjs')
const { enrollStudentInMatchingSubjects } = require('../utils/enrollment')
const { getPagination } = require('../utils/pagination')
const logger = require('../utils/logger')
const { ensureDepartmentExists } = require('./department.controller')
const { recordAuditLog } = require('../utils/audit')

const DEFAULT_STUDENT_PASSWORD = process.env.DEFAULT_STUDENT_PASSWORD || 'password'

const getManagedDepartmentForUser = (user) => (
  user.student?.department ||
  user.instructor?.department ||
  user.coordinator?.department ||
  null
)

const getDepartmentAliases = async (departmentValue) => {
  const normalizedDepartment = String(departmentValue || '').trim()
  if (!normalizedDepartment) {
    return []
  }

  const department = await prisma.department.findFirst({
    where: {
      OR: [
        { name: normalizedDepartment },
        { code: normalizedDepartment.toUpperCase() }
      ]
    },
    select: {
      name: true,
      code: true
    }
  })

  return Array.from(new Set([
    normalizedDepartment,
    normalizedDepartment.toUpperCase(),
    department?.name,
    department?.code
  ].filter(Boolean)))
}

const getAdminStats = async (req, res) => {
  try {
    const [totalUsers, totalStudents, totalInstructors, totalCoordinators, totalGatekeepers, totalSubjects] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { role: 'INSTRUCTOR' } }),
      prisma.user.count({ where: { role: 'COORDINATOR' } }),
      prisma.user.count({ where: { role: 'GATEKEEPER' } }),
      prisma.subject.count()
    ])

    res.json({
      stats: {
        totalUsers,
        totalStudents,
        totalInstructors,
        totalCoordinators,
        totalGatekeepers,
        totalSubjects
      }
    })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET ALL USERS
// ================================
const getAllUsers = async (req, res) => {
  try {
    const { role, isActive } = req.query
    const { page, limit, skip } = getPagination(req.query)

    const filters = {}
    if (role) filters.role = role
    if (isActive !== undefined) filters.isActive = isActive === 'true'

    if (req.user.role === 'COORDINATOR') {
      const allowedRoles = ['STUDENT', 'INSTRUCTOR']

      if (role && !allowedRoles.includes(role)) {
        return res.json({ total: 0, page, limit, users: [] })
      }

      if (!role) {
        filters.role = { in: allowedRoles }
      }
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
        instructor: true,
        admin: true,
        coordinator: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where: filters })
    ])

    res.json({ total, page, limit, users })

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

    const user = await prisma.user.findUnique({
      where: { id },
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
        instructor: true,
        admin: true,
        coordinator: true,
      }
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({ user })

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
    const normalizedDepartment = department?.trim() || null

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' })
    }

    if (normalizedDepartment) {
      const validDepartment = await ensureDepartmentExists(normalizedDepartment)
      if (!validDepartment) {
        return res.status(400).json({ message: 'Please select a valid department' })
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'COORDINATOR',
        phone,
        address,
        coordinator: {
          create: { department: normalizedDepartment }
        }
      },
      include: { coordinator: true }
    })

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

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'GATEKEEPER',
        phone,
        address
      }
    })

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
    const { name, email, password, phone, address, department } = req.body
    const normalizedDepartment = department?.trim() || null

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' })
    }

    if (normalizedDepartment) {
      const validDepartment = await ensureDepartmentExists(normalizedDepartment)
      if (!validDepartment) {
        return res.status(400).json({ message: 'Please select a valid department' })
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'INSTRUCTOR',
        phone,
        address,
        instructor: {
          create: { department: normalizedDepartment }
        }
      },
      include: { instructor: true }
    })

    res.status(201).json({
      message: 'Instructor created successfully!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.instructor.department
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
        department: user.instructor.department
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

    const hashedPassword = await bcrypt.hash(DEFAULT_STUDENT_PASSWORD, 10)

    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        password: hashedPassword,
        role: 'STUDENT',
        phone,
        address,
        mustChangePassword: true,
        profileCompleted: false,
        student: {
          create: {
            rollNumber: normalizedStudentId,
            semester: semester || 1,
            section,
            department: normalizedDepartment
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

    res.status(201).json({
      message: 'Student created and enrolled in matching semester subjects successfully!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        rollNumber: user.student.rollNumber,
        semester: user.student.semester,
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
    const { name, phone, address, department, semester, section } = req.body
    const normalizedDepartment = department?.trim() || null

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (normalizedDepartment) {
      const validDepartment = await ensureDepartmentExists(normalizedDepartment)
      if (!validDepartment) {
        return res.status(400).json({ message: 'Please select a valid department' })
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { name, phone, address }
    })

    if (user.role === 'INSTRUCTOR' && normalizedDepartment) {
      await prisma.instructor.update({
        where: { userId: id },
        data: { department: normalizedDepartment }
      })
    }

    if (user.role === 'COORDINATOR') {
      await prisma.coordinator.update({
        where: { userId: id },
        data: { department: normalizedDepartment }
      })
    }

    if (user.role === 'STUDENT') {
      const updatedStudent = await prisma.student.update({
        where: { userId: id },
        data: { semester, section, department: normalizedDepartment }
      })

      await enrollStudentInMatchingSubjects({
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

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        isActive: true,
        email: true,
        student: {
          select: { department: true }
        },
        instructor: {
          select: { department: true }
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

    if (req.user.role === 'COORDINATOR') {
      if (!req.coordinator?.department) {
        return res.status(403).json({ message: 'Coordinator department is not configured yet' })
      }

      if (!['STUDENT', 'INSTRUCTOR'].includes(user.role)) {
        return res.status(403).json({ message: 'Coordinators can only manage students and instructors in their department' })
      }

      const managedDepartment = getManagedDepartmentForUser(user)
      const departmentAliases = await getDepartmentAliases(req.coordinator.department)
      if (!departmentAliases.includes(String(managedDepartment || '').trim())) {
        return res.status(403).json({ message: 'You can only manage users in your own department' })
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive }
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

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete yourself' })
    }

    await prisma.user.delete({ where: { id } })

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

const getStudentApplications = async (req, res) => {
  try {
    const { status } = req.query
    const { page, limit, skip } = getPagination(req.query)
    const filters = {}

    if (status) {
      filters.status = status
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

    res.json({ applications, total, page, limit })
  } catch (error) {
    res.internalError(error)
  }
}

const updateStudentApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

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

    const application = await prisma.studentApplication.findUnique({
      where: { id }
    })

    if (!application) {
      return res.status(404).json({ message: 'Student application not found' })
    }

    if (application.linkedUserId || application.status === 'CONVERTED') {
      return res.status(400).json({ message: 'A student account has already been created from this application' })
    }

    const validDepartment = await ensureDepartmentExists(normalizedDepartment)
    if (!validDepartment) {
      return res.status(400).json({ message: 'Please select a valid department' })
    }

    const [existingUser, existingStudent] = await Promise.all([
      prisma.user.findUnique({ where: { email: application.email.toLowerCase() } }),
      prisma.student.findUnique({ where: { rollNumber: normalizedStudentId } })
    ])

    if (existingUser) {
      return res.status(400).json({ message: 'An account already exists with the application email address' })
    }

    if (existingStudent) {
      return res.status(400).json({ message: 'Student ID already exists' })
    }

    const hashedPassword = await bcrypt.hash(DEFAULT_STUDENT_PASSWORD, 10)

    const user = await prisma.user.create({
      data: {
        name: application.fullName,
        email: application.email.toLowerCase(),
        password: hashedPassword,
        role: 'STUDENT',
        phone: application.phone,
        address: application.temporaryAddress,
        mustChangePassword: true,
        profileCompleted: true,
        student: {
          create: {
            rollNumber: normalizedStudentId,
            semester,
            section: section || application.preferredSection,
            department: normalizedDepartment,
            guardianName: application.fatherName,
            guardianPhone: application.fatherPhone,
            fatherName: application.fatherName,
            motherName: application.motherName,
            fatherPhone: application.fatherPhone,
            motherPhone: application.motherPhone,
            bloodGroup: application.bloodGroup,
            localGuardianName: application.localGuardianName,
            localGuardianAddress: application.localGuardianAddress,
            localGuardianPhone: application.localGuardianPhone,
            permanentAddress: application.permanentAddress,
            temporaryAddress: application.temporaryAddress,
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
        preferredSection: section || application.preferredSection
      }
    })

    await enrollStudentInMatchingSubjects({
      studentId: user.student.id,
      semester: user.student.semester,
      department: user.student.department
    })

    res.status(201).json({
      message: 'Student account created from application successfully!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        rollNumber: user.student.rollNumber,
        semester: user.student.semester,
      }
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
        section: section || application.preferredSection
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
  updateUser,
  toggleUserStatus,
  deleteUser
}


