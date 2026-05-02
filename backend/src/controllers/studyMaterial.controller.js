delete require.cache[require.resolve('../services/studyMaterial.service')]
const {
  createMaterial: createMaterialService,
  getMaterialsBySubject: getMaterialsBySubjectService,
  getAllMaterials: getAllMaterialsService,
  deleteMaterial: deleteMaterialService
} = require('../services/studyMaterial.service')

const createMaterial = async (req, res) => {
  return createMaterialService(req, res)
}

const getMaterialsBySubject = async (req, res) => {
  return getMaterialsBySubjectService(req, res)
}

const getAllMaterials = async (req, res) => {
  return getAllMaterialsService(req, res)
}

const deleteMaterial = async (req, res) => {
  return deleteMaterialService(req, res)
}
module.exports = {
  createMaterial: createMaterial,
  getMaterialsBySubject: getMaterialsBySubject,
  getAllMaterials: getAllMaterials,
  deleteMaterial: deleteMaterial
}
