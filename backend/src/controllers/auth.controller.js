const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const QRCode = require('qrcode')
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')
const { recordAuditLog } = require('../utils/audit')
const { buildUploadedFileUrl } = require('../utils/fileStorage')
const { removeUploadedFile } = require('../middleware/upload.middleware')
const { sendMail } = require('../utils/mailer')
const { passwordResetTemplate } = require('../utils/emailTemplates')
const {
  createEmailVerificationToken,
  hashEmailVerificationToken,
  sendEmailVerificationEmail
} = require('../utils/emailVerification')
const { hashPassword } = require('../utils/security')
const { signQrPayload } = require('../utils/qrSigning')
const { sanitizePlainText } = require('../utils/sanitize')
const { schemas } = require('../validators/schemas')
const { getInstructorDepartments } = require('../utils/instructorDepartments')
const { ZodError } = require('zod')
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  getRefreshTokenExpiry,
  getRefreshCookieOptions
} = require('../utils/token')

const buildAuthUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatar: user.avatar || null,
  role: user.role,
  emailVerified: !!user.emailVerified,
  mustChangePassword: !!user.mustChangePassword,
  profileCompleted: !!user.profileCompleted,
  ...(user.student ? { student: user.student } : {}),
  ...(user.instructor ? (() => {
    const instructor = { ...user.instructor }
    delete instructor.departmentMemberships

    return {
      instructor: {
        ...instructor,
        departments: getInstructorDepartments(user.instructor)
      }
    }
  })() : {}),
  ...(user.coordinator ? { coordinator: user.coordinator } : {})
})

const isMobileClient = (req) => String(req.get('x-client-type') || '').toLowerCase() === 'mobile'
const isPasswordResetEnabled = () => process.env.ENABLE_PASSWORD_RESET === 'true'
const MAX_FAILED_LOGIN_ATTEMPTS = 5
const LOGIN_LOCKOUT_MINUTES = 15
const STUDENT_ID_QR_VALIDITY_HOURS = 24
const LOGOUT_MIN_RESPONSE_MS = 75
const STUDENT_INTAKE_MIN_RESPONSE_MS = 75
const LOGIN_MIN_RESPONSE_MS = 75
const FORGOT_PASSWORD_MIN_RESPONSE_MS = 75
const LOGIN_CAPTCHA_THRESHOLD = 3
const LOGIN_CAPTCHA_TTL_MS = 5 * 60 * 1000
const GENERIC_ELIGIBILITY_MESSAGE = 'If this email is eligible, you will receive further instructions.'
const GENERIC_DISABLED_ACCOUNT_MESSAGE = 'Your account has been disabled. Please contact the administration.'
const GENERIC_FORGOT_PASSWORD_MESSAGE = 'If an account with that email exists, a reset link has been sent.'
const DUMMY_PASSWORD_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

const getRequestUserAgent = (req) => String(req.get('user-agent') || '').slice(0, 255) || null

const getRequestIpAddress = (req) => {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64) || null
}

const waitForMinimumDuration = async (startedAt, minDurationMs) => {
  const elapsed = Date.now() - startedAt
  if (elapsed >= minDurationMs) {
    return
  }

  await new Promise((resolve) => {
    setTimeout(resolve, minDurationMs - elapsed)
  })
}

const respondGenericEligibility = async (res, startedAt) => {
  await waitForMinimumDuration(startedAt, STUDENT_INTAKE_MIN_RESPONSE_MS)
  return res.status(200).json({ message: GENERIC_ELIGIBILITY_MESSAGE })
}

const sanitizeOptionalPlainText = (value) => (value == null ? value : sanitizePlainText(value))
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

