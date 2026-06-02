const prisma = require('../../utils/prisma')
const { parseQrPayload } = require('./qr-payload.helpers')

const getStudentByIdCardQr = async (qrData) => {
  const parsedQr = parseQrPayload(qrData)
  const rollNumber = String(parsedQr?.rollNumber || '').trim()
  const isStudentIdQr = parsedQr?.type === 'Student' || parsedQr?.type === 'STUDENT_ID_CARD'
  if (!parsedQr || !isStudentIdQr || !rollNumber) {
    return { error: { status: 400, message: 'Invalid student ID QR code' } }
  }

  const student = await prisma.student.findUnique({
    where: { rollNumber },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          deletedAt: true
        }
      }
    }
  })

  if (!student || !student.user?.isActive || student.user.deletedAt) {
    return { error: { status: 404, message: 'Student was not found or is inactive' } }
  }

  if (parsedQr.semester !== student.semester) {
    return { error: { status: 400, message: 'Student ID QR code is no longer valid for the current semester' } }
  }

  if ((parsedQr.section || '') !== (student.section || '')) {
    return { error: { status: 400, message: 'Student ID QR code is no longer valid for the current section' } }
  }

  return { student, parsedQr }
}

const getStudentByRollNumber = async (rollNumber) => {
  const normalizedRollNumber = String(rollNumber || '').trim()
  if (!normalizedRollNumber) {
    return { error: { status: 400, message: 'Roll number is required' } }
  }

  const student = await prisma.student.findUnique({
    where: { rollNumber: normalizedRollNumber },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true
        }
      }
    }
  })

  if (!student || !student.user?.isActive) {
    return { error: { status: 404, message: 'Student was not found or is inactive' } }
  }

  return { student }
}

module.exports = {
  getStudentByIdCardQr,
  getStudentByRollNumber
}
