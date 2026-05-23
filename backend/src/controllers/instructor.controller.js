const { createController } = require('../utils/controllerAdapter')
const {
  getInstructorStudents: getInstructorStudentsService
} = require('../services/instructor.service')

const getInstructorStudents = createController(getInstructorStudentsService)

module.exports = {
  getInstructorStudents
}
