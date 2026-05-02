const { prisma, getDayRange, normalizeSemesterList } = require('../../controllers/attendance/shared')
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
const getGateAttendanceSettings = async (req, response) => {
  try {
    const { dayOfWeek } = req.query
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

    response.json({
      windows: windows.map((window) => ({ ...window, allowedSemesters: normalizeSemesterList(window.allowedSemesters) })),
      holidays,
      scannedToday: scannedTodayRecords.length
    })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles create gate scan window business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createGateScanWindow = async (req, response) => {
  try {
    const { title, dayOfWeek, startTime, endTime, allowedSemesters, isActive = true } = req.body
    const normalizedSemesters = normalizeSemesterList(allowedSemesters)
    const conflict = await findConflictingGateWindow({ dayOfWeek, startTime, endTime, allowedSemesters: normalizedSemesters })
    if (conflict) return response.status(400).json({ message: 'This time window overlaps with another Student QR slot for one of the same semesters.' })

    const window = await prisma.gateScanWindow.create({
      data: { title: sanitizePlainText(title), dayOfWeek, startTime, endTime, allowedSemesters: normalizedSemesters, isActive }
    })

    response.status(201).json({
      message: 'Student QR window saved successfully.',
      window: { ...window, allowedSemesters: normalizeSemesterList(window.allowedSemesters) }
    })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles update gate scan window business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const updateGateScanWindow = async (req, response) => {
  try {
    const { id } = req.params
    const { title, dayOfWeek, startTime, endTime, allowedSemesters, isActive = true } = req.body
    const normalizedSemesters = normalizeSemesterList(allowedSemesters)

    const existing = await prisma.gateScanWindow.findUnique({ where: { id } })
    if (!existing) return response.status(404).json({ message: 'Student QR window not found' })

    const conflict = await findConflictingGateWindow({ id, dayOfWeek, startTime, endTime, allowedSemesters: normalizedSemesters })
    if (conflict) return response.status(400).json({ message: 'This time window overlaps with another Student QR slot for one of the same semesters.' })

    const sanitizedTitle = sanitizePlainText(title)

    const window = await prisma.gateScanWindow.update({
      where: { id },
      data: { title: sanitizedTitle, dayOfWeek, startTime, endTime, allowedSemesters: normalizedSemesters, isActive }
    })

    response.json({
      message: 'Student QR window updated successfully.',
      window: { ...window, allowedSemesters: normalizeSemesterList(window.allowedSemesters) }
    })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles delete gate scan window business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteGateScanWindow = async (req, response) => {
  try {
    const { id } = req.params
    const existing = await prisma.gateScanWindow.findUnique({ where: { id } })
    if (!existing) return response.status(404).json({ message: 'Student QR window not found' })
    await prisma.gateScanWindow.delete({ where: { id } })
    response.json({ message: 'Student QR window deleted successfully.' })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles create attendance holiday business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createAttendanceHoliday = async (req, response) => {
  try {
    const { date, title, description, isActive = true } = req.body
    const dayRange = getDayRange(date)
    if (!dayRange) return response.status(400).json({ message: 'Invalid holiday date' })

    const sanitizedTitle = sanitizePlainText(title)
    const sanitizedDescription = sanitizePlainText(description)

    const holiday = await prisma.attendanceHoliday.upsert({
      where: { date: dayRange.start },
      update: { title: sanitizedTitle, description: sanitizedDescription, isActive },
      create: { date: dayRange.start, title: sanitizedTitle, description: sanitizedDescription, isActive }
    })

    response.status(201).json({ message: 'Holiday saved successfully.', holiday })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles delete attendance holiday business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteAttendanceHoliday = async (req, response) => {
  try {
    const { id } = req.params
    const existing = await prisma.attendanceHoliday.findUnique({ where: { id } })
    if (!existing) return response.status(404).json({ message: 'Holiday not found' })
    await prisma.attendanceHoliday.delete({ where: { id } })
    response.json({ message: 'Holiday removed successfully.' })
  } catch (error) {
    response.internalError(error)
  }
}

module.exports = { getGateAttendanceSettings, createGateScanWindow, updateGateScanWindow, deleteGateScanWindow, createAttendanceHoliday, deleteAttendanceHoliday }
