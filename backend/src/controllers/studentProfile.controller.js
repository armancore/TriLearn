const { createController } = require('../utils/controllerAdapter')
const { getStudentProfile: getStudentProfileService } = require('../services/studentProfile.service')

const getStudentProfile = createController(getStudentProfileService)

module.exports = { getStudentProfile }