const userRoleSelect = {
  student: {
    select: {
      id: true,
      rollNumber: true,
      semester: true,
      section: true,
      department: true
    }
  },
  instructor: {
    select: {
      id: true,
      department: true,
      departmentMemberships: {
        include: {
          department: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  },
  coordinator: {
    select: {
      id: true,
      department: true
    }
  }
}

const getUserSelect = ({ includeProfileDetails = false } = {}) => ({
  id: true,
  name: true,
  email: true,
  role: true,
  avatar: true,
  isActive: true,
  emailVerified: true,
  mustChangePassword: true,
  profileCompleted: true,
  ...(includeProfileDetails
    ? {
      phone: true,
      address: true,
      createdAt: true,
      student: {
        select: {
          ...userRoleSelect.student.select,
          fatherName: true,
          motherName: true,
          fatherPhone: true,
          motherPhone: true,
          bloodGroup: true,
          localGuardianName: true,
          localGuardianAddress: true,
          localGuardianPhone: true,
          permanentAddress: true,
          temporaryAddress: true,
          dateOfBirth: true
        }
      }
    }
    : userRoleSelect),
  instructor: userRoleSelect.instructor,
  coordinator: userRoleSelect.coordinator
})

const refreshUserSelect = getUserSelect()
const loginUserSelect = {
  id: true,
  email: true,
  password: true,
  role: true,
  isActive: true,
  emailVerified: true,
  mustChangePassword: true,
  profileCompleted: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  deletedAt: true
}

let loginCaptchaSecretWarningShown = false
const getLoginCaptchaSecret = () => {
  const captchaSecret = String(process.env.LOGIN_CAPTCHA_SECRET || '').trim()
  if (captchaSecret) {
    return captchaSecret
  }

  const jwtSecret = String(process.env.JWT_SECRET || '').trim()
  if (jwtSecret) {
    if (!loginCaptchaSecretWarningShown) {
      loginCaptchaSecretWarningShown = true
      logger.warn('LOGIN_CAPTCHA_SECRET is not set; falling back to JWT_SECRET for login captcha signing')
    }
    return jwtSecret
  }

  if (!loginCaptchaSecretWarningShown) {
    loginCaptchaSecretWarningShown = true
    logger.error('Unable to initialize login captcha signing secret because both LOGIN_CAPTCHA_SECRET and JWT_SECRET are missing')
  }

  return null
}

const signLoginCaptchaPayload = (payload) => {
  const captchaSecret = getLoginCaptchaSecret()
  if (!captchaSecret) {
    return null
  }

  const encodedPayload = Buffer
    .from(JSON.stringify(payload), 'utf8')
    .toString('base64url')

  const signature = crypto
    .createHmac('sha256', captchaSecret)
    .update(encodedPayload)
    .digest('base64url')

  return `${encodedPayload}.${signature}`
}

const createLoginCaptchaChallenge = (email) => {
  const left = crypto.randomInt(1, 10)
  const right = crypto.randomInt(1, 10)
  const nonce = crypto.randomUUID()
  const answer = String(left + right)
  const payload = {
    email: normalizeEmail(email),
    nonce,
    answerHash: hashToken(`${nonce}:${answer}`),
    exp: Date.now() + LOGIN_CAPTCHA_TTL_MS
  }
  const token = signLoginCaptchaPayload(payload)
  if (!token) {
    return null
  }

  return {
    prompt: `What is ${left} + ${right}?`,
    token
  }
}

const validateLoginCaptcha = ({ email, captchaToken, captchaAnswer }) => {
  const captchaSecret = getLoginCaptchaSecret()
  if (!captchaSecret) {
    return false
  }

  if (!captchaToken || !captchaAnswer) {
    return false
  }

  const [encodedPayload, providedSignature] = String(captchaToken).split('.')
  if (!encodedPayload || !providedSignature) {
    return false
  }

  const expectedSignature = crypto
    .createHmac('sha256', captchaSecret)
    .update(encodedPayload)
    .digest('base64url')

  try {
    if (!crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))) {
      return false
    }
  } catch {
    return false
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    return false
  }

  if (!payload || payload.exp <= Date.now() || payload.email !== normalizeEmail(email)) {
    return false
  }

  const submittedAnswer = String(captchaAnswer).trim()
  return hashToken(`${payload.nonce}:${submittedAnswer}`) === payload.answerHash
}

const shouldRequireLoginCaptcha = (user) => (user?.failedLoginAttempts || 0) >= LOGIN_CAPTCHA_THRESHOLD

const buildLoginCaptchaResponse = (email) => {
  const captchaChallenge = createLoginCaptchaChallenge(email)
  if (!captchaChallenge) {
    return {
      message: 'Please complete the security check to continue.',
      requiresCaptcha: false
    }
  }

  return {
    message: 'Please complete the security check to continue.',
    requiresCaptcha: true,
    captchaChallenge
  }
}

const issueAuthSession = async (user, res, req, previousRefreshToken, { setRefreshCookie = true } = {}) => {
  const accessToken = signAccessToken(user)
  const refreshToken = signRefreshToken(user)
  const requestMeta = {
    ipAddress: getRequestIpAddress(req),
    userAgent: getRequestUserAgent(req),
    lastUsedAt: new Date()
  }

  await prisma.$transaction(async (tx) => {
    if (previousRefreshToken) {
      await tx.refreshToken.updateMany({
        where: {
          tokenHash: hashToken(previousRefreshToken),
          revokedAt: null
        },
        data: { revokedAt: new Date() }
      })
    }

    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: getRefreshTokenExpiry(),
        ...requestMeta
      }
    })
  })

  if (setRefreshCookie) {
    res.cookie('refreshToken', refreshToken, getRefreshCookieOptions(req))
  }

  return {
    accessToken,
    refreshToken
  }
}

