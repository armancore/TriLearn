const express = require('express')
const router = express.Router()
const {
  register,
  login,
  refresh,
  logout,
  getMe,
  changePassword,
  completeProfile,
  forgotPassword,
  resetPassword
} = require('../controllers/auth.controller')
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { authLimiter } = require('../middleware/rateLimit.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')

router.post('/register', authLimiter, validate(schemas.auth.register), register)
router.post('/login', authLimiter, validate(schemas.auth.login), login)
router.post('/forgot-password', authLimiter, validate(schemas.auth.forgotPassword), forgotPassword)
router.post('/reset-password', authLimiter, validate(schemas.auth.resetPassword), resetPassword)
router.post('/refresh', authLimiter, refresh)
router.post('/logout', logout)
router.get('/me', protect, getMe)
router.post('/change-password', protect, validate(schemas.auth.changePassword), changePassword)
router.patch('/complete-profile', protect, allowRoles('STUDENT'), validate(schemas.auth.completeProfile), completeProfile)

module.exports = router
