const { createController } = require('../utils/controllerAdapter')
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

const addMarks = createController(addMarksService)
const addMarksBulk = createController(addMarksBulkService)
const updateMarks = createController(updateMarksService)
const getMarksBySubject = createController(getMarksBySubjectService)
const getMarksReview = createController(getMarksReviewService)
const getEnrolledStudentsBySubject = createController(getEnrolledStudentsBySubjectService)
const getMyMarks = createController(getMyMarksService)
const getMyMarksSummary = createController(getMyMarksSummaryService)
const exportMyMarksheetPdf = createController(exportMyMarksheetPdfService)
const deleteMarks = createController(deleteMarksService)
const publishMarks = createController(publishMarksService)

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
