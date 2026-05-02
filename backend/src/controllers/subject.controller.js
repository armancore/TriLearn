const { createController } = require('../utils/controllerAdapter')
const {
  createSubject: createSubjectService,
  getAllSubjects: getAllSubjectsService,
  getSubjectById: getSubjectByIdService,
  updateSubject: updateSubjectService,
  deleteSubject: deleteSubjectService,
  assignInstructor: assignInstructorService,
  getSubjectEnrollments: getSubjectEnrollmentsService,
  updateSubjectEnrollments: updateSubjectEnrollmentsService
} = require('../services/subject.service')

const createSubject = createController(createSubjectService)
const getAllSubjects = createController(getAllSubjectsService)
const getSubjectById = createController(getSubjectByIdService)
const updateSubject = createController(updateSubjectService)
const deleteSubject = createController(deleteSubjectService)
const assignInstructor = createController(assignInstructorService)
const getSubjectEnrollments = createController(getSubjectEnrollmentsService)
const updateSubjectEnrollments = createController(updateSubjectEnrollmentsService)

module.exports = {
  createSubject: createSubject,
  getAllSubjects: getAllSubjects,
  getSubjectById: getSubjectById,
  updateSubject: updateSubject,
  deleteSubject: deleteSubject,
  assignInstructor: assignInstructor,
  getSubjectEnrollments: getSubjectEnrollments,
  updateSubjectEnrollments: updateSubjectEnrollments
}
