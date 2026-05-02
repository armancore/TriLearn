const { createController } = require('../utils/controllerAdapter')
const {
  register: registerService,
  submitStudentIntake: submitStudentIntakeService,
  login: loginService,
  getStudentIdQr: getStudentIdQrService,
  getMe: getMeService,
  updateProfile: updateProfileService,
  uploadAvatar: uploadAvatarService,
  changePassword: changePasswordService,
  completeProfile: completeProfileService,
  forgotPassword: forgotPasswordService,
  verifyEmail: verifyEmailService,
  resendVerification: resendVerificationService,
  resetPassword: resetPasswordService,
  refresh: refreshService,
  refreshMobile: refreshMobileService,
  logout: logoutService,
  getActivity: getActivityService,
  logoutAll: logoutAllService
} = require('../services/auth.service')

const register = createController(registerService)
const submitStudentIntake = createController(submitStudentIntakeService)
const login = createController(loginService)
const getStudentIdQr = createController(getStudentIdQrService)
const getMe = createController(getMeService)
const updateProfile = createController(updateProfileService)
const uploadAvatar = createController(uploadAvatarService)
const changePassword = createController(changePasswordService)
const completeProfile = createController(completeProfileService)
const forgotPassword = createController(forgotPasswordService)
const verifyEmail = createController(verifyEmailService)
const resendVerification = createController(resendVerificationService)
const resetPassword = createController(resetPasswordService)
const refresh = createController(refreshService)
const refreshMobile = createController(refreshMobileService)
const logout = createController(logoutService)
const getActivity = createController(getActivityService)
const logoutAll = createController(logoutAllService)

module.exports = {
  register: register,
  submitStudentIntake: submitStudentIntake,
  login: login,
  getStudentIdQr: getStudentIdQr,
  getMe: getMe,
  updateProfile: updateProfile,
  uploadAvatar: uploadAvatar,
  changePassword: changePassword,
  completeProfile: completeProfile,
  forgotPassword: forgotPassword,
  verifyEmail: verifyEmail,
  resendVerification: resendVerification,
  resetPassword: resetPassword,
  refresh: refresh,
  refreshMobile: refreshMobile,
  logout: logout,
  getActivity: getActivity,
  logoutAll: logoutAll
}