const getResetTokenExpiry = () => {
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + 30)
  return expiresAt
}

const getStudentIdQrExpiry = () => {
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + STUDENT_ID_QR_VALIDITY_HOURS)
  return expiresAt
}

const getLoginLockoutExpiry = () => {
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + LOGIN_LOCKOUT_MINUTES)
  return expiresAt
}

const getProfileSelect = () => getUserSelect({ includeProfileDetails: true })

// ================================
// REGISTER
// ================================
const register = (_req, res) => res.status(403).json({
  message: 'Self-registration is disabled. Please apply through the student intake form.'
})

const submitStudentIntake = async (req, res) => {
  const startedAt = Date.now()

  try {
    const parsedBody = schemas.auth.studentIntake.body.parse(req.body)
    const {
      fullName,
      email,
      phone,
      fatherName,
      motherName,
      fatherPhone,
      motherPhone,
      bloodGroup,
      localGuardianName,
      localGuardianAddress,
      localGuardianPhone,
      permanentAddress,
      temporaryAddress,
      dateOfBirth,
      preferredDepartment
    } = parsedBody

    const normalizedEmail = normalizeEmail(email)
    const sanitizedApplication = {
      fullName: sanitizePlainText(fullName),
      phone: sanitizePlainText(phone),
      fatherName: sanitizePlainText(fatherName),
      motherName: sanitizePlainText(motherName),
      fatherPhone: sanitizePlainText(fatherPhone),
      motherPhone: sanitizePlainText(motherPhone),
      bloodGroup: sanitizeOptionalPlainText(bloodGroup),
      localGuardianName: sanitizePlainText(localGuardianName),
      localGuardianAddress: sanitizePlainText(localGuardianAddress),
      localGuardianPhone: sanitizePlainText(localGuardianPhone),
      permanentAddress: sanitizePlainText(permanentAddress),
      temporaryAddress: sanitizePlainText(temporaryAddress),
      preferredDepartment: sanitizePlainText(preferredDepartment)
    }

    const existingApplication = await prisma.studentApplication.findUnique({ where: { email: normalizedEmail } })

    if (existingApplication && !['CONVERTED', 'REVIEWED'].includes(existingApplication.status)) {
      return respondGenericEligibility(res, startedAt)
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })

    if (existingUser) {
      return respondGenericEligibility(res, startedAt)
    }

    await prisma.studentApplication.upsert({
      where: { email: normalizedEmail },
      update: {
        ...sanitizedApplication,
        dateOfBirth,
        preferredSemester: 1,
        preferredSection: null,
        status: 'PENDING',
        reviewedAt: null,
        reviewedBy: null,
        linkedUserId: null
      },
      create: {
        ...sanitizedApplication,
        email: normalizedEmail,
        dateOfBirth,
        preferredSemester: 1,
        preferredSection: null
      }
    })

    return respondGenericEligibility(res, startedAt)
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: error.flatten()
      })
    }

    res.internalError(error)
  }
}

