const express = require('express')
const router = express.Router()
const { protect, allowRoles } = require('../middleware/auth.middleware')
const { attachActorProfiles } = require('../middleware/profile.middleware')
const { validate } = require('../middleware/validate.middleware')
const { schemas } = require('../validators/schemas')
const {
  addMarks,
  addMarksBulk,
  updateMarks,
  getMarksBySubject,
  getMarksReview,
  getEnrolledStudentsBySubject,
  getMyMarks,
  getMyMarksSummary,
  exportMyMarksheetPdf,
  deleteMarks,
  publishMarks
} = require('../controllers/marks.controller')

router.use(protect)
router.use(attachActorProfiles)

// Instructor routes
/**
 * @openapi
 * /api/v1/marks:
 *   post:
 *     tags: [Marks]
 *     summary: Create marks for one student.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             studentId: 63f09f1f-9f96-42f8-a25a-4da23eaad52d
 *             subjectId: 3df9f708-8c1a-4e29-ae8e-bf3d47e1870f
 *             examType: FINAL
 *             totalMarks: 100
 *             obtainedMarks: 86
 *     responses:
 *       201:
 *         description: Mark created.
 */
router.post('/', allowRoles('INSTRUCTOR'), validate(schemas.marks.create), addMarks)
router.post('/bulk', allowRoles('INSTRUCTOR'), validate(schemas.marks.bulkCreate), addMarksBulk)
router.put('/:id', allowRoles('INSTRUCTOR'), validate(schemas.marks.update), updateMarks)
router.post('/publish', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.marksPublication.publish), publishMarks)
router.get('/review', allowRoles('ADMIN', 'COORDINATOR'), validate(schemas.marks.review), getMarksReview)

// Admin + Instructor
router.get('/subject/:subjectId', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR'), validate(schemas.marks.bySubject), getMarksBySubject)
router.get('/subject/:subjectId/students', allowRoles('ADMIN', 'COORDINATOR', 'INSTRUCTOR'), validate(schemas.marks.bySubject), getEnrolledStudentsBySubject)
router.delete('/:id', allowRoles('ADMIN'), validate(schemas.marks.id), deleteMarks)

// Student
/**
 * @openapi
 * /api/v1/marks/my:
 *   get:
 *     tags: [Marks]
 *     summary: Get marks for the authenticated student.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Published marks for the current student.
 */
router.get('/my', allowRoles('STUDENT'), getMyMarks)
router.get('/my/summary', allowRoles('STUDENT'), validate(schemas.marks.mySummary), getMyMarksSummary)
router.get('/my/marksheet', allowRoles('STUDENT'), validate(schemas.marks.mySummary), exportMyMarksheetPdf)

module.exports = router
