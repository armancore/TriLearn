/* eslint-disable no-useless-catch */
const { createServiceResponder } = require('../utils/serviceResult')
const prisma = require('../utils/prisma')
const { getPagination } = require('../utils/pagination')
const { ensureDepartmentExists } = require('./department.service')
const {
  enrollMatchingStudentsInSubject,
  syncMatchingStudentsForSubject
} = require('../utils/enrollment')

const ensureCoordinatorDepartmentScope = async (context, result, departmentValue, message = 'You can only manage subjects in your own department') => {
  if (context.user.role !== 'COORDINATOR') {
    return null
  }

  const coordinatorDepartments = [context.coordinator?.department].filter(Boolean)

  if (coordinatorDepartments.length === 0) {
    result.withStatus(403, { message: 'Coordinator department is not configured yet' })
    return null
  }

  if (departmentValue && !coordinatorDepartments.includes(departmentValue)) {
    result.withStatus(403, { message })
    return null
  }

  return coordinatorDepartments
}

const ensureCoordinatorInstructorScope = async (context, result, instructorId) => {
  if (!instructorId) {
    return true
  }

  const instructor = await prisma.instructor.findUnique({ where: { id: instructorId } })

  if (!instructor) {
    result.withStatus(404, { message: 'Instructor not found' })
    return false
  }

  return true
}

const buildSubjectVisibilityFilter = async (context, filters = {}) => {
  const { user } = context

  if (user.role === 'INSTRUCTOR') {
    return {
      AND: [
        filters,
        {
          instructor: {
            is: {
              userId: user.id
            }
          }
        }
      ]
    }
  }

  if (user.role === 'STUDENT') {
    const student = await prisma.student.findUnique({
      where: { userId: user.id }
    })

    return {
      ...filters,
      enrollments: {
        some: {
          studentId: student?.id || '__no_student__'
        }
      }
    }
  }

  if (user.role === 'COORDINATOR') {
    const coordinatorDepartments = [context.coordinator?.department].filter(Boolean)

    if (coordinatorDepartments.length === 0) {
      return { id: '__no_subjects__' }
    }

    return {
      AND: [
        filters,
        {
          department: {
            in: coordinatorDepartments
          }
        }
      ]
    }
  }

  return filters
}

const subjectListInclude = {
  instructor: {
    include: {
      user: { select: { name: true, email: true } }
    }
  },
  _count: {
    select: {
      assignments: true,
      materials: true,
      attendances: true,
      enrollments: true
    }
  }
}

const buildContainsSearch = (search) => ({
  contains: search,
  mode: 'insensitive'
})

const getEnrollmentTargetStudents = async (subject) => prisma.student.findMany({
  where: {
    user: { isActive: true },
    semester: subject.semester,
    ...(subject.department ? { department: subject.department } : {})
  },
  include: {
    user: {
      select: {
        name: true,
        email: true
      }
    }
  },
  orderBy: [
    { semester: 'asc' },
    { rollNumber: 'asc' }
  ]
})

