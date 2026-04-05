const { prisma, getDayRange, normalizeSemesterList } = require('./shared')
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

const getGateAttendanceSettings = async (req, res) => {
  try {
    const { dayOfWeek } = req.query
    const [windows, holidays] = await Promise.all([
      prisma.gateScanWindow.findMany({
        where: dayOfWeek ? { dayOfWeek } : undefined,
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
      }),
      prisma.attendanceHoliday.findMany({ orderBy: { date: 'asc' } })
    ])

    res.json({
      windows: windows.map((window) => ({ ...window, allowedSemesters: normalizeSemesterList(window.allowedSemesters) })),
      holidays
    })
  } catch (error) {
    res.internalError(error)
  }
}

const createGateScanWindow = async (req, res) => {
  try {
    const { title, dayOfWeek, startTime, endTime, allowedSemesters, isActive = true } = req.body
    const normalizedSemesters = normalizeSemesterList(allowedSemesters)
    const conflict = await findConflictingGateWindow({ dayOfWeek, startTime, endTime, allowedSemesters: normalizedSemesters })
    if (conflict) return res.status(400).json({ message: 'This time window overlaps with another Student QR slot for one of the same semesters.' })

    const sanitizedTitle = sanitizePlainText(title)

    const window = await prisma.gateScanWindow.create({
      data: { title, dayOfWeek, startTime, endTime, allowedSemesters: normalizedSemesters, isActive }
    })

    res.status(201).json({
      message: 'Student QR window saved successfully.',
      window: { ...window, allowedSemesters: normalizeSemesterList(window.allowedSemesters) }
    })
  } catch (error) {
    res.internalError(error)
  }
}

const updateGateScanWindow = async (req, res) => {
  try {
    const { id } = req.params
    const { title, dayOfWeek, startTime, endTime, allowedSemesters, isActive = true } = req.body
    const normalizedSemesters = normalizeSemesterList(allowedSemesters)

    const existing = await prisma.gateScanWindow.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Student QR window not found' })

    const conflict = await findConflictingGateWindow({ id, dayOfWeek, startTime, endTime, allowedSemesters: normalizedSemesters })
    if (conflict) return res.status(400).json({ message: 'This time window overlaps with another Student QR slot for one of the same semesters.' })

    const sanitizedTitle = sanitizePlainText(title)

    const window = await prisma.gateScanWindow.update({
      where: { id },
      data: { title: sanitizedTitle, dayOfWeek, startTime, endTime, allowedSemesters: normalizedSemesters, isActive }
    })

    res.json({
      message: 'Student QR window updated successfully.',
      window: { ...window, allowedSemesters: normalizeSemesterList(window.allowedSemesters) }
    })
  } catch (error) {
    res.internalError(error)
  }
}

const deleteGateScanWindow = async (req, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.gateScanWindow.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Student QR window not found' })
    await prisma.gateScanWindow.delete({ where: { id } })
    res.json({ message: 'Student QR window deleted successfully.' })
  } catch (error) {
    res.internalError(error)
  }
}

const createAttendanceHoliday = async (req, res) => {
  try {
    const { date, title, description, isActive = true } = req.body
    const dayRange = getDayRange(date)
    if (!dayRange) return res.status(400).json({ message: 'Invalid holiday date' })

    const sanitizedTitle = sanitizePlainText(title)
    const sanitizedDescription = sanitizePlainText(description)

    const holiday = await prisma.attendanceHoliday.upsert({
      where: { date: dayRange.start },
      update: { title: sanitizedTitle, description: sanitizedDescription, isActive },
      create: { date: dayRange.start, title: sanitizedTitle, description: sanitizedDescription, isActive }
    })

    res.status(201).json({ message: 'Holiday saved successfully.', holiday })
  } catch (error) {
    res.internalError(error)
  }
}

const deleteAttendanceHoliday = async (req, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.attendanceHoliday.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Holiday not found' })
    await prisma.attendanceHoliday.delete({ where: { id } })
    res.json({ message: 'Holiday removed successfully.' })
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = { getGateAttendanceSettings, createGateScanWindow, updateGateScanWindow, deleteGateScanWindow, createAttendanceHoliday, deleteAttendanceHoliday }
