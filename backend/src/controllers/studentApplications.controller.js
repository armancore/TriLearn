delete require.cache[require.resolve('../services/studentApplications.service')]
const {
  getStudentApplications: getStudentApplicationsService,
  getStudentApplication: getStudentApplicationService,
  updateStudentApplicationStatus: updateStudentApplicationStatusService,
  createStudentFromApplication: createStudentFromApplicationService,
  deleteStudentApplication: deleteStudentApplicationService
} = require('../services/studentApplications.service')

const getStudentApplications = async (req, res) => {
  return getStudentApplicationsService(req, res)
}

const getStudentApplication = async (req, res) => {
  return getStudentApplicationService(req, res)
}

const updateStudentApplicationStatus = async (req, res) => {
  return updateStudentApplicationStatusService(req, res)
}

const createStudentFromApplication = async (req, res) => {
  return createStudentFromApplicationService(req, res)
}

const deleteStudentApplication = async (req, res) => {
  return deleteStudentApplicationService(req, res)
}
module.exports = {
  getStudentApplications: getStudentApplications,
  getStudentApplication: getStudentApplication,
  reviewStudentApplication: updateStudentApplicationStatus,
  updateStudentApplicationStatus: updateStudentApplicationStatus,
  convertStudentApplication: createStudentFromApplication,
  createStudentFromApplication: createStudentFromApplication,
  deleteStudentApplication: deleteStudentApplication
}