// ================================
// LOGIN
// ================================
const login = async (req, res) => {
  const startedAt = Date.now()

  try {
    const { email: rawEmail, password, captchaToken, captchaAnswer } = req.body
    const email = normalizeEmail(rawEmail)

    const user = await prisma.user.findUnique({
      where: { email },
      select: loginUserSelect
    })

    const passwordHash = user?.password || DUMMY_PASSWORD_HASH
    const isPasswordValid = await bcrypt.compare(password, passwordHash)

    if (!user) {
      await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (user.deletedAt) {
      await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000))
      await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)
      return res.status(401).json({
        message: 'Invalid credentials',
        retryAfter: retryAfterSeconds
      })
    }

    const requiresLoginCaptcha = shouldRequireLoginCaptcha(user)
    const hasValidLoginCaptcha = !requiresLoginCaptcha || validateLoginCaptcha({ email, captchaToken, captchaAnswer })

    // Always enforce captcha once threshold is reached to avoid password-oracle responses.
    if (requiresLoginCaptcha && !hasValidLoginCaptcha) {
      await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)
      return res.status(401).json(buildLoginCaptchaResponse(email))
    }

    if (!isPasswordValid) {
      const failedLoginAttempts = (user.failedLoginAttempts || 0) + 1
      const shouldLockAccount = failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts,
          lockedUntil: shouldLockAccount ? getLoginLockoutExpiry() : null
        }
      })

      await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)

      if (failedLoginAttempts >= LOGIN_CAPTCHA_THRESHOLD && !shouldLockAccount) {
        return res.status(401).json(buildLoginCaptchaResponse(email))
      }

      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (!user.isActive) {
      logger.warn('Suspended user login blocked', {
        userId: user.id,
        email: user.email
      })

      await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)
      return res.status(403).json({
        message: GENERIC_DISABLED_ACCOUNT_MESSAGE
      })
    }

    if (user.failedLoginAttempts || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null
        }
      })
    }

    const session = await issueAuthSession(user, res, req)
    const authUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: getProfileSelect()
    })

    await recordAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: 'AUTH_LOGIN',
      entityType: 'AuthSession',
      metadata: {
        ipAddress: getRequestIpAddress(req),
        userAgent: getRequestUserAgent(req)
      }
    })

    await waitForMinimumDuration(startedAt, LOGIN_MIN_RESPONSE_MS)
    const responseBody = {
      message: user.mustChangePassword
        ? 'Login successful. Please change your password to continue.'
        : 'Login successful!',
      token: session.accessToken,
      accessToken: session.accessToken,
      user: buildAuthUser(authUser || user)
    }

    if (isMobileClient(req)) {
      responseBody.refreshToken = session.refreshToken
    }

    res.json(responseBody)
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// GET CURRENT USER
// ================================
const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: getProfileSelect()
    })

    res.json({ user })
  } catch (error) {
    res.internalError(error)
  }
}

const getStudentIdQr = async (req, res) => {
  try {
    if (req.user.role !== 'STUDENT') {
      return res.status(403).json({ message: 'Only students can access the ID QR.' })
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: getProfileSelect()
    })

    if (!user?.student) {
      return res.status(404).json({ message: 'Student profile not found' })
    }

    const expiresAt = getStudentIdQrExpiry()
    const qrPayload = signQrPayload({
      type: 'STUDENT_ID_CARD',
      studentId: user.student.id,
      rollNumber: user.student.rollNumber,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      department: user.student.department || '',
      semester: user.student.semester,
      section: user.student.section || '',
      expiresAt: expiresAt.toISOString()
    })

    const qrCode = await QRCode.toDataURL(qrPayload, {
      margin: 1,
      width: 220
    })

    res.json({
      qrCode,
      qrData: qrPayload,
      rollNumber: user.student.rollNumber,
      expiresAt
    })
  } catch (error) {
    res.internalError(error)
  }
}

