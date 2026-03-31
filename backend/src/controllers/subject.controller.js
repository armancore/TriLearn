const prisma = require('../utils/prisma')
const { ensureDepartmentExists } = require('./department.controller')

const buildSubjectVisibilityFilter = async (user, filters = {}) => {
  if (user.role === 'INSTRUCTOR') {
    const instructor = await prisma.instructor.findUnique({
      where: { userId: user.id }
    })

    return {
      ...filters,
      instructorId: instructor?.id || '__no_subjects__'
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

const getEnrollmentTargetStudents = async (subject) => prisma.student.findMany({
  where: {
    user: { isActive: true }
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
const createSubject = async (req, res) => {
  try {
    const { name, code, description, semester, department, instructorId } = req.body
    const normalizedDepartment = department?.trim() || null

    const existingSubject = await prisma.subject.findUnique({
      where: { code }
    })

    if (existingSubject) {
      return res.status(400).json({ message: 'Subject code already exists' })
    }

    if (normalizedDepartment) {
      const validDepartment = await ensureDepartmentExists(normalizedDepartment)
      if (!validDepartment) {
        return res.status(400).json({ message: 'Please select a valid department' })
      }
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

    const suggestedStudents = await prisma.student.findMany({
      where: {
        semester,
        ...(department ? { department } : {})
      },
      select: { id: true }
    })

    if (suggestedStudents.length > 0) {
      await prisma.subjectEnrollment.createMany({
        data: suggestedStudents.map((student) => ({
          subjectId: subject.id,
          studentId: student.id
        })),
        skipDuplicates: true
      })
    }

    res.status(201).json({
      message: 'Subject created successfully!',
      subject
    })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// GET ALL SUBJECTS
// ================================
const getAllSubjects = async (req, res) => {
  try {
    const { semester, department } = req.query

    const filters = {}
    if (semester) filters.semester = parseInt(semester)
    if (department) filters.department = department

    const visibleFilters = await buildSubjectVisibilityFilter(req.user, filters)

    const subjects = await prisma.subject.findMany({
      where: visibleFilters,
      include: subjectListInclude,
      orderBy: { createdAt: 'desc' }
    })

    res.json({ total: subjects.length, subjects })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// GET SUBJECT BY ID
// ================================
const getSubjectById = async (req, res) => {
  try {
    const { id } = req.params

    const visibleFilters = await buildSubjectVisibilityFilter(req.user, { id })

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
      return res.status(404).json({ message: 'Subject not found' })
    }

    res.json({ subject })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// UPDATE SUBJECT
// ================================
const updateSubject = async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, semester, department, instructorId } = req.body
    const normalizedDepartment = department?.trim() || null

    const subject = await prisma.subject.findUnique({ where: { id } })
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' })
    }

    if (normalizedDepartment) {
      const validDepartment = await ensureDepartmentExists(normalizedDepartment)
      if (!validDepartment) {
        return res.status(400).json({ message: 'Please select a valid department' })
      }
    }

    const updatedSubject = await prisma.subject.update({
      where: { id },
      data: { name, description, semester, department: normalizedDepartment, instructorId },
      include: subjectListInclude
    })

    res.json({
      message: 'Subject updated successfully!',
      subject: updatedSubject
    })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// DELETE SUBJECT
// ================================
const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params

    const subject = await prisma.subject.findUnique({ where: { id } })
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' })
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

    res.json({ message: 'Subject deleted successfully!' })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// ASSIGN INSTRUCTOR TO SUBJECT
// ================================
const assignInstructor = async (req, res) => {
  try {
    const { id } = req.params
    const { instructorId } = req.body

    const subject = await prisma.subject.findUnique({ where: { id } })
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' })
    }

    const instructor = await prisma.instructor.findUnique({
      where: { id: instructorId }
    })
    if (!instructor) {
      return res.status(404).json({ message: 'Instructor not found' })
    }

    const updatedSubject = await prisma.subject.update({
      where: { id },
      data: { instructorId },
      include: subjectListInclude
    })

    res.json({
      message: 'Instructor assigned successfully!',
      subject: updatedSubject
    })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// GET SUBJECT ENROLLMENTS
// ================================
const getSubjectEnrollments = async (req, res) => {
  try {
    const { id } = req.params

    if (req.user.role === 'INSTRUCTOR') {
      const instructor = await prisma.instructor.findUnique({
        where: { userId: req.user.id }
      })

      const allowedSubject = await prisma.subject.findFirst({
        where: {
          id,
          instructorId: instructor?.id || '__no_subject__'
        }
      })

      if (!allowedSubject) {
        return res.status(403).json({ message: 'You can only view enrollments for your assigned subjects' })
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
      return res.status(404).json({ message: 'Subject not found' })
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

    res.json({
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
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

// ================================
// UPDATE SUBJECT ENROLLMENTS
// ================================
const updateSubjectEnrollments = async (req, res) => {
  try {
    const { id } = req.params
    const { studentIds } = req.body

    if (!Array.isArray(studentIds)) {
      return res.status(400).json({ message: 'studentIds must be an array' })
    }

    const subject = await prisma.subject.findUnique({ where: { id } })
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' })
    }

    const students = await prisma.student.findMany({
      where: {
        id: { in: studentIds }
      },
      select: { id: true }
    })

    if (students.length !== studentIds.length) {
      return res.status(400).json({ message: 'One or more selected students were not found' })
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

    res.json({
      message: 'Subject enrollments updated successfully!',
      total: enrollmentCount
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
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
