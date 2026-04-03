const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const QRCode = require('qrcode')
const prisma = require('../utils/prisma')
const { enrollStudentInMatchingSubjects } = require('../utils/enrollment')
const logger = require('../utils/logger')
const { buildUploadedFileUrl } = require('../utils/fileStorage')
const { removeUploadedFile } = require('../middleware/upload.middleware')
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
  profileCompleted: !!user.profileCompleted
})

const isPasswordResetEnabled = () => process.env.ENABLE_PASSWORD_RESET === 'true'
const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET

const createSignedQrPayload = (payload) => JSON.stringify({
  payload,
  signature: crypto
    .createHmac('sha256', QR_SIGNING_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex')
})

const issueAuthSession = async (user, res, previousRefreshToken) => {
  const accessToken = signAccessToken(user)
  const refreshToken = signRefreshToken(user)

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
        expiresAt: getRefreshTokenExpiry()
      }
    })
  })

  res.cookie('refreshToken', refreshToken, getRefreshCookieOptions())

  return accessToken
}

const getResetTokenExpiry = () => {
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + 30)
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
    const { name, email, password, phone, address } = req.body

    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

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
        rollNumber: `STU${Date.now()}`,
        semester: 1
      }
    })

    await enrollStudentInMatchingSubjects({
      studentId: student.id,
      semester: student.semester,
      department: student.department
    })

    const token = await issueAuthSession(user, res)

    res.status(201).json({
      message: 'User registered successfully!',
      token,
      user: buildAuthUser(user)
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

    const existingApplication = await prisma.studentApplication.findUnique({
      where: { email }
    })

    if (existingApplication && existingApplication.status !== 'CONVERTED') {
      return res.status(400).json({ message: 'An application with this email has already been submitted.' })
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return res.status(400).json({ message: 'An account already exists with this email address.' })
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

    res.status(201).json({
      message: 'Your details have been submitted successfully. The institution can now review them and create your student account.'
    })
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

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: user.suspensionReason
          ? `Your account is suspended. Reason: ${user.suspensionReason}`
          : 'Your account is disabled'
      })
    }

    const token = await issueAuthSession(user, res)

    res.json({
      message: user.mustChangePassword
        ? 'Login successful. Please change your password to continue.'
        : 'Login successful!',
      token,
      user: buildAuthUser(user)
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
    logger.error(error.message, { stack: error.stack })
    res.status(500).json({ message: 'Something went wrong' })
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

    const hashedPassword = await bcrypt.hash(newPassword, 10)
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

    logger.info('Password reset requested', {
      userId: user.id,
      email: user.email,
      deliveryStatus: 'pending_email_integration'
    })

    res.json({
      message: 'If the account exists, a password reset email will be sent when email delivery is configured.'
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

    const hashedPassword = await bcrypt.hash(password, 10)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null
      }
    })

    res.json({ message: 'Password reset successfully!' })
  } catch (error) {
    res.internalError(error)
  }
}

const refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken

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
            isActive: true,
            mustChangePassword: true,
            profileCompleted: true
          }
        }
      }
    })

    if (!storedRefreshToken || !storedRefreshToken.user.isActive) {
      return res.status(401).json({ message: 'Refresh token is invalid or expired' })
    }

    const token = await issueAuthSession(storedRefreshToken.user, res, refreshToken)

    res.json({
      message: 'Token refreshed successfully',
      token,
      user: buildAuthUser(storedRefreshToken.user)
    })
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    res.status(401).json({ message: 'Refresh token is invalid or expired' })
  }
}

const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken

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

    res.json({ message: 'Logged out successfully' })
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
  logout
}
