const { createServiceResponder } = require('../utils/serviceResult')
const QRCode = require('qrcode')
const prisma = require('../utils/prisma')
const { buildUploadedFileUrl } = require('../utils/fileStorage')
const { attachUploadedFileToEntity } = require('../utils/uploadRecords')
const { removeUploadedFile } = require('../middleware/upload.middleware')
const { signQrPayload } = require('../utils/qrSigning')
const { sanitizePlainText } = require('../utils/sanitize')
const { sanitizeOptionalPlainText } = require('../utils/adminHelpers')
const { schemas } = require('../validators/schemas')
const { ZodError } = require('zod')
const { buildAuthUser } = require('./session.service')
const { getProfileSelect } = require('./auth.shared.service')

// ================================
// GET CURRENT USER
// ================================
/**
 * Handles get me business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const getMe = async (context, result = createServiceResponder()) => {
  const user = await prisma.user.findUnique({
    where: { id: context.user.id },
    select: getProfileSelect()
  })

  result.ok({ user })
}

/**
 * Handles get student id qr business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const getStudentIdQr = async (context, result = createServiceResponder()) => {
  if (context.user.role !== 'STUDENT') {
    return result.withStatus(403, { message: 'Only students can access the ID QR.' })
  }

  const user = await prisma.user.findUnique({
    where: { id: context.user.id },
    select: getProfileSelect()
  })

  if (!user?.student) {
    return result.withStatus(404, { message: 'Student profile not found' })
  }

  const qrPayload = signQrPayload({
    type: 'Student',
    rollNumber: user.student.rollNumber,
    name: user.name,
    department: user.student.department || '',
    semester: user.student.semester,
    section: user.student.section || ''
  })

  const qrCode = await QRCode.toDataURL(qrPayload, {
    margin: 1,
    width: 220
  })

  result.ok({
    qrCode,
    qrData: qrPayload,
    type: 'STUDENT_ID_CARD',
    name: user.name,
    rollNumber: user.student.rollNumber,
    department: user.student.department || '',
    semester: user.student.semester,
    section: user.student.section || '',
    validity: 'Valid until semester or section changes'
  })
}

/**
 * Handles update profile business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const updateProfile = async (context, result = createServiceResponder()) => {
  try {
    const parsedBody = schemas.auth.updateProfile.body.parse(context.body)
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
    const isStudentRole = context.user.role === 'STUDENT'

    if (isStudentRole && section !== undefined) {
      return result.withStatus(403, {
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
      where: { id: context.user.id },
      data: {
        name: name ? sanitizePlainText(name) : undefined,
        phone: phone ?? undefined,
        address: canonicalAddress ?? undefined
      }
    })

    if (isStudentRole) {
      await prisma.student.update({
        where: { userId: context.user.id },
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
      where: { id: context.user.id },
      select: getProfileSelect()
    })

    result.ok({
      message: 'Profile updated successfully!',
      user
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return result.withStatus(400, {
        message: 'Validation failed',
        errors: error.flatten()
      })
    }

    throw error
  }
}

/**
 * Handles upload avatar business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const uploadAvatar = async (context, result = createServiceResponder()) => {
  try {
    if (!context.file) {
      return result.withStatus(400, { message: 'Please choose an image to upload' })
    }

    const nextAvatarUrl = buildUploadedFileUrl(context.file)
    if (!nextAvatarUrl) {
      return result.withStatus(400, { message: 'Unable to process uploaded avatar' })
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: context.user.id },
      select: { avatar: true }
    })

    const user = await prisma.user.update({
      where: { id: context.user.id },
      data: { avatar: nextAvatarUrl },
      select: getProfileSelect()
    })
    await attachUploadedFileToEntity(context.file, 'USER_AVATAR', user.id)

    if (existingUser?.avatar && existingUser.avatar !== nextAvatarUrl) {
      await removeUploadedFile(existingUser.avatar)
    }

    result.ok({
      message: 'Profile photo updated successfully!',
      user,
      authUser: buildAuthUser(user)
    })
  } catch (error) {
    if (context.file?.path) {
      await removeUploadedFile(context.file.path)
    }
    throw error
  }
}


// ================================
// COMPLETE STUDENT PROFILE
// ================================
/**
 * Handles complete profile business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const completeProfile = async (context, result = createServiceResponder()) => {
  try {
    if (context.user.role !== 'STUDENT') {
      return result.withStatus(403, { message: 'Only students can complete this profile form' })
    }

    const parsedBody = schemas.auth.completeProfile.body.parse(context.body)

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
      where: { userId: context.user.id }
    })

    if (!student) {
      return result.withStatus(404, { message: 'Student profile not found' })
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const userRecord = await tx.user.update({
        where: { id: context.user.id },
        data: {
          phone,
          address: sanitizedProfile.temporaryAddress,
          profileCompleted: true
        }
      })

      await tx.student.update({
        where: { userId: context.user.id },
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

    result.ok({
      message: 'Profile submitted successfully!',
      user: buildAuthUser(updatedUser)
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return result.withStatus(400, {
        message: 'Validation failed',
        errors: error.flatten()
      })
    }

    throw error
  }
}


module.exports = {
  getMe,
  getStudentIdQr,
  updateProfile,
  uploadAvatar,
  completeProfile
}

