const { createServiceResponder } = require('../../utils/serviceResult')
const {
  prisma,
  hasAbsenceTicketDelegate,
  respondAttendanceTicketUnavailable
} = require('./shared.service')
const { createNotification } = require('../../utils/notifications')
const { getPagination } = require('../../utils/pagination')

/**
 * Handles get my absence tickets business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getMyAbsenceTickets = async (context, result = createServiceResponder()) => {
    const student = context.student
  if (!student) {
    return result.withStatus(403, { message: 'Student profile not found' })
  }

  if (!hasAbsenceTicketDelegate()) {
    return result.ok({ tickets: [], absencesWithoutTicket: [] })
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

  result.ok({ tickets, absencesWithoutTicket })
}

/**
 * Handles create absence ticket business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createAbsenceTicket = async (context, result = createServiceResponder()) => {
    const student = context.student
  if (!student) {
    return result.withStatus(403, { message: 'Student profile not found' })
  }

  if (!hasAbsenceTicketDelegate()) {
    return respondAttendanceTicketUnavailable(result)
  }

  const { attendanceId, reason } = context.body
  const attendance = await prisma.attendance.findFirst({
    where: {
      id: attendanceId,
      studentId: student.id,
      status: 'ABSENT'
    }
  })

  if (!attendance) {
    return result.withStatus(404, { message: 'Absent attendance record not found' })
  }

  const existingTicket = await prisma.absenceTicket.findUnique({ where: { attendanceId } })
  if (existingTicket) {
    return result.withStatus(400, { message: 'A ticket already exists for this absence.' })
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

  result.withStatus(201, { message: 'Absence ticket submitted successfully.', ticket })
}

/**
 * Handles get absence tickets for staff business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAbsenceTicketsForStaff = async (context, result = createServiceResponder()) => {
    if (!hasAbsenceTicketDelegate()) {
    return result.ok({ tickets: [] })
  }
  const { page, limit, skip } = getPagination(context.query)

  const where = {}
  if (context.user.role === 'INSTRUCTOR') {
    if (!context.instructor) return result.withStatus(403, { message: 'Instructor profile not found' })
    where.attendance = { instructorId: context.instructor.id }
  }

  if (context.user.role === 'COORDINATOR') {
    if (!context.coordinator?.department) return result.withStatus(403, { message: 'Coordinator department is not configured yet' })
    where.attendance = { student: { department: context.coordinator.department } }
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

  result.ok({ total, page, limit, tickets })
}

/**
 * Handles review absence ticket business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const reviewAbsenceTicket = async (context, result = createServiceResponder()) => {
    if (!hasAbsenceTicketDelegate()) {
    return respondAttendanceTicketUnavailable(result)
  }

  const { id } = context.params
  const { status, result: reviewResponse } = context.body
  const existing = await prisma.absenceTicket.findUnique({
    where: { id },
    include: {
      attendance: { include: { student: true } }
    }
  })

  if (!existing) return result.withStatus(404, { message: 'Absence ticket not found' })
  if (context.user.role === 'INSTRUCTOR' && existing.attendance.instructorId !== context.instructor?.id) {
    return result.withStatus(403, { message: 'You can only review tickets for your own classes' })
  }
  if (context.user.role === 'COORDINATOR' && existing.attendance.student.department !== context.coordinator?.department) {
    return result.withStatus(403, { message: 'You can only review tickets for your department' })
  }
  if (existing.status === 'APPROVED') return result.withStatus(409, { message: 'Approved requests are locked and cannot be edited.' })

  const ticket = await prisma.absenceTicket.update({
    where: { id },
    data: { status, result: reviewResponse, reviewedBy: context.user.id, reviewedAt: new Date() }
  })

  result.ok({ message: 'Absence ticket reviewed successfully.', ticket })

  await createNotification({
    userId: existing.attendance.student.userId,
    type: 'ABSENCE_TICKET_REVIEWED',
    title: `Absence ticket ${status.toLowerCase()}`,
    message: reviewResponse || `Your absence ticket has been ${status.toLowerCase()}.`,
    link: '/student/tickets',
    metadata: {
      ticketId: ticket.id,
      status,
      attendanceId: ticket.attendanceId
    },
    dedupeKey: `absence-ticket:${ticket.id}:${status}:${ticket.updatedAt?.toISOString?.() || new Date().toISOString()}`
  })
}

module.exports = { getMyAbsenceTickets, createAbsenceTicket, getAbsenceTicketsForStaff, reviewAbsenceTicket }
