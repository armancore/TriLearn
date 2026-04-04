const {
  prisma,
  hasAbsenceTicketDelegate,
  respondAttendanceTicketUnavailable
} = require('./shared')
const { createNotification } = require('../../utils/notifications')
const { getPagination } = require('../../utils/pagination')

const getMyAbsenceTickets = async (req, res) => {
  try {
    const student = req.student
    if (!student) {
      return res.status(403).json({ message: 'Student profile not found' })
    }

    if (!hasAbsenceTicketDelegate()) {
      return res.json({ tickets: [], absencesWithoutTicket: [] })
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

    res.json({ tickets, absencesWithoutTicket })
  } catch (error) {
    res.internalError(error)
  }
}

const createAbsenceTicket = async (req, res) => {
  try {
    const student = req.student
    if (!student) {
      return res.status(403).json({ message: 'Student profile not found' })
    }

    if (!hasAbsenceTicketDelegate()) {
      return respondAttendanceTicketUnavailable(res)
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
      return res.status(404).json({ message: 'Absent attendance record not found' })
    }

    const existingTicket = await prisma.absenceTicket.findUnique({ where: { attendanceId } })
    if (existingTicket) {
      return res.status(400).json({ message: 'A ticket already exists for this absence.' })
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

    res.status(201).json({ message: 'Absence ticket submitted successfully.', ticket })
  } catch (error) {
    res.internalError(error)
  }
}

const getAbsenceTicketsForStaff = async (req, res) => {
  try {
    if (!hasAbsenceTicketDelegate()) {
      return res.json({ tickets: [] })
    }
    const { page, limit, skip } = getPagination(req.query)

    const where = {}
    if (req.user.role === 'INSTRUCTOR') {
      if (!req.instructor) return res.status(403).json({ message: 'Instructor profile not found' })
      where.attendance = { instructorId: req.instructor.id }
    }

    if (req.user.role === 'COORDINATOR') {
      if (!req.coordinator?.department) return res.status(403).json({ message: 'Coordinator department is not configured yet' })
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

    res.json({ tickets, total, page, limit })
  } catch (error) {
    res.internalError(error)
  }
}

const reviewAbsenceTicket = async (req, res) => {
  try {
    if (!hasAbsenceTicketDelegate()) {
      return respondAttendanceTicketUnavailable(res)
    }

    const { id } = req.params
    const { status, response } = req.body
    const existing = await prisma.absenceTicket.findUnique({
      where: { id },
      include: {
        attendance: { include: { student: true } }
      }
    })

    if (!existing) return res.status(404).json({ message: 'Absence ticket not found' })
    if (req.user.role === 'INSTRUCTOR' && existing.attendance.instructorId !== req.instructor?.id) {
      return res.status(403).json({ message: 'You can only review tickets for your own classes' })
    }
    if (req.user.role === 'COORDINATOR' && existing.attendance.student.department !== req.coordinator?.department) {
      return res.status(403).json({ message: 'You can only review tickets for your department' })
    }
    if (existing.status === 'APPROVED') return res.status(409).json({ message: 'Approved requests are locked and cannot be edited.' })

    const ticket = await prisma.absenceTicket.update({
      where: { id },
      data: { status, response, reviewedBy: req.user.id, reviewedAt: new Date() }
    })

    res.json({ message: 'Absence ticket reviewed successfully.', ticket })

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
    res.internalError(error)
  }
}

module.exports = { getMyAbsenceTickets, createAbsenceTicket, getAbsenceTicketsForStaff, reviewAbsenceTicket }
