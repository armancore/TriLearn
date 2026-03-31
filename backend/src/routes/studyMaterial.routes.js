const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { uploadPdf } = require('../middleware/upload.middleware')
const {
  createMaterial,
  getMaterialsBySubject,
  getAllMaterials,
  deleteMaterial
} = require('../controllers/studyMaterial.controller')

router.use(protect)

// Instructor routes
router.post('/', allowRoles('INSTRUCTOR'), uploadPdf.single('materialPdf'), createMaterial)
router.delete('/:id', allowRoles('INSTRUCTOR', 'ADMIN'), deleteMaterial)

// All roles can view
router.get('/', allowRoles('ADMIN', 'INSTRUCTOR', 'STUDENT'), getAllMaterials)
router.get('/subject/:subjectId', allowRoles('ADMIN', 'INSTRUCTOR', 'STUDENT'), getMaterialsBySubject)

module.exports = router
