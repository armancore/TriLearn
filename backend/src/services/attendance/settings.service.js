/* eslint-disable no-useless-catch */
const { createServiceResponder } = require('../../utils/serviceResult')
const { prisma, getDayRange, normalizeSemesterList } = require('./shared.service')
const { sanitizePlainText } = require('../../utils/sanitize')

const findConflictingGateWindow = async ({ id, dayOfWeek, startTime, endTime, allowedSemesters }) => prisma.gateScanWindow.findFirst({
  where: {
    dayOfWeek,
    isActive: true,
    id: id ? { not: id } : undefined,
    allowedSemesters: { hasSome: normalizeSemesterList(allowedSemesters) },
    AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }]
  }
})

/**
 * Handles get gate attendance settings business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getGateAttendanceSettings = async (context, result = createServiceResponder()) => {
  try {
    const { dayOfWeek } = context.query
    const todayRange = getDayRange(new Date())
    const [windows, holidays, scannedTodayRecords] = await Promise.all([
      prisma.gateScanWindow.findMany({
        where: dayOfWeek ? { dayOfWeek } : undefined,
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
      }),
      prisma.attendanceHoliday.findMany({ orderBy: { date: 'asc' } }),
      todayRange
        ? prisma.attendance.groupBy({
          by: ['studentId'],
          where: {
            date: { gte: todayRange.start, lt: todayRange.end },
            status: 'PRESENT'
          }
        })
        : []
    ])

    result.ok({
      windows: windows.map((window) => ({ ...window, allowedSemesters: normalizeSemesterList(window.allowedSemesters) })),
      holidays,
      scannedToday: scannedTodayRecords.length
    })
  } catch (error) {
    throw error
  }
}

/**
 * Handles create gate scan window business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createGateScanWindow = async (context, result = createServiceResponder()) => {
  try {
    const { title, dayOfWeek, startTime, endTime, allowedSemesters, isActive = true } = context.body
    const normalizedSemesters = normalizeSemesterList(allowedSemesters)
    const conflict = await findConflictingGateWindow({ dayOfWeek, startTime, endTime, allowedSemesters: normalizedSemesters })
    if (conflict) return result.withStatus(400, { message: 'This time window overlaps with another Student QR slot for one of the same semesters.' })

    const window = await prisma.gateScanWindow.create({
      data: { title: sanitizePlainText(title), dayOfWeek, startTime, endTime, allowedSemesters: normalizedSemesters, isActive }
    })

    result.withStatus(201, {
      message: 'Student QR window saved successfully.',
      window: { ...window, allowedSemesters: normalizeSemesterList(window.allowedSemesters) }
    })
  } catch (error) {
    throw error
  }
}

/**
 * Handles update gate scan window business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const updateGateScanWindow = async (context, result = createServiceResponder()) => {
  try {
    const { id } = context.params
    const { title, dayOfWeek, startTime, endTime, allowedSemesters, isActive = true } = context.body
    const normalizedSemesters = normalizeSemesterList(allowedSemesters)

    const existing = await prisma.gateScanWindow.findUnique({ where: { id } })
    if (!existing) return result.withStatus(404, { message: 'Student QR window not found' })

    const conflict = await findConflictingGateWindow({ id, dayOfWeek, startTime, endTime, allowedSemesters: normalizedSemesters })
    if (conflict) return result.withStatus(400, { message: 'This time window overlaps with another Student QR slot for one of the same semesters.' })

    const sanitizedTitle = sanitizePlainText(title)

    const window = await prisma.gateScanWindow.update({
      where: { id },
      data: { title: sanitizedTitle, dayOfWeek, startTime, endTime, allowedSemesters: normalizedSemesters, isActive }
    })

    result.ok({
      message: 'Student QR window updated successfully.',
      window: { ...window, allowedSemesters: normalizeSemesterList(window.allowedSemesters) }
    })
  } catch (error) {
    throw error
  }
}

/**
 * Handles delete gate scan window business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteGateScanWindow = async (context, result = createServiceResponder()) => {
  try {
    const { id } = context.params
    const existing = await prisma.gateScanWindow.findUnique({ where: { id } })
    if (!existing) return result.withStatus(404, { message: 'Student QR window not found' })
    await prisma.gateScanWindow.delete({ where: { id } })
    result.ok({ message: 'Student QR window deleted successfully.' })
  } catch (error) {
    throw error
  }
}

/**
 * Handles create attendance holiday business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createAttendanceHoliday = async (context, result = createServiceResponder()) => {
  try {
    const { date, title, description, isActive = true } = context.body
    const dayRange = getDayRange(date)
    if (!dayRange) return result.withStatus(400, { message: 'Invalid holiday date' })

    const sanitizedTitle = sanitizePlainText(title)
    const sanitizedDescription = sanitizePlainText(description)

    const holiday = await prisma.attendanceHoliday.upsert({
      where: { date: dayRange.start },
      update: { title: sanitizedTitle, description: sanitizedDescription, isActive },
      create: { date: dayRange.start, title: sanitizedTitle, description: sanitizedDescription, isActive }
    })

    result.withStatus(201, { message: 'Holiday saved successfully.', holiday })
  } catch (error) {
    throw error
  }
}

/**
 * Handles delete attendance holiday business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteAttendanceHoliday = async (context, result = createServiceResponder()) => {
  try {
    const { id } = context.params
    const existing = await prisma.attendanceHoliday.findUnique({ where: { id } })
    if (!existing) return result.withStatus(404, { message: 'Holiday not found' })
    await prisma.attendanceHoliday.delete({ where: { id } })
    result.ok({ message: 'Holiday removed successfully.' })
  } catch (error) {
    throw error
  }
}

module.exports = { getGateAttendanceSettings, createGateScanWindow, updateGateScanWindow, deleteGateScanWindow, createAttendanceHoliday, deleteAttendanceHoliday }
