delete require.cache[require.resolve('../services/department.service')]
const {
  createDepartment: createDepartmentService,
  getAllDepartments: getAllDepartmentsService,
  getPublicDepartments: getPublicDepartmentsService,
  getDepartmentSections: getDepartmentSectionsService,
  createDepartmentSection: createDepartmentSectionService,
  deleteDepartmentSection: deleteDepartmentSectionService,
  updateDepartment: updateDepartmentService,
  deleteDepartment: deleteDepartmentService,
  ensureDepartmentExists: ensureDepartmentExistsService
} = require('../services/department.service')

const createDepartment = async (req, res) => {
  return createDepartmentService(req, res)
}

const getAllDepartments = async (req, res) => {
  return getAllDepartmentsService(req, res)
}

const getPublicDepartments = async (req, res) => {
  return getPublicDepartmentsService(req, res)
}

const getDepartmentSections = async (req, res) => {
  return getDepartmentSectionsService(req, res)
}

const createDepartmentSection = async (req, res) => {
  return createDepartmentSectionService(req, res)
}

const deleteDepartmentSection = async (req, res) => {
  return deleteDepartmentSectionService(req, res)
}

const updateDepartment = async (req, res) => {
  return updateDepartmentService(req, res)
}

const deleteDepartment = async (req, res) => {
  return deleteDepartmentService(req, res)
}
module.exports = {
  createDepartment: createDepartment,
  getAllDepartments: getAllDepartments,
  getPublicDepartments: getPublicDepartments,
  getDepartmentSections: getDepartmentSections,
  createDepartmentSection: createDepartmentSection,
  deleteDepartmentSection: deleteDepartmentSection,
  updateDepartment: updateDepartment,
  deleteDepartment: deleteDepartment,
  ensureDepartmentExists: ensureDepartmentExistsService
}
