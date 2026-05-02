delete require.cache[require.resolve('../services/assignment.service')]
const {
  createAssignment: createAssignmentService,
  getAllAssignments: getAllAssignmentsService,
  getAssignmentById: getAssignmentByIdService,
  updateAssignment: updateAssignmentService,
  deleteAssignment: deleteAssignmentService,
  submitAssignment: submitAssignmentService,
  getMySubmissions: getMySubmissionsService,
  gradeSubmission: gradeSubmissionService,
  exportAssignmentGrades: exportAssignmentGradesService
} = require('../services/assignment.service')

const createAssignment = async (req, res) => {
  return createAssignmentService(req, res)
}

const getAllAssignments = async (req, res) => {
  return getAllAssignmentsService(req, res)
}

const getAssignmentById = async (req, res) => {
  return getAssignmentByIdService(req, res)
}

const updateAssignment = async (req, res) => {
  return updateAssignmentService(req, res)
}

const deleteAssignment = async (req, res) => {
  return deleteAssignmentService(req, res)
}

const submitAssignment = async (req, res) => {
  return submitAssignmentService(req, res)
}

const getMySubmissions = async (req, res) => {
  return getMySubmissionsService(req, res)
}

const gradeSubmission = async (req, res) => {
  return gradeSubmissionService(req, res)
}

const exportAssignmentGrades = async (req, res) => {
  return exportAssignmentGradesService(req, res)
}
module.exports = {
  createAssignment: createAssignment,
  getAllAssignments: getAllAssignments,
  getAssignmentById: getAssignmentById,
  updateAssignment: updateAssignment,
  deleteAssignment: deleteAssignment,
  submitAssignment: submitAssignment,
  getMySubmissions: getMySubmissions,
  gradeSubmission: gradeSubmission,
  exportAssignmentGrades: exportAssignmentGrades
}
