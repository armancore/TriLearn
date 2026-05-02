const {
  prisma,
  hasAbsenceTicketDelegate,
  respondAttendanceTicketUnavailable
} = require('../../controllers/attendance/shared')
const { createNotification } = require('../../utils/notifications')
const { getPagination } = require('../../utils/pagination')

/**
 * Handles get my absence tickets business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getMyAbsenceTickets = async (req, response) => {
  try {
    const student = req.student
    if (!student) {
      return response.status(403).json({ message: 'Student profile not found' })
    }

    if (!hasAbsenceTicketDelegate()) {
      return response.json({ tickets: [], absencesWithoutTicket: [] })
    }

    const [tickets, absencesWithoutTicket] = await Promise.all([
      prisma.absenceTicket.findMany({
        where: { studentId: student.id },
        include: {
          attendance: {
            include: {
              subject: { select: { id: true, name: true, code: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.attendance.findMany({
        where: {
          studentId: student.id,
          status: 'ABSENT',
          absenceTicket: {
            is: null
          }
        },
        include: {
          subject: { select: { id: true, name: true, code: true } }
        },
        orderBy: { date: 'desc' }
      })
    ])

    response.json({ tickets, absencesWithoutTicket })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles create absence ticket business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createAbsenceTicket = async (req, response) => {
  try {
    const student = req.student
    if (!student) {
      return response.status(403).json({ message: 'Student profile not found' })
    }

    if (!hasAbsenceTicketDelegate()) {
      return respondAttendanceTicketUnavailable(response)
    }

    const { attendanceId, reason } = req.body
    const attendance = await prisma.attendance.findFirst({
      where: {
        id: attendanceId,
        studentId: student.id,
        status: 'ABSENT'
      }
    })

    if (!attendance) {
      return response.status(404).json({ message: 'Absent attendance record not found' })
    }

    const existingTicket = await prisma.absenceTicket.findUnique({ where: { attendanceId } })
    if (existingTicket) {
      return response.status(400).json({ message: 'A ticket already exists for this absence.' })
    }

    const ticket = await prisma.absenceTicket.create({
      data: {
        attendanceId,
        studentId: student.id,
        reason
      },
      include: {
        attendance: {
          include: {
            subject: { select: { id: true, name: true, code: true } }
          }
        }
      }
    })

    response.status(201).json({ message: 'Absence ticket submitted successfully.', ticket })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles get absence tickets for staff business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAbsenceTicketsForStaff = async (req, response) => {
  try {
    if (!hasAbsenceTicketDelegate()) {
      return response.json({ tickets: [] })
    }
    const { page, limit, skip } = getPagination(req.query)

    const where = {}
    if (req.user.role === 'INSTRUCTOR') {
      if (!req.instructor) return response.status(403).json({ message: 'Instructor profile not found' })
      where.attendance = { instructorId: req.instructor.id }
    }

    if (req.user.role === 'COORDINATOR') {
      if (!req.coordinator?.department) return response.status(403).json({ message: 'Coordinator department is not configured yet' })
      where.attendance = { student: { department: req.coordinator.department } }
    }

    const [tickets, total] = await Promise.all([
      prisma.absenceTicket.findMany({
        where,
        include: {
          student: { include: { user: { select: { name: true, email: true } } } },
          attendance: { include: { subject: { select: { id: true, name: true, code: true } } } }
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit
      }),
      prisma.absenceTicket.count({ where })
    ])

    response.json({ total, page, limit, tickets })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles review absence ticket business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const reviewAbsenceTicket = async (req, response) => {
  try {
    if (!hasAbsenceTicketDelegate()) {
      return respondAttendanceTicketUnavailable(response)
    }

    const { id } = req.params
    const { status, response } = req.body
    const existing = await prisma.absenceTicket.findUnique({
      where: { id },
      include: {
        attendance: { include: { student: true } }
      }
    })

    if (!existing) return response.status(404).json({ message: 'Absence ticket not found' })
    if (req.user.role === 'INSTRUCTOR' && existing.attendance.instructorId !== req.instructor?.id) {
      return response.status(403).json({ message: 'You can only review tickets for your own classes' })
    }
    if (req.user.role === 'COORDINATOR' && existing.attendance.student.department !== req.coordinator?.department) {
      return response.status(403).json({ message: 'You can only review tickets for your department' })
    }
    if (existing.status === 'APPROVED') return response.status(409).json({ message: 'Approved requests are locked and cannot be edited.' })

    const ticket = await prisma.absenceTicket.update({
      where: { id },
      data: { status, response, reviewedBy: req.user.id, reviewedAt: new Date() }
    })

    response.json({ message: 'Absence ticket reviewed successfully.', ticket })

    await createNotification({
      userId: existing.attendance.student.userId,
      type: 'ABSENCE_TICKET_REVIEWED',
      title: `Absence ticket ${status.toLowerCase()}`,
      message: response || `Your absence ticket has been ${status.toLowerCase()}.`,
      link: '/student/tickets',
      metadata: {
        ticketId: ticket.id,
        status,
        attendanceId: ticket.attendanceId
      },
      dedupeKey: `absence-ticket:${ticket.id}:${status}:${ticket.updatedAt?.toISOString?.() || new Date().toISOString()}`
    })
  } catch (error) {
    response.internalError(error)
  }
}

module.exports = { getMyAbsenceTickets, createAbsenceTicket, getAbsenceTicketsForStaff, reviewAbsenceTicket }
