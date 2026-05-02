const { createController } = require('../utils/controllerAdapter')
const {
  createDepartment: createDepartmentService,
  getAllDepartments: getAllDepartmentsService,
  getPublicDepartments: getPublicDepartmentsService,
  getDepartmentSections: getDepartmentSectionsService,
  createDepartmentSection: createDepartmentSectionService,
  deleteDepartmentSection: deleteDepartmentSectionService,
  updateDepartment: updateDepartmentService,
  deleteDepartment: deleteDepartmentService,
  ensureDepartmentExistsService: ensureDepartmentExistsServiceService
} = require('../services/department.service')

const createDepartment = createController(createDepartmentService)
const getAllDepartments = createController(getAllDepartmentsService)
const getPublicDepartments = createController(getPublicDepartmentsService)
const getDepartmentSections = createController(getDepartmentSectionsService)
const createDepartmentSection = createController(createDepartmentSectionService)
const deleteDepartmentSection = createController(deleteDepartmentSectionService)
const updateDepartment = createController(updateDepartmentService)
const deleteDepartment = createController(deleteDepartmentService)
const ensureDepartmentExistsService = createController(ensureDepartmentExistsServiceService)

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
