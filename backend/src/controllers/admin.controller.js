delete require.cache[require.resolve('../services/admin.service')]
const {
  clearStatsCache: clearStatsCacheService,
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

const getAdminStats = async (req, res) => {
  return getAdminStatsService(req, res)
}

const getAllUsers = async (req, res) => {
  return getAllUsersService(req, res)
}

const getUserById = async (req, res) => {
  return getUserByIdService(req, res)
}

const getStudentApplications = async (req, res) => {
  return getStudentApplicationsService(req, res)
}

const getStudentApplication = async (req, res) => {
  return getStudentApplicationService(req, res)
}

const updateStudentApplicationStatus = async (req, res) => {
  return updateStudentApplicationStatusService(req, res)
}

const createStudentFromApplication = async (req, res) => {
  return createStudentFromApplicationService(req, res)
}

const deleteStudentApplication = async (req, res) => {
  return deleteStudentApplicationService(req, res)
}

const createGatekeeper = async (req, res) => {
  return createGatekeeperService(req, res)
}

const createCoordinator = async (req, res) => {
  return createCoordinatorService(req, res)
}

const createInstructor = async (req, res) => {
  return createInstructorService(req, res)
}

const createStudent = async (req, res) => {
  return createStudentService(req, res)
}

const importStudents = async (req, res) => {
  return importStudentsService(req, res)
}

const updateUser = async (req, res) => {
  return updateUserService(req, res)
}

const bulkAssignStudentSection = async (req, res) => {
  return bulkAssignStudentSectionService(req, res)
}

const promoteStudentSemester = async (req, res) => {
  return promoteStudentSemesterService(req, res)
}

const toggleUserStatus = async (req, res) => {
  return toggleUserStatusService(req, res)
}

const deleteUser = async (req, res) => {
  return deleteUserService(req, res)
}
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
