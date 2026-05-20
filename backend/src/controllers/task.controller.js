const { createController } = require('../utils/controllerAdapter')
const {
  createTask: createTaskService,
  getAllTasks: getAllTasksService,
  getTaskById: getTaskByIdService,
  updateTask: updateTaskService,
  deleteTask: deleteTaskService,
  submitTask: submitTaskService,
  getMyTaskSubmissions: getMyTaskSubmissionsService,
  reviewTaskSubmission: reviewTaskSubmissionService
} = require('../services/task.service')

module.exports = {
  createTask: createController(createTaskService),
  getAllTasks: createController(getAllTasksService),
  getTaskById: createController(getTaskByIdService),
  updateTask: createController(updateTaskService),
  deleteTask: createController(deleteTaskService),
  submitTask: createController(submitTaskService),
  getMyTaskSubmissions: createController(getMyTaskSubmissionsService),
  reviewTaskSubmission: createController(reviewTaskSubmissionService)
}
