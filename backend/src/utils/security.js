const crypto = require('crypto')
const bcrypt = require('bcryptjs')

const DEFAULT_BCRYPT_SALT_ROUNDS = 12
const MINIMUM_STRONG_PASSWORD_LENGTH = 12
const COMMON_WEAK_PASSWORD_TERMS = new Set([
  '000000',
  '111111',
  '112233',
  '121212',
  '123123',
  '123321',
  '123456',
  '1234567',
  'password',
  'password1',
  'password12',
  'password123',
  'passw0rd',
  'p@ssword',
  'qwerty',
  'qwerty1',
  'qwerty12',
  'qwerty123',
  'qwerty1234',
  'qwertyuiop',
  'asdfgh',
  'asdfghjkl',
  'zxcvbnm',
  'abc123',
  'abc1234',
  'abc@123',
  'abc@1234',
  'admin',
  'admin1',
  'admin123',
  'administrator',
  'letmein',
  'welcome',
  'welcome1',
  'welcome123',
  'changeme',
  'changeit',
  'defaultpassword',
  'default',
  'default123',
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  '987654321',
  'iloveyou',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'basketball',
  'princess',
  'sunshine',
  'superman',
  'batman',
  'trustno1',
  'master',
  'login',
  'freedom',
  'whatever',
  'secret',
  'secret1',
  'secret123',
  'summer',
  'summer1',
  'summer123',
  'winter',
  'winter1',
  'winter123',
  'spring',
  'spring1',
  'spring123',
  'autumn',
  'autumn1',
  'autumn123',
  'college',
  'college123',
  'school',
  'school123',
  'student',
  'student1',
  'student12',
  'student123',
  'teacher',
  'teacher123',
  'instructor',
  'instructor123',
  'trilearn',
  'trilearn123',
  'nepal',
  'nepal1',
  'nepal12',
  'nepal123',
  'nepal1234',
  'nepal@123',
  'kathmandu',
  'kathmandu123',
  'pokhara',
  'pokhara123',
  'everest',
  'everest123',
  'buddha',
  'buddha123'
])

const LEETSPEAK_REPLACEMENTS = new Map([
  ['@', 'a'],
  ['4', 'a'],
  ['$', 's'],
  ['5', 's'],
  ['0', 'o'],
  ['1', 'i'],
  ['!', 'i'],
  ['3', 'e'],
  ['7', 't']
])

const normalizePasswordCandidate = (value) => String(value || '')
  .normalize('NFKC')
  .trim()
  .toLowerCase()

const stripPasswordSeparators = (value) => value.replace(/[\s._\-()[\]{}:;'",<>?/\\|`~+=]+/g, '')

const replaceLeetspeak = (value) => Array.from(value, (character) => (
  LEETSPEAK_REPLACEMENTS.get(character) || character
)).join('')

const passwordVariants = (value) => {
  const normalized = normalizePasswordCandidate(value)
  const compact = stripPasswordSeparators(normalized)
  const leetNormalized = replaceLeetspeak(compact)

  return new Set([
    normalized,
    compact,
    normalized.replace(/[^a-z0-9]/g, ''),
    leetNormalized,
    leetNormalized.replace(/[^a-z0-9]/g, '')
  ])
}

const hasWeakRootWithCommonSuffix = (value) => {
  const withoutTrailingSymbols = value.replace(/[^a-z0-9]+$/g, '')
  const root = withoutTrailingSymbols.replace(/(?:19|20)?\d{2}$|(?:1234?|4321|111|000)$/g, '')

  return root.length >= 3 && COMMON_WEAK_PASSWORD_TERMS.has(root)
}

const isKnownWeakPassword = (value) => {
  for (const variant of passwordVariants(value)) {
    if (COMMON_WEAK_PASSWORD_TERMS.has(variant) || hasWeakRootWithCommonSuffix(variant)) {
      return true
    }
  }

  return false
}

const parseBcryptSaltRounds = (value) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 10 || parsed > 16) {
    return DEFAULT_BCRYPT_SALT_ROUNDS
  }

  return parsed
}

const getBcryptSaltRounds = () => {
  return parseBcryptSaltRounds(process.env.BCRYPT_ROUNDS)
}

const hashPassword = (password) => bcrypt.hash(password, getBcryptSaltRounds())

const getRequiredSecret = (envKey) => {
  const value = process.env[envKey]
  if (!value) {
    throw new Error(`Missing required secret: ${envKey}`)
  }

  return value
}

const generateTemporaryPassword = () => crypto.randomBytes(12).toString('base64url')

module.exports = {
  DEFAULT_BCRYPT_SALT_ROUNDS,
  MINIMUM_STRONG_PASSWORD_LENGTH,
  getBcryptSaltRounds,
  hashPassword,
  getRequiredSecret,
  generateTemporaryPassword,
  isKnownWeakPassword
}
