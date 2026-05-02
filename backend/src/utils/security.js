const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const logger = require('./logger')

const DEFAULT_BCRYPT_SALT_ROUNDS = 12
const MINIMUM_STRONG_PASSWORD_LENGTH = 12
const WEAK_DEFAULT_PASSWORDS = new Set([
  'password',
  'changeme',
  'defaultpassword',
  '12345678',
  'student123'
])

const isKnownWeakPassword = (value) => WEAK_DEFAULT_PASSWORDS.has(String(value || '').trim().toLowerCase())

const parseBcryptSaltRounds = (value) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 10 || parsed > 16) {
    return DEFAULT_BCRYPT_SALT_ROUNDS
  }

  return parsed
}

const getBcryptSaltRounds = () => {
  if (!process.env.BCRYPT_ROUNDS && process.env.BCRYPT_SALT_ROUNDS) {
    logger.warn('BCRYPT_SALT_ROUNDS is deprecated; rename it to BCRYPT_ROUNDS in your .env')
  }

  return parseBcryptSaltRounds(process.env.BCRYPT_ROUNDS || process.env.BCRYPT_SALT_ROUNDS)
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

const isStrongTemporaryPassword = (value) => {
  const password = String(value || '').trim()
  if (password.length < MINIMUM_STRONG_PASSWORD_LENGTH) {
    return false
  }

  return !isKnownWeakPassword(password)
}

const getStudentTemporaryPassword = () => {
  const configuredPassword = String(process.env.DEFAULT_STUDENT_PASSWORD || '').trim()
  if (isStrongTemporaryPassword(configuredPassword)) {
    return configuredPassword
  }

  return generateTemporaryPassword()
}

module.exports = {
  DEFAULT_BCRYPT_SALT_ROUNDS,
  MINIMUM_STRONG_PASSWORD_LENGTH,
  getBcryptSaltRounds,
  hashPassword,
  getRequiredSecret,
  generateTemporaryPassword,
  isKnownWeakPassword,
  isStrongTemporaryPassword,
  getStudentTemporaryPassword
}
