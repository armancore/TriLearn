delete require.cache[require.resolve('../services/marks.service')]
const {
  addMarks: addMarksService,
  addMarksBulk: addMarksBulkService,
  updateMarks: updateMarksService,
  getMarksBySubject: getMarksBySubjectService,
  getMarksReview: getMarksReviewService,
  getEnrolledStudentsBySubject: getEnrolledStudentsBySubjectService,
  getMyMarks: getMyMarksService,
  getMyMarksSummary: getMyMarksSummaryService,
  exportMyMarksheetPdf: exportMyMarksheetPdfService,
  deleteMarks: deleteMarksService,
  publishMarks: publishMarksService
} = require('../services/marks.service')

const addMarks = async (req, res) => {
  return addMarksService(req, res)
}

const addMarksBulk = async (req, res) => {
  return addMarksBulkService(req, res)
}

const updateMarks = async (req, res) => {
  return updateMarksService(req, res)
}

const getMarksBySubject = async (req, res) => {
  return getMarksBySubjectService(req, res)
}

const getMarksReview = async (req, res) => {
  return getMarksReviewService(req, res)
}

const getEnrolledStudentsBySubject = async (req, res) => {
  return getEnrolledStudentsBySubjectService(req, res)
}

const getMyMarks = async (req, res) => {
  return getMyMarksService(req, res)
}

const getMyMarksSummary = async (req, res) => {
  return getMyMarksSummaryService(req, res)
}

const exportMyMarksheetPdf = async (req, res) => {
  return exportMyMarksheetPdfService(req, res)
}

const deleteMarks = async (req, res) => {
  return deleteMarksService(req, res)
}

const publishMarks = async (req, res) => {
  return publishMarksService(req, res)
}
module.exports = {
  addMarks: addMarks,
  addMarksBulk: addMarksBulk,
  updateMarks: updateMarks,
  getMarksBySubject: getMarksBySubject,
  getMarksReview: getMarksReview,
  getEnrolledStudentsBySubject: getEnrolledStudentsBySubject,
  getMyMarks: getMyMarks,
  getMyMarksSummary: getMyMarksSummary,
  exportMyMarksheetPdf: exportMyMarksheetPdf,
  deleteMarks: deleteMarks,
  publishMarks: publishMarks
}