const updateProfile = async (req, res) => {
  try {
    const parsedBody = schemas.auth.updateProfile.body.parse(req.body)
    const {
      name,
      phone,
      address,
      fatherName,
      motherName,
      fatherPhone,
      motherPhone,
      bloodGroup,
      localGuardianName,
      localGuardianAddress,
      localGuardianPhone,
      permanentAddress,
      temporaryAddress,
      dateOfBirth,
      section
    } = parsedBody
    const isStudentRole = req.user.role === 'STUDENT'

    if (isStudentRole && section !== undefined) {
      return res.status(403).json({
        message: 'Students cannot update their section through profile settings'
      })
    }

    const sanitizedProfile = {
      address: sanitizeOptionalPlainText(address),
      fatherName: sanitizeOptionalPlainText(fatherName),
      motherName: sanitizeOptionalPlainText(motherName),
      fatherPhone: sanitizeOptionalPlainText(fatherPhone),
      motherPhone: sanitizeOptionalPlainText(motherPhone),
      bloodGroup: sanitizeOptionalPlainText(bloodGroup),
      localGuardianName: sanitizeOptionalPlainText(localGuardianName),
      localGuardianAddress: sanitizeOptionalPlainText(localGuardianAddress),
      localGuardianPhone: sanitizeOptionalPlainText(localGuardianPhone),
      permanentAddress: sanitizeOptionalPlainText(permanentAddress),
      temporaryAddress: sanitizeOptionalPlainText(temporaryAddress)
    }
    // For students we prefer their current location as canonical user.address.
    const canonicalAddress = isStudentRole
      ? (sanitizedProfile.temporaryAddress ?? sanitizedProfile.address)
      : (sanitizedProfile.address ?? sanitizedProfile.temporaryAddress)

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: name ? sanitizePlainText(name) : undefined,
        phone: phone ?? undefined,
        address: canonicalAddress ?? undefined
      }
    })

    if (isStudentRole) {
      await prisma.student.update({
        where: { userId: req.user.id },
        data: {
          fatherName: sanitizedProfile.fatherName ?? undefined,
          motherName: sanitizedProfile.motherName ?? undefined,
          fatherPhone: sanitizedProfile.fatherPhone ?? undefined,
          motherPhone: sanitizedProfile.motherPhone ?? undefined,
          bloodGroup: sanitizedProfile.bloodGroup ?? undefined,
          localGuardianName: sanitizedProfile.localGuardianName ?? undefined,
          localGuardianAddress: sanitizedProfile.localGuardianAddress ?? undefined,
          localGuardianPhone: sanitizedProfile.localGuardianPhone ?? undefined,
          permanentAddress: sanitizedProfile.permanentAddress ?? undefined,
          temporaryAddress: canonicalAddress ?? undefined,
          dateOfBirth: dateOfBirth ?? undefined
        }
      })
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: getProfileSelect()
    })

    res.json({
      message: 'Profile updated successfully!',
      user
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: error.flatten()
      })
    }

    res.internalError(error)
  }
}

const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please choose an image to upload' })
    }

    const nextAvatarUrl = buildUploadedFileUrl(req.file)
    if (!nextAvatarUrl) {
      return res.status(400).json({ message: 'Unable to process uploaded avatar' })
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatar: true }
    })

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: nextAvatarUrl },
      select: getProfileSelect()
    })

    if (existingUser?.avatar && existingUser.avatar !== nextAvatarUrl) {
      await removeUploadedFile(existingUser.avatar)
    }

    res.json({
      message: 'Profile photo updated successfully!',
      user,
      authUser: buildAuthUser(user)
    })
  } catch (error) {
    if (req.file?.path) {
      await removeUploadedFile(req.file.path)
    }
    res.internalError(error)
  }
}

// ================================
// CHANGE PASSWORD
// ================================
const changePassword = async (req, res) => {
  try {
    const parsedBody = schemas.auth.changePassword.body.parse(req.body)
    const { currentPassword, newPassword } = parsedBody

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' })
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password)
    if (isSamePassword) {
      return res.status(400).json({
        message: 'New password must be different from your current password'
      })
    }

    const hashedPassword = await hashPassword(newPassword)
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
        passwordChangedAt: new Date()
      }
    })

    res.json({
      message: 'Password changed successfully!',
      user: buildAuthUser(updatedUser)
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: error.flatten()
      })
    }

    res.internalError(error)
  }
}

