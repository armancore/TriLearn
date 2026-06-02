const prisma = require('../../utils/prisma')
const { recordAuditLog } = require('../../utils/audit')
const { hashQrPayload } = require('./qr-payload.helpers')

const upsertPresentAttendanceForRoutines = async ({ student, routines, attendanceDate, qrData, actorRole, actorId }) => {
  const qrCodeHash = hashQrPayload(qrData)
  const existingAttendance = await prisma.attendance.findMany({
    where: {
      studentId: student.id,
      subjectId: { in: routines.map((routine) => routine.subjectId) },
      date: { gte: attendanceDate.start, lt: attendanceDate.end }
    }
  })

  const existingMap = new Map(existingAttendance.map((record) => [record.subjectId, record]))
  const routinesToMark = routines.filter((routine) => !existingMap.has(routine.subjectId))

  if (!routinesToMark.length) {
    return { error: { status: 400, message: 'Attendance has already been recorded for the applicable class entries.' } }
  }

  const records = await prisma.$transaction(
    routinesToMark.map((routine) => (
      prisma.attendance.upsert({
        where: {
          studentId_subjectId_date: {
            studentId: student.id,
            subjectId: routine.subjectId,
            date: attendanceDate.start
          }
        },
        update: {
          instructorId: routine.instructorId,
          status: 'PRESENT',
          qrCode: qrCodeHash
        },
        create: {
          studentId: student.id,
          subjectId: routine.subjectId,
          instructorId: routine.instructorId,
          status: 'PRESENT',
          qrCode: qrCodeHash,
          date: attendanceDate.start
        }
      })
    ))
  )

  await recordAuditLog({
    actorId,
    actorRole,
    action: 'STUDENT_ID_QR_ATTENDANCE_MARKED',
    entityType: 'Attendance',
    metadata: {
      studentId: student.id,
      subjectIds: records.map((record) => record.subjectId),
      date: attendanceDate.start
    }
  })

  return {
    records,
    markedSubjects: routinesToMark.map((routine) => ({
      id: routine.subjectId,
      name: routine.subject.name,
      code: routine.subject.code,
      startTime: routine.startTime,
      endTime: routine.endTime
    }))
  }
}

module.exports = {
  upsertPresentAttendanceForRoutines
}
