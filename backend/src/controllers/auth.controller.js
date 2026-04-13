const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const QRCode = require('qrcode')
const prisma = require('../utils/prisma')
const { enrollStudentInMatchingSubjects } = require('../utils/enrollment')
const logger = require('../utils/logger')
const { recordAuditLog } = require('../utils/audit')
const { buildUploadedFileUrl } = require('../utils/fileStorage')
const { removeUploadedFile } = require('../middleware/upload.middleware')
const { sendMail } = require('../utils/mailer')
const { passwordResetTemplate } = require('../utils/emailTemplates')
const { hashPassword, getRequiredSecret } = require('../utils/security')
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
  mustChangePassword: !!user.mustChangePassword,
  profileCompleted: !!user.profileCompleted,
  ...(user.student ? { student: user.student } : {}),
  ...(user.instructor ? { instructor: user.instructor } : {}),
  ...(user.coordinator ? { coordinator: user.coordinator } : {})
})

const isPasswordResetEnabled = () => process.env.ENABLE_PASSWORD_RESET === 'true'
const MAX_FAILED_LOGIN_ATTEMPTS = 5
const LOGIN_LOCKOUT_MINUTES = 15
const GENERIC_ELIGIBILITY_MESSAGE = 'If this email is eligible, you will receive further instructions.'
const GENERIC_DISABLED_ACCOUNT_MESSAGE = 'Your account has been disabled. Please contact the administration.'

const createSignedQrPayload = (payload) => JSON.stringify({
  payload,
  signature: crypto
    .createHmac('sha256', getRequiredSecret('QR_SIGNING_SECRET'))
    .update(JSON.stringify(payload))
    .digest('hex')
})

const getRequestUserAgent = (req) => String(req.get('user-agent') || '').slice(0, 255) || null

const getRequestIpAddress = (req) => {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64) || null
}

const generateStudentRollNumber = () => `STU-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`

const generateUniqueStudentRollNumber = async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rollNumber = generateStudentRollNumber()
    const existingStudent = await prisma.student.findUnique({
      where: { rollNumber },
      select: { id: true }
    })

    if (!existingStudent) {
      return rollNumber
    }
  }

  throw new Error('Unable to generate a unique student roll number')
}

const isMobileClient = (req) => String(req.headers?.['x-client-type'] || '').toLowerCase() === 'mobile'

const issueAuthSession = async (user, res, req, previousRefreshToken) => {
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

  if (!isMobileClient(req)) {
    res.cookie('refreshToken', refreshToken, getRefreshCookieOptions())
  }

  return {
    accessToken,
    refreshToken: isMobileClient(req) ? refreshToken : undefined
  }
}

const getResetTokenExpiry = () => {
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + 30)
  return expiresAt
}

const getLoginLockoutExpiry = () => {
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + LOGIN_LOCKOUT_MINUTES)
  return expiresAt
}

const getProfileSelect = () => ({
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  address: true,
  avatar: true,
  createdAt: true,
  mustChangePassword: true,
  profileCompleted: true,
  student: {
    select: {
      id: true,
      rollNumber: true,
      semester: true,
      section: true,
      department: true,
      guardianName: true,
      guardianPhone: true,
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
  },
  instructor: {
    select: {
      id: true,
      department: true
    }
  },
  coordinator: {
    select: {
      id: true,
      department: true
    }
  }
})

// ================================
// REGISTER
// ================================
const register = async (req, res) => {
  try {
    if (process.env.OPEN_REGISTRATION !== 'true') {
      return res.status(403).json({
        message: 'Self-registration is disabled. Please apply through the student intake form.'
      })
    }

    const { name, email, password, phone, address } = req.body

    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return res.status(200).json({ message: GENERIC_ELIGIBILITY_MESSAGE })
    }

    const hashedPassword = await hashPassword(password)
    const rollNumber = await generateUniqueStudentRollNumber()

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'STUDENT',
        phone,
        address
      }
    })

    const student = await prisma.student.create({
      data: {
        userId: user.id,
        rollNumber,
        semester: 1
      }
    })

    await enrollStudentInMatchingSubjects({
      studentId: student.id,
      semester: student.semester,
      department: student.department
    })

    const session = await issueAuthSession(user, res, req)
    const authUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: getProfileSelect()
    })

    res.status(201).json({
      message: 'User registered successfully!',
      token: session.accessToken,
      refreshToken: session.refreshToken,
      user: buildAuthUser(authUser || user)
    })
  } catch (error) {
    res.internalError(error)
  }
}

const submitStudentIntake = async (req, res) => {
  try {
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
    } = req.body

    const existingApplication = await prisma.studentApplication.findUnique({ where: { email } })

    if (existingApplication && !['CONVERTED', 'REVIEWED'].includes(existingApplication.status)) {
      return res.status(200).json({ message: GENERIC_ELIGIBILITY_MESSAGE })
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return res.status(200).json({ message: GENERIC_ELIGIBILITY_MESSAGE })
    }

    await prisma.studentApplication.upsert({
      where: { email },
      update: {
        fullName,
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
        dateOfBirth: new Date(dateOfBirth),
        preferredDepartment,
        preferredSemester: 1,
        preferredSection: null,
        status: 'PENDING',
        reviewedAt: null,
        reviewedBy: null,
        linkedUserId: null
      },
      create: {
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
        dateOfBirth: new Date(dateOfBirth),
        preferredDepartment,
        preferredSemester: 1,
        preferredSection: null
      }
    })

    res.status(201).json({ message: GENERIC_ELIGIBILITY_MESSAGE })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// LOGIN
// ================================
const login = async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (user.deletedAt) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({
        message: 'Too many failed login attempts. Please try again later.'
      })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
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

      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (!user.isActive) {
      logger.warn('Suspended user login blocked', {
        userId: user.id,
        email: user.email,
        suspensionReason: user.suspensionReason || null
      })

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

    res.json({
      message: user.mustChangePassword
        ? 'Login successful. Please change your password to continue.'
        : 'Login successful!',
      token: session.accessToken,
      refreshToken: session.refreshToken,
      user: buildAuthUser(authUser || user)
    })
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

    const qrPayload = createSignedQrPayload({
      type: 'STUDENT_ID_CARD',
      studentId: user.student.id,
      rollNumber: user.student.rollNumber,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      department: user.student.department || '',
      semester: user.student.semester,
      section: user.student.section || ''
    })

    const qrCode = await QRCode.toDataURL(qrPayload, {
      margin: 1,
      width: 220
    })

    res.json({ qrCode })
  } catch (error) {
    res.internalError(error)
  }
}