// ================================
// COMPLETE STUDENT PROFILE
// ================================
const completeProfile = async (req, res) => {
  try {
    if (req.user.role !== 'STUDENT') {
      return res.status(403).json({ message: 'Only students can complete this profile form' })
    }

    const parsedBody = schemas.auth.completeProfile.body.parse(req.body)

    const {
      phone,
      fatherName,
      motherName,
      fatherPhone,
      motherPhone,
      bloodGroup,
      localGuardianName,
      localGuardianAddress,
      localGuardianPhone,
      permanentAddress,
      temporaryAddress,
      dateOfBirth,
      section
    } = parsedBody
    const sanitizedProfile = {
      fatherName: sanitizePlainText(fatherName),
      motherName: sanitizePlainText(motherName),
      fatherPhone: sanitizeOptionalPlainText(fatherPhone),
      motherPhone: sanitizeOptionalPlainText(motherPhone),
      bloodGroup: sanitizeOptionalPlainText(bloodGroup),
      localGuardianName: sanitizeOptionalPlainText(localGuardianName),
      localGuardianAddress: sanitizeOptionalPlainText(localGuardianAddress),
      localGuardianPhone: sanitizeOptionalPlainText(localGuardianPhone),
      permanentAddress: sanitizeOptionalPlainText(permanentAddress),
      temporaryAddress: sanitizeOptionalPlainText(temporaryAddress),
      section: sanitizeOptionalPlainText(section)
    }

    const student = await prisma.student.findUnique({
      where: { userId: req.user.id }
    })

    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' })
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const userRecord = await tx.user.update({
          where: { id: req.user.id },
          data: {
            phone,
            address: sanitizedProfile.temporaryAddress,
            profileCompleted: true
          }
      })

      await tx.student.update({
        where: { userId: req.user.id },
        data: {
          fatherName: sanitizedProfile.fatherName,
          motherName: sanitizedProfile.motherName,
          fatherPhone: sanitizedProfile.fatherPhone,
          motherPhone: sanitizedProfile.motherPhone,
          bloodGroup: sanitizedProfile.bloodGroup,
          localGuardianName: sanitizedProfile.localGuardianName,
          localGuardianAddress: sanitizedProfile.localGuardianAddress,
          localGuardianPhone: sanitizedProfile.localGuardianPhone,
          permanentAddress: sanitizedProfile.permanentAddress,
          temporaryAddress: sanitizedProfile.temporaryAddress,
          section: sanitizedProfile.section,
          dateOfBirth
        }
      })

      return userRecord
    })

    res.json({
      message: 'Profile submitted successfully!',
      user: buildAuthUser(updatedUser)
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: error.flatten()
      })
    }

    res.internalError(error)
  }
}

// ================================
// FORGOT PASSWORD
// ================================
const forgotPassword = async (req, res) => {
  const startedAt = Date.now()

  try {
    if (!isPasswordResetEnabled()) {
      return res.status(501).json({
        message: 'Password reset is not available until email delivery is configured'
      })
    }

    const email = normalizeEmail(req.body?.email)

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true
      }
    })

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex')
      const resetTokenHash = hashToken(resetToken)
      const expiresAt = getResetTokenExpiry()

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: resetTokenHash,
          passwordResetExpiresAt: expiresAt
        }
      })

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
      const { subject, html, text } = passwordResetTemplate({
        name: user.name,
        resetUrl
      })

      sendMail({ to: user.email, subject, html, text })
        .then(() => {
          logger.info('Password reset email queued', {
            userId: user.id,
            email: user.email
          })
        })
        .catch((mailError) => {
          logger.error(mailError.message, { stack: mailError.stack, userId: user.id })
        })
    }

    await waitForMinimumDuration(startedAt, FORGOT_PASSWORD_MIN_RESPONSE_MS)
    return res.status(200).json({
      message: GENERIC_FORGOT_PASSWORD_MESSAGE
    })
  } catch (error) {
    res.internalError(error)
  }
}

