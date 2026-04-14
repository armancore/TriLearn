const DOMPurify = require('isomorphic-dompurify')

const HTML_ENTITY_MAP = {
  amp: '&',
  apos: '\'',
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"'
}

const decodeHtmlEntities = (value) => value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
  const normalizedEntity = String(entity).toLowerCase()

  if (normalizedEntity in HTML_ENTITY_MAP) {
    return HTML_ENTITY_MAP[normalizedEntity]
  }

  if (normalizedEntity.startsWith('#x')) {
    const codePoint = Number.parseInt(normalizedEntity.slice(2), 16)
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
  }

  if (normalizedEntity.startsWith('#')) {
    const codePoint = Number.parseInt(normalizedEntity.slice(1), 10)
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
  }

  return match
})

const sanitizePlainText = (value) => {
  if (typeof value !== 'string') {
    return ''
  }

  const sanitized = DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  })

  return decodeHtmlEntities(sanitized)
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const sanitizeXlsxCell = (value) => {
  if (typeof value !== 'string') {
    return value
  }

  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

module.exports = {
  sanitizePlainText,
  sanitizeXlsxCell
}
