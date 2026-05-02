const { createController } = require('../utils/controllerAdapter')
const {
  createMaterial: createMaterialService,
  getMaterialsBySubject: getMaterialsBySubjectService,
  getAllMaterials: getAllMaterialsService,
  deleteMaterial: deleteMaterialService
} = require('../services/studyMaterial.service')

const createMaterial = createController(createMaterialService)
const getMaterialsBySubject = createController(getMaterialsBySubjectService)
const getAllMaterials = createController(getAllMaterialsService)
const deleteMaterial = createController(deleteMaterialService)

module.exports = {
  createMaterial: createMaterial,
  getMaterialsBySubject: getMaterialsBySubject,
  getAllMaterials: getAllMaterials,
  deleteMaterial: deleteMaterial
}
