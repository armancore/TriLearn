const { createController } = require('../utils/controllerAdapter')
const {
  getStudentApplications: getStudentApplicationsService,
  getStudentApplication: getStudentApplicationService,
  updateStudentApplicationStatus: updateStudentApplicationStatusService,
  createStudentFromApplication: createStudentFromApplicationService,
  deleteStudentApplication: deleteStudentApplicationService
} = require('../services/studentApplications.service')

const getStudentApplications = createController(getStudentApplicationsService)
const getStudentApplication = createController(getStudentApplicationService)
const updateStudentApplicationStatus = createController(updateStudentApplicationStatusService)
const createStudentFromApplication = createController(createStudentFromApplicationService)
const deleteStudentApplication = createController(deleteStudentApplicationService)

module.exports = {
  getStudentApplications: getStudentApplications,
  getStudentApplication: getStudentApplication,
  reviewStudentApplication: updateStudentApplicationStatus,
  updateStudentApplicationStatus: updateStudentApplicationStatus,
  convertStudentApplication: createStudentFromApplication,
  createStudentFromApplication: createStudentFromApplication,
  deleteStudentApplication: deleteStudentApplication
}
