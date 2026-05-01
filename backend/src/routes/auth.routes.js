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
const { validateMobileClient } = require('../middleware/mobileClient.middleware')
const { schemas } = require('../validators/schemas')

router.post('/register', authLimiter, validate(schemas.auth.register), register)
router.post('/student-intake', authLimiter, validate(schemas.auth.studentIntake), submitStudentIntake)
/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in and receive JWT tokens.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             email: student@example.com
 *             password: Password123
 *     responses:
 *       200:
 *         description: Authenticated.
 */
router.post('/login', loginLimiter, validate(schemas.auth.login), login)
router.post('/forgot-password', forgotPasswordLimiter, validate(schemas.auth.forgotPassword), forgotPassword)
router.get('/verify-email/:token', verifyEmail)
router.post('/resend-verification', resendVerificationLimiter, validate(schemas.auth.resendVerification), resendVerification)
router.post('/reset-password', authLimiter, validate(schemas.auth.resetPassword), resetPassword)
router.post('/refresh', refreshLimiter, refresh)
/**
 * @openapi
 * /api/v1/auth/refresh/mobile:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate a mobile refresh token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             refreshToken: mobile-refresh-token
 *     responses:
 *       200:
 *         description: New access token and rotated refresh token.
 */
router.post('/refresh/mobile', validateMobileClient, refreshLimiter, refreshMobile)
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