// ================================
// CREATE SUBJECT
// ================================
/**
 * Handles create subject business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createSubject = async (context, result = createServiceResponder()) => {
  try {
    const { name, code, description, semester, department, instructorId } = context.body
    const normalizedDepartment = department?.trim() || null

    const existingSubject = await prisma.subject.findUnique({
      where: { code }
    })

    if (existingSubject) {
      return result.withStatus(400, { message: 'Subject code already exists' })
    }

    if (normalizedDepartment) {
      const validDepartment = await ensureDepartmentExists(normalizedDepartment)
      if (!validDepartment) {
        return result.withStatus(400, { message: 'Please select a valid department' })
      }
    }

    const departmentAliases = await ensureCoordinatorDepartmentScope(context, result, normalizedDepartment)
    if (context.user.role === 'COORDINATOR' && !departmentAliases) {
      return
    }

    const instructorAllowed = await ensureCoordinatorInstructorScope(context, result, instructorId)
    if (!instructorAllowed) {
      return
    }

    const subject = await prisma.subject.create({
      data: {
        name,
        code,
        description,
        semester,
        department: normalizedDepartment,
        instructorId
      },
      include: subjectListInclude
    })

    await enrollMatchingStudentsInSubject({
      subjectId: subject.id,
      semester,
      department: normalizedDepartment
    })

    result.withStatus(201, {
      message: 'Subject created successfully!',
      subject
    })

  } catch (error) {
    throw error
  }
}

// ================================
// GET ALL SUBJECTS
// ================================
/**
 * Handles get all subjects business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAllSubjects = async (context, result = createServiceResponder()) => {
  try {
    const { semester, department, search } = context.query
    const { page, limit, skip } = getPagination(context.query)

    const filters = {}
    if (semester) filters.semester = parseInt(semester)
    if (department) filters.department = department
    if (search) {
      filters.OR = [
        { name: buildContainsSearch(search) },
        { code: buildContainsSearch(search) },
        { description: buildContainsSearch(search) },
        { department: buildContainsSearch(search) },
        { instructor: { is: { user: { is: { name: buildContainsSearch(search) } } } } }
      ]
    }

    const visibleFilters = await buildSubjectVisibilityFilter(context, filters)

    const [subjects, total] = await Promise.all([
      prisma.subject.findMany({
        where: visibleFilters,
        skip,
        take: limit,
        include: subjectListInclude,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.subject.count({ where: visibleFilters })
    ])

    result.ok({ total, page, limit, subjects })

  } catch (error) {
    throw error
  }
}

// ================================
// GET SUBJECT BY ID
// ================================
/**
 * Handles get subject by id business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getSubjectById = async (context, result = createServiceResponder()) => {
  try {
    const { id } = context.params

    const visibleFilters = await buildSubjectVisibilityFilter(context, { id })

    const subject = await prisma.subject.findFirst({
      where: visibleFilters,
      include: {
        instructor: {
          include: {
            user: { select: { name: true, email: true, phone: true } }
          }
        },
        enrollments: {
          include: {
            student: {
              include: {
                user: {
                  select: {
                    name: true,
                    email: true
                  }
                }
              }
            }
          },
          orderBy: {
            student: { rollNumber: 'asc' }
          }
        },
        _count: {
          select: {
            assignments: true,
            materials: true,
            attendances: true,
            marks: true,
            enrollments: true
          }
        }
      }
    })

    if (!subject) {
      return result.withStatus(404, { message: 'Subject not found' })
    }

    result.ok({ subject })

  } catch (error) {
    throw error
  }
}

// ================================
// UPDATE SUBJECT
// ================================
/**
 * Handles update subject business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const updateSubject = async (context, result = createServiceResponder()) => {
  try {
    const { id } = context.params
    const { name, description, semester, department, instructorId } = context.body
    const normalizedDepartment = department?.trim() || null

    const subject = await prisma.subject.findUnique({ where: { id } })
    if (!subject) {
      return result.withStatus(404, { message: 'Subject not found' })
    }

    const departmentAliases = await ensureCoordinatorDepartmentScope(context, result, subject.department)
    if (context.user.role === 'COORDINATOR' && !departmentAliases) {
      return
    }

    if (normalizedDepartment) {
      const validDepartment = await ensureDepartmentExists(normalizedDepartment)
      if (!validDepartment) {
        return result.withStatus(400, { message: 'Please select a valid department' })
      }
    }

    if (context.user.role === 'COORDINATOR') {
      const nextDepartmentAliases = await ensureCoordinatorDepartmentScope(context, result, normalizedDepartment)
      if (!nextDepartmentAliases) {
        return
      }

      const instructorAllowed = await ensureCoordinatorInstructorScope(context, result, instructorId)
      if (!instructorAllowed) {
        return
      }
    }

    const updatedSubject = await prisma.subject.update({
      where: { id },
      data: { name, description, semester, department: normalizedDepartment, instructorId },
      include: subjectListInclude
    })

    await syncMatchingStudentsForSubject({
      subjectId: updatedSubject.id,
      semester: updatedSubject.semester,
      department: updatedSubject.department
    })

    result.ok({
      message: 'Subject updated successfully!',
      subject: updatedSubject
    })

  } catch (error) {
    throw error
  }
}

// ================================
// DELETE SUBJECT
// ================================
/**
 * Handles delete subject business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteSubject = async (context, result = createServiceResponder()) => {
  try {
    const { id } = context.params

    const subject = await prisma.subject.findUnique({ where: { id } })
    if (!subject) {
      return result.withStatus(404, { message: 'Subject not found' })
    }

    const departmentAllowed = await ensureCoordinatorDepartmentScope(context, result, subject.department)
    if (context.user.role === 'COORDINATOR' && !departmentAllowed) {
      return
    }

    const assignments = await prisma.assignment.findMany({
      where: { subjectId: id },
      select: { id: true }
    })

    const assignmentIds = assignments.map((assignment) => assignment.id)

    await prisma.$transaction([
      prisma.submission.deleteMany({
        where: {
          assignmentId: { in: assignmentIds }
        }
      }),
      prisma.assignment.deleteMany({
        where: { subjectId: id }
      }),
      prisma.attendance.deleteMany({
        where: { subjectId: id }
      }),
      prisma.mark.deleteMany({
        where: { subjectId: id }
      }),
      prisma.studyMaterial.deleteMany({
        where: { subjectId: id }
      }),
      prisma.routine.deleteMany({
        where: { subjectId: id }
      }),
      prisma.subjectEnrollment.deleteMany({
        where: { subjectId: id }
      }),
      prisma.subject.delete({
        where: { id }
      })
    ])

    result.ok({ message: 'Subject deleted successfully!' })

  } catch (error) {
    throw error
  }
}

// ================================
// ASSIGN INSTRUCTOR TO SUBJECT
// ================================
/**
 * Handles assign instructor business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const assignInstructor = async (context, result = createServiceResponder()) => {
  try {
    const { id } = context.params
    const { instructorId } = context.body

    const subject = await prisma.subject.findUnique({ where: { id } })
    if (!subject) {
      return result.withStatus(404, { message: 'Subject not found' })
    }

    const departmentAliases = await ensureCoordinatorDepartmentScope(context, result, subject.department)
    if (context.user.role === 'COORDINATOR' && !departmentAliases) {
      return
    }

    const instructorAllowed = await ensureCoordinatorInstructorScope(context, result, instructorId)
    if (!instructorAllowed) {
      return
    }

    const instructor = await prisma.instructor.findUnique({
      where: { id: instructorId }
    })
    if (!instructor) {
      return result.withStatus(404, { message: 'Instructor not found' })
    }

    const updatedSubject = await prisma.subject.update({
      where: { id },
      data: { instructorId },
      include: subjectListInclude
    })

    result.ok({
      message: 'Instructor assigned successfully!',
      subject: updatedSubject
    })

  } catch (error) {
    throw error
  }
}

// ================================
// GET SUBJECT ENROLLMENTS
// ================================
/**
 * Handles get subject enrollments business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getSubjectEnrollments = async (context, result = createServiceResponder()) => {
  try {
    const { id } = context.params

    if (context.user.role === 'INSTRUCTOR') {
      const allowedSubject = await prisma.subject.findFirst({
        where: {
          id,
          instructor: {
            is: {
              userId: context.user.id
            }
          }
        }
      })

      if (!allowedSubject) {
        return result.withStatus(403, { message: 'You can only view enrollments for your assigned subjects' })
      }
    }

    const subject = await prisma.subject.findUnique({
      where: { id },
      include: {
        instructor: {
          include: {
            user: { select: { name: true, email: true } }
          }
        },
        enrollments: {
          include: {
            student: {
              include: {
                user: {
                  select: {
                    name: true,
                    email: true
                  }
                }
              }
            }
          },
          orderBy: {
            student: { rollNumber: 'asc' }
          }
        }
      }
    })

    if (!subject) {
      return result.withStatus(404, { message: 'Subject not found' })
    }

    const departmentAllowed = await ensureCoordinatorDepartmentScope(context, result, subject.department)
    if (context.user.role === 'COORDINATOR' && !departmentAllowed) {
      return
    }

    const students = await getEnrollmentTargetStudents(subject)
    const enrollmentSet = new Set(subject.enrollments.map((entry) => entry.studentId))

    const studentOptions = students.map((student) => {
      const matchesSemester = student.semester === subject.semester
      const matchesDepartment = !subject.department || !student.department || student.department === subject.department

      return {
        id: student.id,
        name: student.user.name,
        email: student.user.email,
        rollNumber: student.rollNumber,
        semester: student.semester,
        section: student.section,
        department: student.department,
        enrolled: enrollmentSet.has(student.id),
        suggested: matchesSemester && matchesDepartment
      }
    })

    result.ok({
      subject,
      enrollments: subject.enrollments.map((entry) => ({
        id: entry.id,
        studentId: entry.studentId,
        student: {
          id: entry.student.id,
          name: entry.student.user.name,
          email: entry.student.user.email,
          rollNumber: entry.student.rollNumber,
          semester: entry.student.semester,
          section: entry.student.section,
          department: entry.student.department
        }
      })),
      students: studentOptions
    })
  } catch (error) {
    throw error
  }
}

// ================================
// UPDATE SUBJECT ENROLLMENTS
// ================================
/**
 * Handles update subject enrollments business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const updateSubjectEnrollments = async (context, result = createServiceResponder()) => {
  try {
    const { id } = context.params
    const { studentIds } = context.body

    if (!Array.isArray(studentIds)) {
      return result.withStatus(400, { message: 'studentIds must be an array' })
    }

    const subject = await prisma.subject.findUnique({ where: { id } })
    if (!subject) {
      return result.withStatus(404, { message: 'Subject not found' })
    }

    const departmentAllowed = await ensureCoordinatorDepartmentScope(context, result, subject.department)
    if (context.user.role === 'COORDINATOR' && !departmentAllowed) {
      return
    }

    const students = await prisma.student.findMany({
      where: {
        id: { in: studentIds }
      },
      select: { id: true }
    })

    if (students.length !== studentIds.length) {
      return result.withStatus(400, { message: 'One or more selected students were not found' })
    }

    await prisma.$transaction([
      prisma.subjectEnrollment.deleteMany({
        where: { subjectId: id }
      }),
      prisma.subjectEnrollment.createMany({
        data: studentIds.map((studentId) => ({
          subjectId: id,
          studentId
        })),
        skipDuplicates: true
      })
    ])

    const enrollmentCount = await prisma.subjectEnrollment.count({
      where: { subjectId: id }
    })

    result.ok({
      message: 'Subject enrollments updated successfully!',
      total: enrollmentCount
    })
  } catch (error) {
    throw error
  }
}

module.exports = {
  createSubject,
  getAllSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject,
  assignInstructor,
  getSubjectEnrollments,
  updateSubjectEnrollments
}