const verifyEmail = async (req, res) => {
  try {
    const token = String(req.params?.token || '').trim()
    if (!token) {
      return res.status(400).json({ message: 'Verification token is required' })
    }

    const tokenHash = hashEmailVerificationToken(token)
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: tokenHash,
        deletedAt: null
      },
      select: {
        id: true,
        emailVerificationExpiry: true
      }
    })

    if (!user || !user.emailVerificationExpiry || user.emailVerificationExpiry <= new Date()) {
      return res.status(400).json({ message: 'Verification link is invalid or expired' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null
      }
    })

    res.status(200).json({ message: 'Email verified successfully' })
  } catch (error) {
    res.internalError(error)
  }
}

const resendVerification = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email)
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        deletedAt: true
      }
    })

    if (!user || user.deletedAt || user.emailVerified) {
      return res.status(200).json({ message: 'If this email needs verification, a new link has been sent.' })
    }

    const emailVerification = createEmailVerificationToken()
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: emailVerification.tokenHash,
        emailVerificationExpiry: emailVerification.expiresAt
      }
    })

    await sendEmailVerificationEmail({
      email: user.email,
      name: user.name,
      token: emailVerification.token,
      userId: user.id
    })

    res.status(200).json({ message: 'If this email needs verification, a new link has been sent.' })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// RESET PASSWORD
// ================================
const resetPassword = async (req, res) => {
  try {
    if (!isPasswordResetEnabled()) {
      return res.status(501).json({
        message: 'Password reset is not available until email delivery is configured'
      })
    }

    const { token, password } = req.body
    const tokenHash = hashToken(token)

    const user = await prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: {
          gt: new Date()
        }
      },
      select: {
        id: true
      }
    })

    if (!user) {
      return res.status(400).json({ message: 'Password reset link is invalid or expired' })
    }

    const hashedPassword = await hashPassword(password)

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null
        }
      })

      await tx.refreshToken.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date() }
      })
    })

    res.json({ message: 'Password reset successfully!' })
  } catch (error) {
    res.internalError(error)
  }
}

const refreshSession = async (req, res, refreshToken, { includeRefreshToken = false, setRefreshCookie = true } = {}) => {
  try {
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token is required' })
    }

    const decoded = verifyRefreshToken(refreshToken)
    const tokenHash = hashToken(refreshToken)
    const now = new Date()
    const storedRefreshToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: { select: refreshUserSelect }
      }
    })

    if (storedRefreshToken?.userId === decoded.id && storedRefreshToken.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: {
          userId: decoded.id,
          revokedAt: null
        },
        data: { revokedAt: now }
      })

      res.clearCookie('refreshToken', {
        ...getRefreshCookieOptions(req),
        expires: new Date(0)
      })

      logger.warn('Refresh token reuse detected; revoked all active sessions', {
        userId: decoded.id,
        sessionId: storedRefreshToken.id,
        ipAddress: getRequestIpAddress(req),
        userAgent: getRequestUserAgent(req)
      })

      await recordAuditLog({
        actorId: decoded.id,
        actorRole: storedRefreshToken.user?.role || decoded.role,
        action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
        entityType: 'AuthSession',
        metadata: {
          sessionId: storedRefreshToken.id,
          ipAddress: getRequestIpAddress(req),
          userAgent: getRequestUserAgent(req)
        }
      })

      return res.status(401).json({ message: 'Refresh token is invalid or expired' })
    }

    if (
      !storedRefreshToken ||
      storedRefreshToken.userId !== decoded.id ||
      storedRefreshToken.revokedAt ||
      storedRefreshToken.expiresAt <= now ||
      !storedRefreshToken.user.isActive
    ) {
      return res.status(401).json({ message: 'Refresh token is invalid or expired' })
    }

    const session = await issueAuthSession(storedRefreshToken.user, res, req, refreshToken, { setRefreshCookie })

    const responseBody = {
      message: 'Token refreshed successfully',
      token: session.accessToken,
      accessToken: session.accessToken,
      user: buildAuthUser(storedRefreshToken.user)
    }

    if (includeRefreshToken) {
      responseBody.refreshToken = session.refreshToken
    }

    res.json(responseBody)
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    res.status(401).json({ message: 'Refresh token is invalid or expired' })
  }
}

