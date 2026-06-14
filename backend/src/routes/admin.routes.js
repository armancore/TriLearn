const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { attachActorProfiles } = require('../middleware/profile.middleware')
const { staffUploadLimiter } = require('../middleware/rateLimit.middleware')
const { uploadSpreadsheet, validateUploadedSpreadsheet } = require('../middleware/upload.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  getAdminStats
} = require('../controllers/admin.controller')
const {
  getStudentApplications,
  updateStudentApplicationStatus,
  createStudentFromApplication,
  deleteStudentApplication
} = require('../controllers/studentApplications.controller')
const {
  getAllUsers,
  exportStudents,
  exportStudentIdUpdateTemplate,
  bulkUpdateStudentIds,
  getUserById
} = require('../controllers/users.controller')
const {
  createStudent,
  updateUser,
  bulkAssignStudentSection,
  promoteStudentSemester,
  toggleUserStatus,
  deleteUser
} = require('../controllers/students.controller')
const {
  createCoordinator,
  createGatekeeper,
  createInstructor
} = require('../controllers/staff.controller')
const { importStudents, getStudentImportJob } = require('../controllers/bulkImport.controller')
const {
  createDisciplinaryRecord,
  updateDisciplinaryRecord,
  deleteDisciplinaryRecord
} = require('../controllers/disciplinary.controller')

router.use(protect)
router.use(attachActorProfiles)
router.use(allowRoles('ADMIN', 'COORDINATOR'))

router.get('/stats', allowRoles('ADMIN', 'COORDINATOR'), getAdminStats)
router.get('/users', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.getAllUsers), getAllUsers)
router.get('/users/students/export', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.exportStudents), exportStudents)
router.get('/users/students/id-template', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.exportStudents), exportStudentIdUpdateTemplate)
router.post('/users/students/update-ids', allowRoles('ADMIN', 'COORDINATOR'), staffUploadLimiter, uploadSpreadsheet.single('file'), validateUploadedSpreadsheet, bulkUpdateStudentIds)
/**
 * @openapi
 * /api/v1/admin/users/{id}:
 *   get:
 *     tags: [Students]
 *     summary: Get a user or student account by id.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User profile, including student details when present.
 */
router.get('/users/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.userId), getUserById)
router.get('/student-applications', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.getStudentApplications), getStudentApplications)
router.patch('/student-applications/:id/status', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.updateStudentApplicationStatus), updateStudentApplicationStatus)
router.post('/student-applications/:id/create-account', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.createStudentFromApplication), createStudentFromApplication)
router.delete('/student-applications/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.studentApplicationId), deleteStudentApplication)
router.post('/users/coordinator', allowRoles('ADMIN'), validate(schemas.admin.createCoordinator), createCoordinator)
// Coordinators may create gatekeepers for physical gate operations, but only
// admins may create coordinator peers. Keep this boundary covered by route tests.
router.post('/users/gatekeeper', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.createGatekeeper), createGatekeeper)
router.post('/users/instructor', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.createInstructor), createInstructor)
router.post('/users/student', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.createStudent), createStudent)
router.post('/users/student-import', allowRoles('ADMIN', 'COORDINATOR'), staffUploadLimiter, uploadSpreadsheet.single('file'), validateUploadedSpreadsheet, importStudents)
router.get('/users/student-import/:jobId', allowRoles('ADMIN', 'COORDINATOR'), getStudentImportJob)
router.patch('/users/students/assign-section', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.bulkAssignStudentSection), bulkAssignStudentSection)
router.put('/users/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.updateUser), updateUser)
router.patch('/users/:id/promote-semester', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.emptyUserMutation), promoteStudentSemester)
router.patch('/users/:id/toggle-status', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.emptyUserMutation), toggleUserStatus)
router.delete('/users/:id', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.admin.userId), deleteUser)

router.post(
  '/students/:studentId/disciplinary',
  allowRoles('ADMIN', 'COORDINATOR'),
  validate(schemas.disciplinary.create),
  createDisciplinaryRecord
)

router.put(
  '/students/:studentId/disciplinary/:recordId',
  allowRoles('ADMIN'),
  validate(schemas.disciplinary.update),
  updateDisciplinaryRecord
)

router.delete(
  '/students/:studentId/disciplinary/:recordId',
  allowRoles('ADMIN'),
  validate(schemas.disciplinary.delete),
  deleteDisciplinaryRecord
)

module.exports = router
