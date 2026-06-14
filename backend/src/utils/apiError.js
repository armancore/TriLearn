const ERROR_CODES = Object.freeze({
  DATABASE_BUSY: 'DATABASE_BUSY',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  REQUEST_FAILED: 'REQUEST_FAILED'
})

const normalizeErrorCode = (code, fallback = ERROR_CODES.REQUEST_FAILED) => {
  const normalizedCode = String(code || '').trim().toUpperCase()
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(normalizedCode) ? normalizedCode : fallback
}

const createErrorResponse = ({ code, message }) => ({
  code: normalizeErrorCode(code),
  message
})

module.exports = {
  ERROR_CODES,
  createErrorResponse,
  normalizeErrorCode
}