const refresh = async (req, res) => {
  if (isMobileClient(req)) {
    return res.status(400).json({ message: 'Use /auth/refresh/mobile for mobile clients.' })
  }

  return refreshSession(req, res, req.cookies?.refreshToken)
}

const refreshMobile = async (req, res) => refreshSession(
  req,
  res,
  req.body?.refreshToken,
  { includeRefreshToken: true, setRefreshCookie: false }
)

const logout = async (req, res) => {
  const startedAt = Date.now()

  try {
    const refreshToken = req.cookies?.refreshToken
    if (!refreshToken) {
      res.clearCookie('refreshToken', {
        ...getRefreshCookieOptions(req),
        expires: new Date(0)
      })

      if (req.user?.id) {
        await recordAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'AUTH_LOGOUT',
          entityType: 'AuthSession',
          metadata: {
            ipAddress: getRequestIpAddress(req),
            userAgent: getRequestUserAgent(req)
          }
        })
      }

      await waitForMinimumDuration(startedAt, LOGOUT_MIN_RESPONSE_MS)
      return res.json({ message: 'Logged out successfully' })
    }

    await prisma.refreshToken.updateMany({
      where: {
        tokenHash: hashToken(refreshToken),
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    })

    res.clearCookie('refreshToken', {
      ...getRefreshCookieOptions(req),
      expires: new Date(0)
    })

    if (req.user?.id) {
      await recordAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'AUTH_LOGOUT',
        entityType: 'AuthSession',
        metadata: {
          ipAddress: getRequestIpAddress(req),
          userAgent: getRequestUserAgent(req)
        }
      })
    }

    await waitForMinimumDuration(startedAt, LOGOUT_MIN_RESPONSE_MS)
    res.json({ message: 'Logged out successfully' })
  } catch (error) {
    res.internalError(error)
  }
}

const getActivity = async (req, res) => {
  try {
    const currentRefreshToken = req.cookies?.refreshToken
    const currentTokenHash = currentRefreshToken ? hashToken(currentRefreshToken) : null
    const now = new Date()

    const [activity, currentSession, sessions] = await Promise.all([
      prisma.auditLog.findMany({
        where: { actorId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      currentTokenHash
        ? prisma.refreshToken.findFirst({
          where: {
            userId: req.user.id,
            tokenHash: currentTokenHash,
            revokedAt: null,
            expiresAt: { gt: now }
          },
          select: {
            id: true
          }
        })
        : null,
      prisma.refreshToken.findMany({
        where: {
          userId: req.user.id,
          revokedAt: null,
          expiresAt: { gt: now }
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true
        }
      })
    ])

    res.json({
      activity: activity.map((item) => ({
        id: item.id,
        action: item.action,
        entityType: item.entityType,
        metadata: item.metadata,
        createdAt: item.createdAt
      })),
      sessions: sessions.map((session) => ({
        id: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
        current: currentSession ? session.id === currentSession.id : false
      }))
    })
  } catch (error) {
    res.internalError(error)
  }
}

const logoutAll = async (req, res) => {
  try {
    await prisma.refreshToken.updateMany({
      where: {
        userId: req.user.id,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    })

    res.clearCookie('refreshToken', {
      ...getRefreshCookieOptions(req),
      expires: new Date(0)
    })

    await recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'AUTH_LOGOUT_ALL_DEVICES',
      entityType: 'AuthSession',
      metadata: {
        ipAddress: getRequestIpAddress(req),
        userAgent: getRequestUserAgent(req)
      }
    })

    res.json({ message: 'Signed out from all devices successfully' })
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = {
  register,
  submitStudentIntake,
  login,
  getStudentIdQr,
  getMe,
  updateProfile,
  uploadAvatar,
  changePassword,
  completeProfile,
  forgotPassword,
  verifyEmail,
  resendVerification,
  resetPassword,
  refresh,
  refreshMobile,
  logout,
  getActivity,
  logoutAll
}
