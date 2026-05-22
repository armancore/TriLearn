const { createServiceResponder } = require('../utils/serviceResult')
const prisma = require('../utils/prisma')
const { recordAuditLog } = require('../utils/audit')
const { sanitizePlainText } = require('../utils/sanitize')

const isAdmin = (context) => context.user?.role === 'ADMIN'
const isCoordinator = (context) => context.user?.role === 'COORDINATOR'

const departmentsMatch = (left, right) => (
  String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()
)

const parseRecordDate = (date) => {
  const parsedDate = new Date(date)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

const createDisciplinaryRecord = async (context, result = createServiceResponder()) => {
  if (!isAdmin(context) && !isCoordinator(context)) {
    return result.withStatus(403, { message: 'You are not authorized to add disciplinary records.' })
  }

  const { studentId } = context.params
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      user: {
        deletedAt: null
      }
    },
    include: {
      user: { select: { id: true } }
    }
  })

  if (!student) {
    return result.withStatus(404, { message: 'Student not found.' })
  }

  if (isCoordinator(context) && !departmentsMatch(context.coordinator?.department, student.department)) {
    return result.withStatus(403, { message: 'You can only add disciplinary records for your own department.' })
  }

  const { type, severity, description, action, date } = context.body
  const parsedDate = parseRecordDate(date)
  if (!parsedDate) {
    return result.withStatus(400, { message: 'Please provide a valid date.' })
  }

  const record = await prisma.disciplinaryRecord.create({
    data: {
      studentId,
      recordedById: context.user.id,
      type,
      severity,
      description: sanitizePlainText(description),
      action: action === undefined ? undefined : sanitizePlainText(action) || undefined,
      date: parsedDate
    },
    include: {
      recordedBy: { select: { name: true, role: true } }
    }
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'DISCIPLINARY_RECORD_CREATED',
    entityType: 'DisciplinaryRecord',
    entityId: record.id
  })

  return result.withStatus(201, { message: 'Disciplinary record added.', record })
}

const updateDisciplinaryRecord = async (context, result = createServiceResponder()) => {
  if (!isAdmin(context)) {
    return result.withStatus(403, { message: 'Only admins can update disciplinary records.' })
  }

  const { studentId, recordId } = context.params
  const existingRecord = await prisma.disciplinaryRecord.findFirst({
    where: {
      id: recordId,
      studentId
    }
  })

  if (!existingRecord) {
    return result.withStatus(404, { message: 'Record not found.' })
  }

  const { type, severity, description, action, date } = context.body
  const data = {}

  if (type !== undefined) data.type = type
  if (severity !== undefined) data.severity = severity
  if (description !== undefined) data.description = sanitizePlainText(description)
  if (action !== undefined) data.action = sanitizePlainText(action)
  if (date !== undefined) {
    const parsedDate = parseRecordDate(date)
    if (!parsedDate) {
      return result.withStatus(400, { message: 'Please provide a valid date.' })
    }
    data.date = parsedDate
  }

  const record = await prisma.disciplinaryRecord.update({
    where: { id: recordId },
    data,
    include: {
      recordedBy: { select: { name: true, role: true } }
    }
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'DISCIPLINARY_RECORD_UPDATED',
    entityType: 'DisciplinaryRecord',
    entityId: record.id
  })

  return result.ok({ message: 'Record updated.', record })
}

const deleteDisciplinaryRecord = async (context, result = createServiceResponder()) => {
  if (!isAdmin(context)) {
    return result.withStatus(403, { message: 'Only admins can delete disciplinary records.' })
  }

  const { studentId, recordId } = context.params
  const existingRecord = await prisma.disciplinaryRecord.findFirst({
    where: {
      id: recordId,
      studentId
    }
  })

  if (!existingRecord) {
    return result.withStatus(404, { message: 'Record not found.' })
  }

  await prisma.disciplinaryRecord.delete({
    where: { id: recordId }
  })

  await recordAuditLog({
    actorId: context.user.id,
    actorRole: context.user.role,
    action: 'DISCIPLINARY_RECORD_DELETED',
    entityType: 'DisciplinaryRecord',
    entityId: recordId
  })

  return result.ok({ message: 'Record deleted.' })
}

module.exports = {
  createDisciplinaryRecord,
  updateDisciplinaryRecord,
  deleteDisciplinaryRecord
}
