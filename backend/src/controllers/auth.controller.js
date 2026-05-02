delete require.cache[require.resolve('../services/auth.service')]
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

const register = async (req, res) => {
  return registerService(req, res)
}

const submitStudentIntake = async (req, res) => {
  return submitStudentIntakeService(req, res)
}

const login = async (req, res) => {
  return loginService(req, res)
}

const getStudentIdQr = async (req, res) => {
  return getStudentIdQrService(req, res)
}

const getMe = async (req, res) => {
  return getMeService(req, res)
}

const updateProfile = async (req, res) => {
  return updateProfileService(req, res)
}

const uploadAvatar = async (req, res) => {
  return uploadAvatarService(req, res)
}

const changePassword = async (req, res) => {
  return changePasswordService(req, res)
}

const completeProfile = async (req, res) => {
  return completeProfileService(req, res)
}

const forgotPassword = async (req, res) => {
  return forgotPasswordService(req, res)
}

const verifyEmail = async (req, res) => {
  return verifyEmailService(req, res)
}

const resendVerification = async (req, res) => {
  return resendVerificationService(req, res)
}

const resetPassword = async (req, res) => {
  return resetPasswordService(req, res)
}

const refresh = async (req, res) => {
  return refreshService(req, res)
}

const refreshMobile = async (req, res) => {
  return refreshMobileService(req, res)
}

const logout = async (req, res) => {
  return logoutService(req, res)
}

const getActivity = async (req, res) => {
  return getActivityService(req, res)
}

const logoutAll = async (req, res) => {
  return logoutAllService(req, res)
}
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
