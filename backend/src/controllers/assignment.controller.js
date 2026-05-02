const { createController } = require('../utils/controllerAdapter')
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

const createAssignment = createController(createAssignmentService)
const getAllAssignments = createController(getAllAssignmentsService)
const getAssignmentById = createController(getAssignmentByIdService)
const updateAssignment = createController(updateAssignmentService)
const deleteAssignment = createController(deleteAssignmentService)
const submitAssignment = createController(submitAssignmentService)
const getMySubmissions = createController(getMySubmissionsService)
const gradeSubmission = createController(gradeSubmissionService)
const exportAssignmentGrades = createController(exportAssignmentGradesService)

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
