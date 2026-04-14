const test = require('node:test')
const assert = require('node:assert/strict')

const { sanitizePlainText, sanitizeXlsxCell } = require('../src/utils/sanitize')

test('sanitizePlainText strips html and control characters', () => {
  const input = '<p>Hello&nbsp;<strong>World</strong></p>\u0007'

  assert.equal(sanitizePlainText(input), 'Hello World')
})

test('sanitizePlainText removes dangerous HTML while preserving plain text content', () => {
  const input = '<svg><g onload=alert(1)></g></svg><p>Safe &amp; sound</p>'

  assert.equal(sanitizePlainText(input), 'Safe & sound')
})

test('sanitizePlainText collapses whitespace while preserving paragraph breaks', () => {
  const input = 'First line   \n\n\nSecond\t\tline'

  assert.equal(sanitizePlainText(input), 'First line\n\nSecond line')
})

test('sanitizePlainText returns an empty string for non-strings', () => {
  assert.equal(sanitizePlainText(null), '')
  assert.equal(sanitizePlainText(undefined), '')
  assert.equal(sanitizePlainText(42), '')
})

test('sanitizeXlsxCell neutralizes leading formula characters in strings', () => {
  assert.equal(sanitizeXlsxCell('=SUM(A1:A3)'), '\'=SUM(A1:A3)')
  assert.equal(sanitizeXlsxCell('+cmd'), '\'+cmd')
  assert.equal(sanitizeXlsxCell('-2+3'), '\'-2+3')
  assert.equal(sanitizeXlsxCell('@evil'), '\'@evil')
  assert.equal(sanitizeXlsxCell('\tHIDDEN'), '\'\tHIDDEN')
  assert.equal(sanitizeXlsxCell('\rCARRIAGE'), '\'\rCARRIAGE')
})

test('sanitizeXlsxCell leaves safe values unchanged', () => {
  assert.equal(sanitizeXlsxCell('Student User'), 'Student User')
  assert.equal(sanitizeXlsxCell(42), 42)
  assert.equal(sanitizeXlsxCell(null), null)
})
