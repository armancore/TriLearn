delete require.cache[require.resolve('../services/subject.service')]
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

const createSubject = async (req, res) => {
  return createSubjectService(req, res)
}

const getAllSubjects = async (req, res) => {
  return getAllSubjectsService(req, res)
}

const getSubjectById = async (req, res) => {
  return getSubjectByIdService(req, res)
}

const updateSubject = async (req, res) => {
  return updateSubjectService(req, res)
}

const deleteSubject = async (req, res) => {
  return deleteSubjectService(req, res)
}

const assignInstructor = async (req, res) => {
  return assignInstructorService(req, res)
}

const getSubjectEnrollments = async (req, res) => {
  return getSubjectEnrollmentsService(req, res)
}

const updateSubjectEnrollments = async (req, res) => {
  return updateSubjectEnrollmentsService(req, res)
}
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
