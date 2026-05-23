const { createServiceResponder } = require('../utils/serviceResult')
const prisma = require('../utils/prisma')

const serializeSubject = (subject) => ({
  id: subject.id,
  name: subject.name,
  code: subject.code,
  semester: subject.semester,
  department: subject.department
})

const getInstructorStudents = async (context, result = createServiceResponder()) => {
  if (!context.instructor) {
    return result.withStatus(403, { message: 'Instructor profile not found' })
  }

  const enrollments = await prisma.subjectEnrollment.findMany({
    where: {
      subject: {
        instructorId: context.instructor.id
      },
      student: {
        user: {
          isActive: true,
          deletedAt: null
        }
      }
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true,
          code: true,
          semester: true,
          department: true
        }
      },
      student: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      }
    },
    orderBy: [
      { student: { rollNumber: 'asc' } },
      { subject: { code: 'asc' } }
    ]
  })

  const subjectsById = new Map()
  const studentsById = new Map()

  enrollments.forEach(({ subject, student }) => {
    if (!subjectsById.has(subject.id)) {
      subjectsById.set(subject.id, serializeSubject(subject))
    }

    if (!studentsById.has(student.id)) {
      studentsById.set(student.id, {
        id: student.id,
        userId: student.user.id,
        name: student.user.name,
        email: student.user.email,
        rollNumber: student.rollNumber,
        semester: student.semester,
        section: student.section,
        department: student.department,
        subjects: []
      })
    }

    studentsById.get(student.id).subjects.push(serializeSubject(subject))
  })

  const subjects = Array.from(subjectsById.values()).sort((left, right) => (
    String(left.code || left.name || '').localeCompare(String(right.code || right.name || ''))
  ))

  const students = Array.from(studentsById.values()).sort((left, right) => (
    String(left.rollNumber || '').localeCompare(String(right.rollNumber || ''))
  ))

  return result.ok({
    total: students.length,
    subjects,
    students
  })
}

module.exports = {
  getInstructorStudents
}
