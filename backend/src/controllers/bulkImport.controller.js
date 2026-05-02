const { createController } = require('../utils/controllerAdapter')
const {
  importStudents: importStudentsService
} = require('../services/bulkImport.service')

const importStudents = createController(importStudentsService)

module.exports = {
  importStudents: importStudents
}
