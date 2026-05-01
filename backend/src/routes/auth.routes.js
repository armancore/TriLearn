const express = require('express')
const router = express.Router()
const authController = require('../controllers/auth.controller')
const {
  register,
  submitStudentIntake,
  login,
  refresh,
  refreshMobile,
  logout,
  getMe,
  getStudentIdQr,
  updateProfile,
  uploadAvatar,
  changePassword,
  completeProfile,
  forgotPassword,
  verifyEmail,
  resendVerification,
  resetPassword,
  getActivity,
  logoutAll
} = authController
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { authLimiter, forgotPasswordLimiter, loginLimiter, refreshLimiter, logoutLimiter, uploadLimiter, resendVerificationLimiter } = require('../middleware/rateLimit.middleware')
const { uploadImage, validateUploadedImage } = require('../middleware/upload.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')

router.post('/register', authLimiter, validate(schemas.auth.register), register)
router.post('/student-intake', authLimiter, validate(schemas.auth.studentIntake), submitStudentIntake)
router.post('/login', loginLimiter, validate(schemas.auth.login), login)
router.post('/forgot-password', forgotPasswordLimiter, validate(schemas.auth.forgotPassword), forgotPassword)
router.get('/verify-email/:token', verifyEmail)
router.post('/resend-verification', resendVerificationLimiter, validate(schemas.auth.resendVerification), resendVerification)
router.post('/reset-password', authLimiter, validate(schemas.auth.resetPassword), resetPassword)
router.post('/refresh', refreshLimiter, refresh)
router.post('/refresh/mobile', refreshLimiter, refreshMobile)
router.post('/logout', logoutLimiter, logout)
router.post('/logout-all', protect, logoutAll)
router.get('/me', protect, getMe)
router.get('/activity', protect, getActivity)
router.get('/student-id-qr', protect, allowRoles('STUDENT'), getStudentIdQr)
router.post('/avatar', protect, uploadLimiter, uploadImage.single('avatar'), validateUploadedImage, uploadAvatar)
router.patch('/profile', protect, validate(schemas.auth.updateProfile), updateProfile)
router.post('/change-password', protect, validate(schemas.auth.changePassword), changePassword)
router.patch('/complete-profile', protect, allowRoles('STUDENT'), validate(schemas.auth.completeProfile), completeProfile)

module.exports = router
