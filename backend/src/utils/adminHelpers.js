const { sanitizePlainText } = require('./sanitize')

const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

const sanitizeOptionalPlainText = (value) => (value == null ? value : sanitizePlainText(value))

const deleteStaleDeletedStudentAccounts = async (client, { emails = [], studentIds = [] } = {}) => {
  if (
    !client?.user ||
    typeof client.user.findMany !== 'function' ||
    typeof client.user.deleteMany !== 'function'
  ) {
    return 0
  }

  const normalizedEmails = [...new Set(emails.map(normalizeEmail).filter(Boolean))]
  const normalizedStudentIds = [...new Set(
    studentIds
      .map((studentId) => String(studentId || '').trim().toUpperCase())
      .filter(Boolean)
  )]

  if (normalizedEmails.length === 0 && normalizedStudentIds.length === 0) {
    return 0
  }

  const orFilters = []
  if (normalizedEmails.length > 0) {
    orFilters.push({ email: { in: normalizedEmails } })
  }
  if (normalizedStudentIds.length > 0) {
    orFilters.push({
      student: {
        is: {
          rollNumber: { in: normalizedStudentIds }
        }
      }
    })
  }

  const staleUsers = await client.user.findMany({
    where: {
      deletedAt: { not: null },
      OR: orFilters
    },
    select: { id: true }
  })

  if (staleUsers.length === 0) {
    return 0
  }

  const result = await client.user.deleteMany({
    where: {
      id: { in: staleUsers.map((user) => user.id) }
    }
  })

  return result.count || staleUsers.length
}

module.exports = {
  normalizeEmail,
  sanitizeOptionalPlainText,
  deleteStaleDeletedStudentAccounts
}
