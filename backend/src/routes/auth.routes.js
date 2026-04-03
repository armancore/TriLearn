const express = require('express')
const router = express.Router()
const {
  register,
  submitStudentIntake,
  login,
  refresh,
  logout,
  getMe,
  getStudentIdQr,
  updateProfile,
  uploadAvatar,
  changePassword,
  completeProfile,
  forgotPassword,
  resetPassword
} = require('../controllers/auth.controller')
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { authLimiter } = require('../middleware/rateLimit.middleware')
const { uploadImage, validateUploadedImage } = require('../middleware/upload.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')

router.post('/register', authLimiter, validate(schemas.auth.register), register)
router.post('/student-intake', authLimiter, validate(schemas.auth.studentIntake), submitStudentIntake)
router.post('/login', authLimiter, validate(schemas.auth.login), login)
router.post('/forgot-password', authLimiter, validate(schemas.auth.forgotPassword), forgotPassword)
router.post('/reset-password', authLimiter, validate(schemas.auth.resetPassword), resetPassword)
router.post('/refresh', authLimiter, refresh)
router.post('/logout', logout)
router.get('/me', protect, getMe)
router.get('/student-id-qr', protect, allowRoles('STUDENT'), getStudentIdQr)
router.post('/avatar', protect, uploadImage.single('avatar'), validateUploadedImage, uploadAvatar)
router.patch('/profile', protect, validate(schemas.auth.updateProfile), updateProfile)
router.post('/change-password', protect, validate(schemas.auth.changePassword), changePassword)
router.patch('/complete-profile', protect, allowRoles('STUDENT'), validate(schemas.auth.completeProfile), completeProfile)

module.exports = router