const updateProfile = async (req, res) => {
  try {
    const {
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
    } = req.body

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        phone: phone ?? undefined,
        address: address ?? temporaryAddress ?? undefined
      }
    })

    if (req.user.role === 'STUDENT') {
      await prisma.student.update({
        where: { userId: req.user.id },
        data: {
          guardianName: fatherName ?? undefined,
          guardianPhone: fatherPhone ?? undefined,
          fatherName: fatherName ?? undefined,
          motherName: motherName ?? undefined,
          fatherPhone: fatherPhone ?? undefined,
          motherPhone: motherPhone ?? undefined,
          bloodGroup: bloodGroup ?? undefined,
          localGuardianName: localGuardianName ?? undefined,
          localGuardianAddress: localGuardianAddress ?? undefined,
          localGuardianPhone: localGuardianPhone ?? undefined,
          permanentAddress: permanentAddress ?? undefined,
          temporaryAddress: temporaryAddress ?? address ?? undefined,
          section: section ?? undefined,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined
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
    const { currentPassword, newPassword } = req.body

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

    const hashedPassword = await hashPassword(newPassword)
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false
      }
    })

    res.json({
      message: 'Password changed successfully!',
      user: buildAuthUser(updatedUser)
    })
  } catch (error) {
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
    } = req.body

    const student = await prisma.student.findUnique({
      where: { userId: req.user.id }
    })

    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' })
    }

    const [updatedUser] = await prisma.$transaction([
        prisma.user.update({
          where: { id: req.user.id },
          data: {
            phone,
            address: temporaryAddress,
            profileCompleted: true
          }
        }),
        prisma.student.update({
          where: { userId: req.user.id },
          data: {
            guardianName: fatherName,
            guardianPhone: fatherPhone,
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
            section,
            dateOfBirth: new Date(dateOfBirth)
          }
      })
    ])

    res.json({
      message: 'Profile submitted successfully!',
      user: buildAuthUser(updatedUser)
    })
  } catch (error) {
    res.internalError(error)
  }
}

// ================================
// FORGOT PASSWORD
// ================================
const forgotPassword = async (req, res) => {
  try {
    if (!isPasswordResetEnabled()) {
      return res.status(501).json({
        message: 'Password reset is not available until email delivery is configured'
      })
    }

    const { email } = req.body

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return res.json({
        message: 'If the account exists, password reset instructions have been prepared.'
      })
    }

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

    await sendMail({ to: user.email, subject, html, text })

    logger.info('Password reset email sent', {
      userId: user.id,
      email: user.email
    })

    res.json({
      message: 'If the account exists, password reset instructions have been sent.'
    })
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

const refresh = async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token is required' })
    }

    const decoded = verifyRefreshToken(refreshToken)
    const storedRefreshToken = await prisma.refreshToken.findFirst({
      where: {
        tokenHash: hashToken(refreshToken),
        userId: decoded.id,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatar: true,
            isActive: true,
            mustChangePassword: true,
            profileCompleted: true,
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
                department: true
              }
            },
            coordinator: {
              select: {
                id: true,
                department: true
              }
            }
          }
        }
      }
    })

    if (!storedRefreshToken || !storedRefreshToken.user.isActive) {
      return res.status(401).json({ message: 'Refresh token is invalid or expired' })
    }

    const session = await issueAuthSession(storedRefreshToken.user, res, req, refreshToken)

    res.json({
      message: 'Token refreshed successfully',
      token: session.accessToken,
      refreshToken: session.refreshToken,
      user: buildAuthUser(storedRefreshToken.user)
    })
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    res.status(401).json({ message: 'Refresh token is invalid or expired' })
  }
}

const logout = async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken

    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: {
          tokenHash: hashToken(refreshToken),
          revokedAt: null
        },
        data: { revokedAt: new Date() }
      })
    }

    res.clearCookie('refreshToken', {
      ...getRefreshCookieOptions(),
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

    res.json({ message: 'Logged out successfully' })
  } catch (error) {
    res.internalError(error)
  }
}

const getActivity = async (req, res) => {
  try {
    const currentRefreshToken = req.cookies?.refreshToken
    const currentTokenHash = currentRefreshToken ? hashToken(currentRefreshToken) : null

    const [activity, sessions] = await Promise.all([
      prisma.auditLog.findMany({
        where: { actorId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      prisma.refreshToken.findMany({
        where: {
          userId: req.user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() }
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          tokenHash: true,
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
        current: currentTokenHash ? session.tokenHash === currentTokenHash : false
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
      ...getRefreshCookieOptions(),
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
  resetPassword,
  refresh,
  logout,
  getActivity,
  logoutAll
}
