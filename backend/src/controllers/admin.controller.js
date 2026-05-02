const { createController } = require('../utils/controllerAdapter')
const {
  clearStatsCacheService: clearStatsCacheServiceService,
  getAdminStats: getAdminStatsService,
  getAllUsers: getAllUsersService,
  getUserById: getUserByIdService,
  getStudentApplications: getStudentApplicationsService,
  getStudentApplication: getStudentApplicationService,
  updateStudentApplicationStatus: updateStudentApplicationStatusService,
  createStudentFromApplication: createStudentFromApplicationService,
  deleteStudentApplication: deleteStudentApplicationService,
  createGatekeeper: createGatekeeperService,
  createCoordinator: createCoordinatorService,
  createInstructor: createInstructorService,
  createStudent: createStudentService,
  importStudents: importStudentsService,
  updateUser: updateUserService,
  bulkAssignStudentSection: bulkAssignStudentSectionService,
  promoteStudentSemester: promoteStudentSemesterService,
  toggleUserStatus: toggleUserStatusService,
  deleteUser: deleteUserService
} = require('../services/admin.service')

const clearStatsCacheService = createController(clearStatsCacheServiceService)
const getAdminStats = createController(getAdminStatsService)
const getAllUsers = createController(getAllUsersService)
const getUserById = createController(getUserByIdService)
const getStudentApplications = createController(getStudentApplicationsService)
const getStudentApplication = createController(getStudentApplicationService)
const updateStudentApplicationStatus = createController(updateStudentApplicationStatusService)
const createStudentFromApplication = createController(createStudentFromApplicationService)
const deleteStudentApplication = createController(deleteStudentApplicationService)
const createGatekeeper = createController(createGatekeeperService)
const createCoordinator = createController(createCoordinatorService)
const createInstructor = createController(createInstructorService)
const createStudent = createController(createStudentService)
const importStudents = createController(importStudentsService)
const updateUser = createController(updateUserService)
const bulkAssignStudentSection = createController(bulkAssignStudentSectionService)
const promoteStudentSemester = createController(promoteStudentSemesterService)
const toggleUserStatus = createController(toggleUserStatusService)
const deleteUser = createController(deleteUserService)

module.exports = {
  clearStatsCache: clearStatsCacheService,
  getAdminStats: getAdminStats,
  getAllUsers: getAllUsers,
  getUsers: getAllUsers,
  getUserById: getUserById,
  getStudentApplications: getStudentApplications,
  getStudentApplication: getStudentApplication,
  reviewStudentApplication: updateStudentApplicationStatus,
  updateStudentApplicationStatus: updateStudentApplicationStatus,
  convertStudentApplication: createStudentFromApplication,
  createStudentFromApplication: createStudentFromApplication,
  deleteStudentApplication: deleteStudentApplication,
  createGatekeeper: createGatekeeper,
  createCoordinator: createCoordinator,
  createInstructor: createInstructor,
  createStudent: createStudent,
  createUser: createStudent,
  importStudents: importStudents,
  updateUser: updateUser,
  bulkAssignStudentSection: bulkAssignStudentSection,
  promoteStudentSemester: promoteStudentSemester,
  toggleUserStatus: toggleUserStatus,
  suspendUser: toggleUserStatus,
  unsuspendUser: toggleUserStatus,
  deleteUser: deleteUser
}
