const logger = require('../../utils/logger')

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const DEFAULT_ATTENDANCE_TIMEZONE = 'Asia/Kathmandu'
const formatterCache = new Map()
let attendanceTimezoneWarningLogged = false

const getAttendanceTimezone = () => {
  const configuredTimezone = process.env.ATTENDANCE_TIMEZONE || process.env.TZ

  if (configuredTimezone) {
    return configuredTimezone
  }

  if (!attendanceTimezoneWarningLogged) {
    logger.warn('ATTENDANCE_TIMEZONE and TZ are not set. Falling back to Asia/Kathmandu; configure ATTENDANCE_TIMEZONE to the institution IANA timezone before production use.')
    attendanceTimezoneWarningLogged = true
  }

  return DEFAULT_ATTENDANCE_TIMEZONE
}

const getFormatter = (cacheKey, options) => {
  if (!formatterCache.has(cacheKey)) {
    formatterCache.set(cacheKey, new Intl.DateTimeFormat('en-US', options))
  }

  return formatterCache.get(cacheKey)
}

const parseDateOnly = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return null
  }

  return {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10)
  }
}

const getZonedDateParts = (dateValue, timeZone) => {
  const formatter = getFormatter(`date:${timeZone}`, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const parts = formatter.formatToParts(dateValue)

  return {
    year: Number.parseInt(parts.find((part) => part.type === 'year')?.value || '', 10),
    month: Number.parseInt(parts.find((part) => part.type === 'month')?.value || '', 10),
    day: Number.parseInt(parts.find((part) => part.type === 'day')?.value || '', 10)
  }
}

const parseOffsetMinutes = (offsetValue) => {
  if (offsetValue === 'GMT' || offsetValue === 'UTC') {
    return 0
  }

  const match = offsetValue.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) {
    return 0
  }

  const sign = match[1] === '-' ? -1 : 1
  const hours = Number.parseInt(match[2], 10)
  const minutes = Number.parseInt(match[3] || '0', 10)
  return sign * ((hours * 60) + minutes)
}

const getTimeZoneOffsetMs = (dateValue, timeZone) => {
  const formatter = getFormatter(`offset:${timeZone}`, {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit'
  })
  const offsetValue = formatter
    .formatToParts(dateValue)
    .find((part) => part.type === 'timeZoneName')?.value || 'GMT'

  return parseOffsetMinutes(offsetValue) * 60 * 1000
}

const createZonedDate = (year, month, day, hours = 0, minutes = 0, seconds = 0, milliseconds = 0, timeZone = getAttendanceTimezone()) => {
  const utcGuess = Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds)
  const firstOffset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone)
  let zonedDate = new Date(utcGuess - firstOffset)
  const correctedOffset = getTimeZoneOffsetMs(zonedDate, timeZone)

  if (correctedOffset !== firstOffset) {
    zonedDate = new Date(utcGuess - correctedOffset)
  }

  return zonedDate
}

const getDayRange = (dateValue) => {
  const timeZone = getAttendanceTimezone()
  const parsedDateOnly = parseDateOnly(dateValue)
  const baseDate = parsedDateOnly ? null : (dateValue ? new Date(dateValue) : new Date())

  if (!parsedDateOnly && Number.isNaN(baseDate.getTime())) {
    return null
  }

  const { year, month, day } = parsedDateOnly || getZonedDateParts(baseDate, timeZone)
  const start = createZonedDate(year, month, day, 0, 0, 0, 0, timeZone)
  const nextUtcDate = new Date(Date.UTC(year, month - 1, day + 1))
  const end = createZonedDate(
    nextUtcDate.getUTCFullYear(),
    nextUtcDate.getUTCMonth() + 1,
    nextUtcDate.getUTCDate(),
    0,
    0,
    0,
    0,
    timeZone
  )

  return { start, end }
}

const getMonthRange = (monthValue) => {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) {
    return null
  }

  const [year, month] = monthValue.split('-').map((value) => parseInt(value, 10))
  const timeZone = getAttendanceTimezone()
  const start = createZonedDate(year, month, 1, 0, 0, 0, 0, timeZone)

  if (Number.isNaN(start.getTime())) {
    return null
  }

  const end = month === 12
    ? createZonedDate(year + 1, 1, 1, 0, 0, 0, 0, timeZone)
    : createZonedDate(year, month + 1, 1, 0, 0, 0, 0, timeZone)

  return { start, end }
}

const getCurrentDayName = (date = new Date()) => {
  const timezone = getAttendanceTimezone()
  const formatter = getFormatter(`weekday:${timezone}`, {
    timeZone: timezone,
    weekday: 'long'
  })
  const weekday = formatter.format(date).toUpperCase()
  return DAYS.includes(weekday) ? weekday : DAYS[date.getUTCDay()]
}

const buildDateWithTime = (baseDate, timeValue) => {
  const [hours, minutes] = timeValue.split(':').map((value) => parseInt(value, 10))
  const timezone = getAttendanceTimezone()
  const { year, month, day } = getZonedDateParts(baseDate, timezone)
  return createZonedDate(year, month, day, hours, minutes, 0, 0, timezone)
}

const formatDisplayDate = (dateValue) => {
  const timezone = getAttendanceTimezone()
  const formatter = getFormatter(`display:${timezone}`, {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  return formatter.format(new Date(dateValue))
}

const formatMonthLabel = (monthValue) => {
  const range = getMonthRange(monthValue)
  if (!range) return monthValue
  return range.start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: getAttendanceTimezone() })
}

module.exports = {
  getAttendanceTimezone,
  getDayRange,
  getMonthRange,
  getCurrentDayName,
  buildDateWithTime,
  createZonedDate,
  formatDisplayDate,
  formatMonthLabel
}
